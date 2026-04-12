#!/usr/bin/env python3
"""
=============================================================
  BUSINESS OUTREACH AUTOMATOR v2.0 - Romania
  Gaseste afaceri fara website → trimite WhatsApp + Email
=============================================================

Utilizare:
  python main.py                          # Campanie completa (WA + email)
  python main.py --whatsapp-only          # Doar WhatsApp (recomandat pentru inceput)
  python main.py --email-only             # Doar email
  python main.py --dry-run                # Simuleaza fara a trimite
  python main.py --preview 5              # Preview 5 mesaje WA generate
  python main.py --preview-email 5        # Preview 5 emailuri generate
  python main.py --stats                  # Statistici zilnice
  python main.py --find-only              # Doar gaseste leads, nu trimite nimic
  python main.py --city "Câmpia Turzii" --category beauty_salon
  python main.py --small-cities-only      # Doar localitati mici (concurenta zero!)
"""

import os
import sys
import json
import time
import logging
import argparse
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from colorama import Fore, Style, init as colorama_init

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from find_businesses import (
    find_all_targets, find_businesses_without_website,
    save_leads_to_csv, SMALL_CITIES, HIGH_CONVERSION_CATEGORIES
)
from find_emails import enrich_leads_with_emails
from generate_email import generate_email, preview_email
from generate_whatsapp import generate_whatsapp_batch, export_whatsapp_campaign, print_whatsapp_preview
from send_email import send_campaign, print_daily_stats, get_emails_sent_today

load_dotenv()
colorama_init()

Path("logs").mkdir(exist_ok=True)
Path("data").mkdir(exist_ok=True)

log_file = f"logs/campaign_{datetime.now().strftime('%Y-%m-%d')}.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

MAX_EMAILS_PER_DAY = int(os.getenv("MAX_EMAILS_PER_DAY", "150"))


def print_banner():
    print(f"""
{Fore.CYAN}╔══════════════════════════════════════════════════════════╗
║   BUSINESS OUTREACH AUTOMATOR v2.0 - Romania             ║
║   Gaseste afaceri fara website → WhatsApp + Email        ║
╚══════════════════════════════════════════════════════════╝{Style.RESET_ALL}
""")


def run_whatsapp_campaign(city: str = None, category: str = None,
                           small_cities_only: bool = False,
                           dry_run: bool = False) -> dict:
    """
    Campanie WhatsApp:
    1. Gaseste afaceri fara website
    2. Genereaza mesaje personalizate cu Claude
    3. Exporta CSV cu link-uri directe wa.me + mesaje gata de copiat

    WHY WHATSAPP FIRST:
    - Email lipseste din Google Places in 95% din cazuri
    - WhatsApp are 98% rata de deschidere
    - Proprietarii de afaceri mici verifica WA de zeci de ori pe zi
    - Mesajele scurte par mai umane decat emailurile
    """
    start_time = time.time()
    report = {"mode": "whatsapp", "leads_found": 0, "messages_generated": 0,
              "exported_file": "", "duration_seconds": 0}

    print(f"\n{Fore.YELLOW}[1/3] Cautam afaceri fara website...{Style.RESET_ALL}")

    if city and category:
        leads = find_businesses_without_website(city, category, max_results=50)
    elif small_cities_only:
        # Doar localitati mici - concurenta zero
        small_city_list = list(SMALL_CITIES.keys())[:20]  # primele 20
        cats_env = os.getenv("TARGET_CATEGORIES", ",".join(HIGH_CONVERSION_CATEGORIES[:3]))
        categories = [c.strip() for c in cats_env.split(",")]
        leads = find_all_targets(
            cities=small_city_list,
            categories=categories,
            include_small_cities=False,  # deja sunt mici
            max_per_city_category=10,
        )
    else:
        leads = find_all_targets(
            include_small_cities=True,
            priority_small_cities=True,  # orase mici primele
            max_per_city_category=15,
        )

    # Filtram doar lead-urile cu numar de telefon valid pentru WA
    leads_with_phone = [l for l in leads if l.get("whatsapp_link")]
    report["leads_found"] = len(leads_with_phone)

    if not leads_with_phone:
        logger.warning("Nu s-au gasit leads cu telefon. Verifica API key-ul Google Places.")
        return report

    # Salvam leads brute
    save_leads_to_csv(leads_with_phone, "data/leads_raw.csv")
    logger.info(f"Leads cu WhatsApp disponibil: {len(leads_with_phone)}")

    print(f"\n{Fore.YELLOW}[2/3] Generăm mesaje WhatsApp personalizate cu Claude...{Style.RESET_ALL}")

    if not dry_run:
        leads_with_messages = generate_whatsapp_batch(leads_with_phone)
        report["messages_generated"] = len([l for l in leads_with_messages if l.get("whatsapp_message")])
    else:
        # Dry run: generam doar primul mesaj ca demo
        print(f"{Fore.YELLOW}  [DRY RUN] Generez 1 mesaj demo...{Style.RESET_ALL}")
        from generate_whatsapp import generate_whatsapp_message
        leads_with_phone[0]["whatsapp_message"] = generate_whatsapp_message(leads_with_phone[0])
        leads_with_messages = leads_with_phone
        report["messages_generated"] = 1

    print(f"\n{Fore.YELLOW}[3/3] Exportam campania WhatsApp...{Style.RESET_ALL}")

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    csv_path = f"data/whatsapp_campaign_{timestamp}.csv"
    export_whatsapp_campaign(leads_with_messages, csv_path)
    report["exported_file"] = csv_path

    report["duration_seconds"] = round(time.time() - start_time)

    # Afisam primele 3 lead-uri ca preview
    print(f"\n{Fore.CYAN}=== PREVIEW (primele 3 lead-uri) ==={Style.RESET_ALL}")
    for lead in leads_with_messages[:3]:
        print_whatsapp_preview(lead)

    print(f"""
{Fore.GREEN}╔══════════════════════════════════════════════╗
║        CAMPANIE WHATSAPP GATA! ✓             ║
╠══════════════════════════════════════════════╣
║  Leads cu WhatsApp:  {str(report['leads_found']).rjust(21)} ║
║  Mesaje generate:    {str(report['messages_generated']).rjust(21)} ║
║  Fisier exportat:    {'OK'.rjust(21)} ║
║  Durata:             {f"{report['duration_seconds']}s".rjust(21)} ║
╚══════════════════════════════════════════════╝{Style.RESET_ALL}

{Fore.YELLOW}PASUL URMATOR:{Style.RESET_ALL}
  1. Deschide: {Fore.CYAN}{csv_path}{Style.RESET_ALL}
  2. Click pe "Link WhatsApp" pentru fiecare lead
  3. Copiaza "Mesaj WA" si trimite
  4. Noteaza raspunsurile in coloana "Raspuns"
  5. Trimite 15-20 mesaje/zi (nu mai mult - WhatsApp poate restricta)

{Fore.GREEN}SFAT: Incepe cu orasele mici - proprietarii sunt mai receptivi!{Style.RESET_ALL}
""")

    return report


def run_full_campaign(dry_run: bool = False, city: str = None,
                      category: str = None, whatsapp_only: bool = False,
                      email_only: bool = False) -> dict:
    """Campanie completa: WhatsApp + Email."""
    start_time = time.time()
    report = {
        "date": datetime.now().isoformat(),
        "leads_found": 0, "wa_messages": 0,
        "emails_found": 0, "emails_sent": 0, "emails_failed": 0,
        "duration_seconds": 0,
    }

    # ── GASIM LEADS ──
    print(f"\n{Fore.YELLOW}[1] Cautam afaceri fara website...{Style.RESET_ALL}")
    if city and category:
        leads = find_businesses_without_website(city, category, max_results=50)
    else:
        leads = find_all_targets(include_small_cities=True, priority_small_cities=True, max_per_city_category=15)

    leads_with_phone = [l for l in leads if l.get("whatsapp_link")]
    report["leads_found"] = len(leads_with_phone)

    if not leads_with_phone:
        logger.warning("Nu s-au gasit leads.")
        return report

    save_leads_to_csv(leads_with_phone, "data/leads_raw.csv")

    # ── WHATSAPP ──
    if not email_only:
        print(f"\n{Fore.YELLOW}[2] Generăm mesaje WhatsApp...{Style.RESET_ALL}")
        if not dry_run:
            leads_with_phone = generate_whatsapp_batch(leads_with_phone)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        export_whatsapp_campaign(leads_with_phone, f"data/whatsapp_{timestamp}.csv")
        report["wa_messages"] = len([l for l in leads_with_phone if l.get("whatsapp_message")])

    # ── EMAIL ──
    if not whatsapp_only:
        sent_today = get_emails_sent_today()
        remaining = MAX_EMAILS_PER_DAY - sent_today

        if remaining > 0:
            print(f"\n{Fore.YELLOW}[3] Cautam emailuri de contact...{Style.RESET_ALL}")
            leads_with_emails = enrich_leads_with_emails(leads_with_phone, max_leads=remaining)
            leads_with_contact = [l for l in leads_with_emails if l.get("contact_email")]
            report["emails_found"] = len(leads_with_contact)

            if leads_with_contact:
                save_leads_to_csv(leads_with_contact, "data/leads_with_email.csv")

                print(f"\n{Fore.YELLOW}[4] Generăm emailuri personalizate...{Style.RESET_ALL}")
                for i, lead in enumerate(leads_with_contact):
                    try:
                        lead["generated_email"] = generate_email(lead)
                        logger.info(f"  [{i+1}/{len(leads_with_contact)}] {lead['name']} ✓")
                        time.sleep(1)
                    except Exception as e:
                        logger.error(f"Eroare email {lead.get('name')}: {e}")
                        lead["generated_email"] = {}

                print(f"\n{Fore.YELLOW}[5] {'[DRY RUN] ' if dry_run else ''}Trimitere emailuri...{Style.RESET_ALL}")
                send_report = send_campaign(leads_with_contact, dry_run=dry_run)
                report["emails_sent"] = send_report["sent"]
                report["emails_failed"] = send_report["failed"]

    report["duration_seconds"] = round(time.time() - start_time)

    # Raport final
    print(f"""
{Fore.CYAN}╔══════════════════════════════════════╗
║          RAPORT CAMPANIE             ║
╠══════════════════════════════════════╣
║  Leads gasite:       {str(report['leads_found']).rjust(13)} ║
║  Mesaje WA:          {str(report['wa_messages']).rjust(13)} ║
║  Emailuri gasite:    {str(report['emails_found']).rjust(13)} ║
║  Emailuri trimise:   {str(report['emails_sent']).rjust(13)} ║
║  Durata:             {f"{report['duration_seconds']}s".rjust(13)} ║
╚══════════════════════════════════════╝{Style.RESET_ALL}
""")

    report_path = f"data/report_{datetime.now().strftime('%Y-%m-%d_%H-%M')}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    return report


def run_preview_whatsapp(count: int = 5):
    """Genereaza si afiseaza preview mesaje WhatsApp."""
    print(f"\n{Fore.CYAN}Preview {count} mesaje WhatsApp:{Style.RESET_ALL}")

    from generate_whatsapp import generate_whatsapp_message

    samples = [
        {"name": "Salon Beauty Queen", "category": "beauty_salon",
         "category_label": "Salon de Înfrumusețare", "city": "Câmpia Turzii",
         "phone": "+40721123456", "rating": 4.3, "reviews_count": 47, "is_small_city": True},
        {"name": "Pensiunea La Cetate", "category": "lodging",
         "category_label": "Hotel/Pensiune", "city": "Sighișoara",
         "phone": "+40265777888", "rating": 4.6, "reviews_count": 203, "is_small_city": False},
        {"name": "Service Auto Expert", "category": "car_repair",
         "category_label": "Service Auto", "city": "Reghin",
         "phone": "+40265444555", "rating": 4.1, "reviews_count": 28, "is_small_city": True},
        {"name": "Frizerie Toni", "category": "hair_care",
         "category_label": "Frizerie/Coafor", "city": "Huedin",
         "phone": "+40733222111", "rating": 4.5, "reviews_count": 62, "is_small_city": True},
        {"name": "Brutăria Pâinea Caldă", "category": "bakery",
         "category_label": "Brutărie/Patiserie", "city": "Sebeș",
         "phone": "+40258111222", "rating": 4.7, "reviews_count": 89, "is_small_city": True},
    ]

    for i, biz in enumerate(samples[:count]):
        biz["whatsapp_link"] = f"https://wa.me/40{'7' + str(i) * 8}"
        msg = generate_whatsapp_message(biz, variant=i % 4)
        biz["whatsapp_message"] = msg
        print_whatsapp_preview(biz)
        time.sleep(0.5)


def main():
    parser = argparse.ArgumentParser(
        description="Business Outreach Automator v2.0 - Romania",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("--dry-run", action="store_true", help="Simuleaza fara a trimite")
    parser.add_argument("--whatsapp-only", action="store_true", help="Doar campanie WhatsApp (recomandat)")
    parser.add_argument("--email-only", action="store_true", help="Doar campanie email")
    parser.add_argument("--small-cities-only", action="store_true", help="Doar localitati mici")
    parser.add_argument("--preview", type=int, metavar="N", default=0, help="Preview N mesaje WhatsApp")
    parser.add_argument("--preview-email", type=int, metavar="N", default=0, help="Preview N emailuri")
    parser.add_argument("--stats", action="store_true", help="Statistici zilnice")
    parser.add_argument("--find-only", action="store_true", help="Doar gaseste leads")
    parser.add_argument("--city", type=str, default=None, help="Localitate specifica")
    parser.add_argument("--category", type=str, default=None, help="Categorie specifica")

    args = parser.parse_args()
    print_banner()

    if args.stats:
        print_daily_stats()
        return

    if args.preview:
        run_preview_whatsapp(args.preview)
        return

    if args.preview_email:
        from main import run_preview_email
        run_preview_email(args.preview_email)
        return

    if args.find_only:
        print(f"{Fore.YELLOW}Mod: FIND ONLY{Style.RESET_ALL}")
        if args.city and args.category:
            leads = find_businesses_without_website(args.city, args.category)
        else:
            leads = find_all_targets(include_small_cities=True, priority_small_cities=True)
        save_leads_to_csv(leads, "data/leads_export.csv")
        print(f"\n{Fore.GREEN}Salvat {len(leads)} leads in data/leads_export.csv{Style.RESET_ALL}")
        print(f"  Localitati mici: {sum(1 for l in leads if l.get('is_small_city'))}")
        print(f"  Cu WhatsApp:     {sum(1 for l in leads if l.get('whatsapp_link'))}")
        return

    if args.whatsapp_only or (not args.email_only and os.getenv("DEFAULT_MODE", "whatsapp") == "whatsapp"):
        run_whatsapp_campaign(
            city=args.city,
            category=args.category,
            small_cities_only=args.small_cities_only,
            dry_run=args.dry_run,
        )
    else:
        run_full_campaign(
            dry_run=args.dry_run,
            city=args.city,
            category=args.category,
            whatsapp_only=args.whatsapp_only,
            email_only=args.email_only,
        )


if __name__ == "__main__":
    main()
