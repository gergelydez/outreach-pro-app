"""
Modul pentru gasirea adreselor de email ale afacerilor.

Strategii (in ordine de prioritate):
1. Google Places API returneaza uneori email direct
2. Cauta pe site-ul Facebook al afacerii
3. Cauta pe Google: "numele afacerii" + "email" + oras
4. Extrage din pagina web a afacerii (daca exista)

NOTA: Respecta GDPR - trimite doar catre adrese de business publice.
"""

import os
import re
import logging
import requests
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

EMAIL_REGEX = re.compile(
    r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,7}\b'
)

# Domenii de email de evitat (personale, nu business)
SKIP_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "yahoo.ro", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "me.com", "protonmail.com", "gmx.com",
    "example.com", "test.com",
}

# User agent pentru scraping etic
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BusinessOutreachBot/1.0; +contact@websitultau.ro)",
    "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
}


def is_valid_business_email(email: str) -> bool:
    """Verifica daca emailul e valid si probabil de business."""
    if not email or "@" not in email:
        return False
    domain = email.split("@")[-1].lower()
    return domain not in SKIP_EMAIL_DOMAINS


def extract_emails_from_text(text: str) -> list[str]:
    """Extrage toate adresele de email dintr-un text."""
    found = EMAIL_REGEX.findall(text)
    return [e for e in found if is_valid_business_email(e)]


def find_email_from_google_search(business_name: str, city: str,
                                   phone: str = "") -> str:
    """
    Cauta emailul afacerii pe Google.
    Returneaza primul email de business gasit sau string gol.

    ATENTIE: Google poate bloca request-uri frecvente. Foloseste cu rate limiting.
    """
    query = f'"{business_name}" {city} email contact'
    url = f"https://www.google.com/search?q={quote_plus(query)}&num=5"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            emails = extract_emails_from_text(resp.text)
            if emails:
                logger.debug(f"Email gasit via Google pentru {business_name}: {emails[0]}")
                return emails[0]
    except requests.RequestException as e:
        logger.debug(f"Eroare Google search pentru {business_name}: {e}")

    return ""


def find_email_from_facebook(business_name: str, city: str) -> str:
    """
    Incearca sa gaseasca pagina Facebook a afacerii si sa extraga emailul.
    Returneaza emailul sau string gol.
    """
    query = f'site:facebook.com "{business_name}" {city}'
    url = f"https://www.google.com/search?q={quote_plus(query)}&num=3"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            return ""

        # Cauta link-uri Facebook in rezultate
        fb_links = re.findall(
            r'https://(?:www\.)?facebook\.com/[A-Za-z0-9.\-_/]+',
            resp.text
        )

        for fb_url in fb_links[:2]:  # verificam max 2 pagini FB
            try:
                fb_resp = requests.get(fb_url, headers=HEADERS, timeout=10)
                emails = extract_emails_from_text(fb_resp.text)
                if emails:
                    logger.debug(f"Email gasit pe Facebook pentru {business_name}: {emails[0]}")
                    return emails[0]
            except requests.RequestException:
                continue

    except requests.RequestException as e:
        logger.debug(f"Eroare Facebook search pentru {business_name}: {e}")

    return ""


def find_contact_email(business: dict) -> str:
    """
    Principala functie de gasire email.
    Incearca mai multe strategii si returneaza primul email valid.

    Args:
        business: dict cu name, city, phone, email (din Google Places)

    Returns:
        Adresa de email sau string gol daca nu s-a gasit.
    """
    name = business.get("name", "")
    city = business.get("city", "")

    # 1. Email direct din Google Places (cel mai de incredere)
    places_email = business.get("email", "").strip()
    if places_email and is_valid_business_email(places_email):
        logger.debug(f"Email din Google Places pentru {name}: {places_email}")
        return places_email

    # 2. Cauta via Google Search
    google_email = find_email_from_google_search(name, city)
    if google_email:
        return google_email

    # 3. Cauta pe Facebook
    fb_email = find_email_from_facebook(name, city)
    if fb_email:
        return fb_email

    logger.debug(f"Nu s-a gasit email pentru {name} ({city})")
    return ""


def enrich_leads_with_emails(
    leads: list[dict],
    max_leads: int = None,
) -> list[dict]:
    """
    Adauga adresa de email pentru o lista de leads.
    Leads fara email sunt incluse cu contact_email = '' pentru referinta.

    Args:
        leads: Lista de afaceri din find_businesses.py
        max_leads: Limita optionala de leads de procesat

    Returns:
        Lista de leads cu 'contact_email' adaugat.
    """
    import time
    from tqdm import tqdm

    if max_leads:
        leads = leads[:max_leads]

    enriched = []
    found_count = 0

    for lead in tqdm(leads, desc="Cautam emailuri", unit="afacere"):
        email = find_contact_email(lead)
        lead["contact_email"] = email
        enriched.append(lead)

        if email:
            found_count += 1

        # Rate limiting etic - 2 secunde intre cautari
        time.sleep(2)

    logger.info(f"Emailuri gasite: {found_count}/{len(enriched)}")
    return enriched


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)

    # Test
    test = {
        "name": "Restaurant Crama Ardeleana",
        "city": "Cluj-Napoca",
        "phone": "+40264123456",
        "email": "",
    }
    email = find_contact_email(test)
    print(f"Email gasit: {email or 'nu s-a gasit'}")
