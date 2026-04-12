"""
Genereaza mesaje WhatsApp ultra-scurte si personalizate cu Claude API.
WhatsApp = 98% rata deschidere vs 20% email.
Mesajul trebuie sa para de la om la om, NU bot.

v2.0 - Modul nou, inlocuieste outreach-ul prin email ca prima tinta.
"""

import os
import json
import logging
import anthropic
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

YOUR_NAME      = os.getenv("SENDER_NAME", "Alexandru")
YOUR_WEBSITE   = os.getenv("YOUR_WEBSITE", "https://websitultau.ro")
YOUR_PORTFOLIO = os.getenv("YOUR_PORTFOLIO_URL", "https://portofoliu.websitultau.ro")
YOUR_PHONE     = os.getenv("YOUR_PHONE", "")
PRICE_FROM     = os.getenv("PRICE_FROM", "500")
PRICE_TO       = os.getenv("PRICE_TO", "1500")
DELIVERY_DAYS  = os.getenv("DELIVERY_DAYS", "5")

# Beneficiul PRINCIPAL per categorie (max 1 fraza - WhatsApp e scurt!)
CATEGORY_MAIN_BENEFIT = {
    "restaurant":      "rezervÄƒri online È™i meniu digital",
    "dentist":         "programÄƒri online 24/7 È™i pacienÈ›i noi lunar",
    "beauty_salon":    "rezervÄƒri online È™i galerie cu lucrÄƒrile voastre",
    "car_repair":      "sÄƒ apÄƒreaÈ›i primii pe Google Maps",
    "plumber":         "apeluri urgente din Google cÃ¢nd cineva cautÄƒ instalator",
    "electrician":     "clienÈ›i noi din zona voastrÄƒ prin Google",
    "lawyer":          "clienÈ›i noi care cautÄƒ avocat online",
    "accounting":      "firme noi care cautÄƒ contabil pe Google",
    "lodging":         "rezervÄƒri directe fÄƒrÄƒ comision Booking.com",
    "hair_care":       "rezervÄƒri online È™i mai mulÈ›i clienÈ›i noi",
    "doctor":          "programÄƒri online È™i pacienÈ›i noi lunar",
    "gym":             "abonamente noi È™i vizibilitate online",
    "florist":         "comenzi online pentru nunÈ›i È™i ocazii",
    "bakery":          "comenzi torturi È™i produse online",
    "veterinary_care": "programÄƒri online È™i clienÈ›i noi urgent",
    "photographer":    "portofoliu online È™i cereri de la mirei",
    "moving_company":  "cereri de ofertÄƒ online din zona voastrÄƒ",
    "car_wash":        "clienÈ›i noi care cautÄƒ spÄƒlÄƒtorie pe Google",
    "wedding_venue":   "rezervÄƒri directe pentru evenimente",
    "physiotherapist": "programÄƒri online È™i pacienÈ›i noi",
    "default":         "clienÈ›i noi din Google zilnic",
}

# Mesaje de deschidere variate (rotatie pentru a evita look de spam)
OPENING_VARIANTS = [
    "BunÄƒ ziua! Am observat cÄƒ",
    "Salut! Am vÄƒzut cÄƒ",
    "BunÄƒ! Am gÄƒsit",
    "BunÄƒ ziua,",
]


def generate_whatsapp_message(business: dict, variant: int = 0) -> str:
    """
    Genereaza un mesaj WhatsApp scurt, personalizat cu Claude.

    Args:
        business: dict cu name, category, city, phone, rating, reviews_count
        variant: 0-3, pentru a varia mesajele (evita look de spam)

    Returns:
        String cu mesajul WhatsApp gata de trimis.
    """
    category = business.get("category", "default")
    benefit = CATEGORY_MAIN_BENEFIT.get(category, CATEGORY_MAIN_BENEFIT["default"])
    name = business.get("name", "")
    city = business.get("city", "")
    rating = business.get("rating", 0)
    reviews = business.get("reviews_count", 0)
    is_small = business.get("is_small_city", False)

    rating_mention = ""
    if rating >= 4.0 and reviews >= 15:
        rating_mention = f"AveÈ›i {reviews} recenzii excelente pe Google."
    elif reviews >= 5:
        rating_mention = f"VÄƒ È™tiu de pe Google Maps."

    small_city_angle = ""
    if is_small:
        small_city_angle = f"ÃŽn {city} nu prea existÄƒ concurenÈ›Äƒ online Ã®n domeniu - aveÈ›i avantaj."

    prompt = f"""EÈ™ti un freelancer romÃ¢n care face site-uri pentru afaceri locale.
Scrie un mesaj WhatsApp SCURT È™i NATURAL pentru o afacere care nu are site web.

DATE AFACERE:
- Nume: {name}
- Tip: {business.get('category_label', '')}
- OraÈ™: {city}
- Context: {rating_mention} {small_city_angle}

OFERTÄ‚:
- Faci site-uri profesionale Ã®n {DELIVERY_DAYS} zile
- PreÈ›: {PRICE_FROM}-{PRICE_TO} RON (tot inclus: domeniu, hosting, SEO)
- Beneficiu principal pentru ei: {benefit}
- Portofoliu: {YOUR_PORTFOLIO}

REGULI STRICTE:
1. MAX 4 rÃ¢nduri scurte (mesaj WhatsApp, nu email!)
2. SunÄƒ uman, de la om la om - NU ca un bot sau template
3. MenÈ›ioneazÄƒ numele afacerii o singurÄƒ datÄƒ
4. Include o Ã®ntrebare simplÄƒ la sfÃ¢rÈ™it (nu un CTA agresiv)
5. FÄƒrÄƒ emoji excesiv (max 1-2)
6. FÄƒrÄƒ "Stimate", "Va contactez", "Sper cÄƒ eÈ™ti bine"
7. FÄƒrÄƒ bullet points sau liste
8. SemneazÄƒ cu "{YOUR_NAME}" la final, simplu
9. Varianta {variant + 1}/4 - stilul poate fi uÈ™or diferit ca ton

ReturneazÄƒ DOAR mesajul, fÄƒrÄƒ explicaÈ›ii, fÄƒrÄƒ ghilimele."""

    try:
        message = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        msg = message.content[0].text.strip()
        logger.info(f"Mesaj WA generat pentru: {name}")
        return msg

    except Exception as e:
        logger.error(f"Eroare generare mesaj WA pentru {name}: {e}")
        return _fallback_whatsapp_message(business, benefit)


def _fallback_whatsapp_message(business: dict, benefit: str) -> str:
    """Template fallback daca Claude API nu e disponibil."""
    name = business.get("name", "afacerea voastrÄƒ")
    city = business.get("city", "")
    return (
        f"BunÄƒ ziua! Am vÄƒzut cÄƒ {name} din {city} nu are site web.\n\n"
        f"Fac site-uri profesionale pentru {business.get('category_label', 'afaceri locale').lower()} "
        f"Ã®n {DELIVERY_DAYS} zile, preÈ› fix {PRICE_FROM} RON (domeniu + hosting incluse).\n\n"
        f"Beneficiu principal: {benefit}.\n\n"
        f"VÄƒ intereseazÄƒ cÃ¢teva exemple? {YOUR_PORTFOLIO}\n\n"
        f"{YOUR_NAME}"
    )


def generate_whatsapp_batch(leads: list[dict]) -> list[dict]:
    """
    Adauga mesaj WhatsApp personalizat pentru fiecare lead.
    Variaza mesajele pentru a evita pattern-ul de spam.
    """
    import time
    enriched = []

    for i, lead in enumerate(leads):
        variant = i % 4  # roteaza 4 variante de mesaj
        msg = generate_whatsapp_message(lead, variant=variant)
        lead["whatsapp_message"] = msg
        enriched.append(lead)
        logger.info(f"  [{i+1}/{len(leads)}] {lead['name']} âœ“")
        time.sleep(0.8)  # rate limiting

    return enriched


def export_whatsapp_campaign(leads: list[dict], filepath: str = "data/whatsapp_campaign.csv") -> str:
    """
    Exporta campania WhatsApp intr-un CSV cu toate datele necesare.
    Coloane: nume, telefon, link WA direct, mesaj gata de copiat.
    """
    import pandas as pd
    import os

    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    rows = []
    for lead in leads:
        if not lead.get("whatsapp_link"):
            continue
        rows.append({
            "Nume afacere":    lead.get("name", ""),
            "Oras":            lead.get("city", ""),
            "Oras mic":        "DA" if lead.get("is_small_city") else "NU",
            "Tip":             lead.get("category_label", ""),
            "Telefon":         lead.get("phone", ""),
            "Link WhatsApp":   lead.get("whatsapp_link", ""),
            "Rating Google":   lead.get("rating", ""),
            "Nr recenzii":     lead.get("reviews_count", ""),
            "Mesaj WA":        lead.get("whatsapp_message", ""),
            "Trimis":          "",  # bifezi manual dupa trimitere
            "Raspuns":         "",  # notezi raspunsul
            "Status":          "",  # interesat/nu/urmÄƒrire
        })

    df = pd.DataFrame(rows)
    df.to_csv(filepath, index=False, encoding="utf-8-sig")
    logger.info(f"Campanie WhatsApp: {len(rows)} leads salvate in {filepath}")
    return filepath


def print_whatsapp_preview(lead: dict) -> None:
    """Afiseaza preview mesaj WhatsApp in terminal."""
    from colorama import Fore, Style, init
    init()

    msg = lead.get("whatsapp_message", generate_whatsapp_message(lead))

    print(f"\n{Fore.CYAN}{'='*55}{Style.RESET_ALL}")
    print(f"{Fore.YELLOW}ðŸ“± {lead['name']} | {lead['city']}{Style.RESET_ALL}")
    print(f"{Fore.GREEN}ðŸ“ž {lead['phone']}{Style.RESET_ALL}")
    print(f"{Fore.BLUE}ðŸ”— {lead.get('whatsapp_link', 'N/A')}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'-'*55}{Style.RESET_ALL}")
    print(msg)
    print(f"{Fore.CYAN}{'='*55}{Style.RESET_ALL}\n")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    test_lead = {
        "name": "Salon Beauty Queen",
        "category": "beauty_salon",
        "category_label": "Salon de ÃŽnfrumuseÈ›are",
        "city": "CÃ¢mpia Turzii",
        "phone": "+40721123456",
        "phone_intl": "40721123456",
        "whatsapp_link": "https://wa.me/40721123456",
        "rating": 4.3,
        "reviews_count": 47,
        "is_small_city": True,
    }

    print("\n=== TEST MESAJ WHATSAPP ===")
    for v in range(4):
        print(f"\n--- Varianta {v+1} ---")
        msg = generate_whatsapp_message(test_lead, variant=v)
        print(msg)
