"""
Modul pentru trimiterea emailurilor via Gmail SMTP.
Include: rate limiting, logging, tracking, retry logic.
"""

import os
import time
import smtplib
import logging
import csv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SENDER_EMAIL        = os.getenv("SENDER_EMAIL")
SENDER_APP_PASSWORD = os.getenv("SENDER_APP_PASSWORD")
SENDER_NAME         = os.getenv("SENDER_NAME", "")
EMAIL_DELAY_SECONDS = int(os.getenv("EMAIL_DELAY_SECONDS", "45"))
MAX_EMAILS_PER_DAY  = int(os.getenv("MAX_EMAILS_PER_DAY", "150"))

SENT_LOG_PATH = "data/sent_log.csv"
SENT_LOG_HEADERS = ["timestamp", "place_id", "business_name", "city", "category",
                    "recipient_email", "subject", "status", "error"]


def _ensure_log_file():
    """Creeaza fisierul de log daca nu exista."""
    Path("data").mkdir(exist_ok=True)
    if not Path(SENT_LOG_PATH).exists():
        with open(SENT_LOG_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=SENT_LOG_HEADERS)
            writer.writeheader()


def _log_sent(business: dict, email: str, subject: str,
              status: str, error: str = ""):
    """Inregistreaza emailul trimis in fisierul de log."""
    _ensure_log_file()
    row = {
        "timestamp":      datetime.now().isoformat(),
        "place_id":       business.get("place_id", ""),
        "business_name":  business.get("name", ""),
        "city":           business.get("city", ""),
        "category":       business.get("category", ""),
        "recipient_email": email,
        "subject":        subject,
        "status":         status,
        "error":          error,
    }
    with open(SENT_LOG_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SENT_LOG_HEADERS)
        writer.writerow(row)


def get_already_contacted_ids() -> set:
    """Returneaza multimea place_id-urilor deja contactate."""
    _ensure_log_file()
    contacted = set()
    try:
        with open(SENT_LOG_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("status") == "sent":
                    contacted.add(row["place_id"])
    except Exception:
        pass
    return contacted


def get_emails_sent_today() -> int:
    """Numara emailurile trimise astazi."""
    _ensure_log_file()
    today = datetime.now().strftime("%Y-%m-%d")
    count = 0
    try:
        with open(SENT_LOG_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("status") == "sent" and row.get("timestamp", "").startswith(today):
                    count += 1
    except Exception:
        pass
    return count


def send_single_email(
    recipient_email: str,
    subject: str,
    body: str,
    business: dict,
    dry_run: bool = False,
) -> bool:
    """
    Trimite un singur email.

    Args:
        recipient_email: Adresa destinatar
        subject: Subiectul emailului
        body: Corpul emailului (text plain)
        business: Dict cu datele afacerii (pentru logging)
        dry_run: Daca True, simuleaza trimiterea fara a trimite efectiv

    Returns:
        True daca s-a trimis cu succes, False altfel
    """
    if dry_run:
        logger.info(f"[DRY RUN] Ar trimite catre {recipient_email}: {subject}")
        _log_sent(business, recipient_email, subject, "dry_run")
        return True

    if not SENDER_EMAIL or not SENDER_APP_PASSWORD:
        logger.error("SENDER_EMAIL sau SENDER_APP_PASSWORD nu sunt configurate in .env")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{SENDER_NAME} <{SENDER_EMAIL}>" if SENDER_NAME else SENDER_EMAIL
    msg["To"]      = recipient_email

    # Text plain (mai putin probabil sa fie spam decat HTML)
    text_part = MIMEText(body, "plain", "utf-8")
    msg.attach(text_part)

    for attempt in range(1, 4):  # max 3 incercari
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as server:
                server.login(SENDER_EMAIL, SENDER_APP_PASSWORD)
                server.send_message(msg)

            logger.info(f"[TRIMIS] {business.get('name')} | {recipient_email} | {subject[:50]}")
            _log_sent(business, recipient_email, subject, "sent")
            return True

        except smtplib.SMTPException as e:
            err = str(e)
            logger.warning(f"Incercare {attempt}/3 esuata pentru {recipient_email}: {err}")
            if attempt < 3:
                time.sleep(5 * attempt)

    _log_sent(business, recipient_email, subject, "failed", err)
    return False


def send_campaign(
    leads_with_emails: list[dict],
    dry_run: bool = False,
) -> dict:
    """
    Trimite campania de emailuri pentru o lista de leads.

    Fiecare element din leads_with_emails trebuie sa contina:
    - toate datele din find_businesses.py
    - 'generated_email': {'subject': ..., 'body': ...}
    - 'contact_email': adresa de email a destinatarului

    Returns:
        Raport: {'sent': N, 'skipped': N, 'failed': N, 'limit_reached': bool}
    """
    already_contacted = get_already_contacted_ids()
    emails_today      = get_emails_sent_today()

    report = {"sent": 0, "skipped": 0, "failed": 0, "limit_reached": False}

    for lead in leads_with_emails:
        # Verificam limita zilnica
        if emails_today + report["sent"] >= MAX_EMAILS_PER_DAY:
            logger.warning(f"Limita zilnica de {MAX_EMAILS_PER_DAY} emailuri atinsa. Oprire.")
            report["limit_reached"] = True
            break

        place_id = lead.get("place_id", "")
        contact_email = lead.get("contact_email", "").strip()
        generated = lead.get("generated_email", {})

        # Skip daca lipsesc datele necesare
        if not contact_email or not generated.get("subject") or not generated.get("body"):
            logger.debug(f"Skip {lead.get('name')}: lipsa email sau continut generat")
            report["skipped"] += 1
            continue

        # Skip daca am mai contactat aceasta afacere
        if place_id and place_id in already_contacted:
            logger.debug(f"Skip {lead.get('name')}: deja contactat")
            report["skipped"] += 1
            continue

        success = send_single_email(
            recipient_email=contact_email,
            subject=generated["subject"],
            body=generated["body"],
            business=lead,
            dry_run=dry_run,
        )

        if success:
            report["sent"] += 1
            already_contacted.add(place_id)
            if not dry_run:
                # Delay anti-spam intre emailuri
                logger.debug(f"Astept {EMAIL_DELAY_SECONDS}s inainte de urmatorul email...")
                time.sleep(EMAIL_DELAY_SECONDS)
        else:
            report["failed"] += 1

    return report


def print_daily_stats():
    """Afiseaza statistici pentru emailurile trimise azi."""
    from colorama import Fore, Style, init
    init()

    _ensure_log_file()
    today = datetime.now().strftime("%Y-%m-%d")
    today_rows = []

    try:
        with open(SENT_LOG_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("timestamp", "").startswith(today):
                    today_rows.append(row)
    except Exception:
        pass

    sent    = sum(1 for r in today_rows if r["status"] == "sent")
    failed  = sum(1 for r in today_rows if r["status"] == "failed")
    dry_run = sum(1 for r in today_rows if r["status"] == "dry_run")

    print(f"\n{Fore.CYAN}=== STATISTICI AZI ({today}) ==={Style.RESET_ALL}")
    print(f"  {Fore.GREEN}Trimise:   {sent}{Style.RESET_ALL}")
    print(f"  {Fore.YELLOW}Dry-run:   {dry_run}{Style.RESET_ALL}")
    print(f"  {Fore.RED}Esuate:    {failed}{Style.RESET_ALL}")
    print(f"  Total log: {len(today_rows)}")
    print(f"  Limita zi: {MAX_EMAILS_PER_DAY}")
    print(f"  Ramasite:  {max(0, MAX_EMAILS_PER_DAY - sent)}")
    print()
