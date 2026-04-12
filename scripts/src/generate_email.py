"""
Genereaza emailuri de outreach ultra-personalizate folosind Claude API.
Fiecare email e unic, adaptat la tipul afacerii, oras si context local.
"""

import os
import logging
import anthropic
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

YOUR_NAME    = os.getenv("SENDER_NAME", "Alexandru")
YOUR_WEBSITE = os.getenv("YOUR_WEBSITE", "https://websitultau.ro")
YOUR_PORTFOLIO = os.getenv("YOUR_PORTFOLIO_URL", "https://portofoliu.websitultau.ro")
EMAIL_LANGUAGE = os.getenv("EMAIL_LANGUAGE", "ro")

# Mesaje de durere/beneficiu per categorie - folosite ca context pentru Claude
CATEGORY_PAIN_POINTS = {
    "restaurant": {
        "pain": "clientii nu va gasesc pe Google Maps / nu pot vedea meniul online / nu pot rezerva o masa",
        "gain": "mai multe rezervari online, meniu digital, prezenta pe Google si TripAdvisor",
        "hook": "72% din oameni cauta restaurante online inainte sa iasa din casa",
        "urgency": "in weekend-urile aglomerate, restaurantele cu site primesc cu 40% mai multe rezervari",
    },
    "dentist": {
        "pain": "pacientii noi nu va gasesc, merg la competitia care are site modern",
        "gain": "programari online 24/7, imagine profesionala, pacienti noi in fiecare luna",
        "hook": "85% din pacienti verifica online inainte de a alege un stomatolog",
        "urgency": "cabinetele cu site primesc in medie 8-12 programari noi pe luna din online",
    },
    "beauty_salon": {
        "pain": "clientii va cauta pe Instagram dar nu gasesc orarul, preturile sau o modalitate sa rezerve",
        "gain": "programari online, galerie foto cu lucrarile tale, mai putine telefoane de rezervare",
        "hook": "femeile cauta saloane pe Google inainte, nu in cartea de telefoane",
        "urgency": "salonul de langa tine are deja site si apare primul in cautari",
    },
    "car_repair": {
        "pain": "cand masina se strica, oamenii cauta urgent pe Google - daca nu esti acolo, mergi la concurenta",
        "gain": "clienti noi organic din Google, lista de servicii si preturi, credibilitate",
        "hook": "'service auto + [orasul tau]' e cautat de mii de ori pe luna",
        "urgency": "service-urile cu site apar primele in Google Maps si primesc 3x mai multe apeluri",
    },
    "plumber": {
        "pain": "cand tevi se sparg la ora 10 noaptea, clientul cauta pe Google - nu in agenda",
        "gain": "apeluri urgente non-stop, zona de acoperire clara, recenzii verificate",
        "hook": "'instalator urgenta [oras]' e una dintre cele mai cautate fraze locale",
        "urgency": "instalatorii cu site sunt contactati de 4x mai multi clienti noi lunar",
    },
    "electrician": {
        "pain": "clientii nu stiu ce servicii oferi, la ce preturi si daca esti disponibil",
        "gain": "lead-uri noi zilnic, portofoliu de lucrari, zona de activitate",
        "hook": "cautarile pentru electricieni locali au crescut cu 60% in ultimii 2 ani",
        "urgency": "fara site, esti invizibil pentru 90% din clientii potentiali din zona ta",
    },
    "lawyer": {
        "pain": "clientii cauta avocati pe Google, nu din gura in gura - daca nu ai site, pierzi clienti in fiecare zi",
        "gain": "consultanta online, credibilitate profesionala, clienti noi din zona ta",
        "hook": "68% din romani cauta avocati online inainte de primul contact",
        "urgency": "cabinetele cu site obtin 5-10 consultante noi pe luna doar din prezenta online",
    },
    "accounting": {
        "pain": "firmele tinere cauta contabili pe Google - fara site, nu existi pentru ei",
        "gain": "clienti noi lunar, imagine profesionala, formulare de contact si intrebare",
        "hook": "startup-urile si firmele noi isi cauta contabilul exclusiv online",
        "urgency": "sezonul declaratiilor e acum - firmele isi cauta contabili chiar in aceasta perioada",
    },
    "lodging": {
        "pain": "turistii rezerva pe Booking.com si platesti comision mare - un site propriu te scapa de asta",
        "gain": "rezervari directe fara comision, galerie foto profesionala, pachete speciale",
        "hook": "20-30% discount pe comisioane Booking daca ai site propriu si rezervari directe",
        "urgency": "sezonul turistic se apropie - turistii isi planifica vacantele chiar acum",
    },
    "hair_care": {
        "pain": "clientii vin la recomandare, dar rata de clienti noi e mica fara prezenta online",
        "gain": "rezervari online, galerie cu stiluri, fidelizare clienti existenti",
        "hook": "salonul cu site apare in top 3 Google Maps cand cineva cauta 'coafor [orasul tau]'",
        "urgency": "pozitia in Google se construieste in timp - cu cat incepi mai devreme, cu atat esti mai sus",
    },
    "doctor": {
        "pain": "pacientii noi nu stiu ce specialitati oferi, programul sau cum te contacteaza",
        "gain": "programari online, lista de servicii, credibilitate si incredere",
        "hook": "90% din pacienti cauta online informatii despre medic inainte de prima vizita",
        "urgency": "cabinetele cu site profesional sunt percepute ca mai competente si mai organizate",
    },
    "gym": {
        "pain": "oamenii cauta sali de sport pe Google - fara site, mergi la sala de langa care apare online",
        "gain": "abonamente online, program clase, galerie echipamente si spatiu",
        "hook": "ianuarie si septembrie = varful cautarilor pentru sali de sport",
        "urgency": "competitia ta e deja online - fiecare zi fara site e o zi cu clienti pierduti",
    },
    "florist": {
        "pain": "de Valentines, 8 Martie si nunti, oamenii comanda flori online - tu esti acolo?",
        "gain": "comenzi online, catalog produse, livrare in oras",
        "hook": "florile sunt unul dintre cele mai cumparate cadouri online in Romania",
        "urgency": "8 Martie si sezoanele de nunti aduc cel mai mult trafic online pentru florarii",
    },
    "bakery": {
        "pain": "comenzile de tort pentru evenimente se fac tot mai mult online, nu telefonic",
        "gain": "comenzi torturi aniversare si evenimente, catalog produse, program",
        "hook": "cautarile pentru 'tort comanda [oras]' sunt in continua crestere",
        "urgency": "sezoanele de communioane si nunti sunt aproape - comenzile vin online",
    },
    "default": {
        "pain": "clientii potentiali nu te pot gasi online si merg la competitia care are prezenta web",
        "gain": "vizibilitate online 24/7, clienti noi in fiecare luna, imagine profesionala",
        "hook": "97% din consumatori cauta servicii locale pe internet inainte sa cumpere",
        "urgency": "fiecare zi fara website e o zi in care clientii merg la competitia ta",
    },
}


def _get_pain_context(category: str) -> dict:
    return CATEGORY_PAIN_POINTS.get(category, CATEGORY_PAIN_POINTS["default"])


def generate_email(business: dict) -> dict:
    """
    Genereaza un email de vanzare complet personalizat pentru o afacere.

    Args:
        business: dict cu name, category, city, phone, address, rating, reviews_count

    Returns:
        dict cu 'subject' si 'body' ale emailului generat.
    """
    ctx = _get_pain_context(business.get("category", "default"))
    category_label = business.get("category_label", "afacerea ta")
    city = business.get("city", "")
    biz_name = business.get("name", "")
    rating = business.get("rating", 0)
    reviews = business.get("reviews_count", 0)

    rating_context = ""
    if rating >= 4.0 and reviews >= 10:
        rating_context = f"Vad ca aveti {reviews} recenzii cu o medie de {rating} stele pe Google - felicitari, clientii va apreciaza mult! Tocmai de aceea meritati o prezenta online pe masura acestei reputatii."
    elif rating > 0:
        rating_context = f"Va gasesc pe Google Maps, dar fara un website care sa va reprezinte cu adevarat."

    language_instruction = (
        "Scrie EXCLUSIV in limba romana, folosind 'voi' (forma de politete)."
        if EMAIL_LANGUAGE == "ro"
        else "Write EXCLUSIVELY in English."
    )

    prompt = f"""Esti un expert in marketing digital si copywriting de vanzari pentru IMM-uri din Romania.
Sarcina ta: scrie un email de cold outreach EXTREM DE CAPTIVANT si PERSUASIV catre o afacere locala care nu are website.

DATELE AFACERII:
- Nume: {biz_name}
- Tip: {category_label}
- Oras: {city}
- Context recenzii: {rating_context or 'Nu am detalii despre recenzii.'}

CONTEXT DE VANZARE:
- Problema lor principala: {ctx['pain']}
- Ce castiga cu un website: {ctx['gain']}
- Statistici relevante: {ctx['hook']}
- Urgenta: {ctx['urgency']}

OFERTA TA:
- Construiesti website-uri profesionale rapid (1-3 zile)
- Pret accesibil (500-2000 RON in functie de complexitate)
- Domeniu .ro inclus primul an
- Hosting inclus primul an
- Optimizare Google inclusa (SEO de baza)
- Suport tehnic inclus 3 luni
- Portfolio: {YOUR_PORTFOLIO}
- Contact/site propriu: {YOUR_WEBSITE}

{language_instruction}

REGULI STRICTE PENTRU EMAIL:
1. Subject line: MAX 8 cuvinte, intrigant, specific pentru {biz_name} - NU generic
2. Deschidere: Incepe cu o observatie/compliment SPECIFIC despre afacerea lor (nu generic)
3. Problema: 2-3 randuri care descriu exact ce pierd ei fara website (foloseste statistica relevanta)
4. Solutia: Prezinta oferta ta clar, cu beneficii concrete, nu features tehnice
5. Proba sociala: Mentioneaza ca ai construit site-uri pentru alte afaceri similare din zona
6. CTA: O singura actiune clara - "Raspundeti la acest email" sau "Sunati la [placeholder telefon]"
7. Ton: Prietenos, direct, de la om la om - NU corporatist, NU template evident
8. Lungime: MAX 200 cuvinte in body - scurt si puternic
9. NU folosi: "Stimate", "Va contactez pentru a va oferi", "Sper ca sunteti bine"
10. Personalizeaza cu numele afacerii de minim 2 ori

Returneaza EXACT in formatul JSON urmator (fara alt text):
{{
  "subject": "subiectul emailului",
  "body": "corpul emailului complet, cu salut si semnatura inclusa"
}}

Semneaza cu:
{YOUR_NAME}
{YOUR_WEBSITE}
"""

    try:
        message = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text.strip()

        # Curatam JSON-ul in caz ca Claude a adaugat markdown
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        import json
        result = json.loads(raw)
        logger.info(f"Email generat pentru: {biz_name} | Subject: {result['subject']}")
        return result

    except Exception as e:
        logger.error(f"Eroare generare email pentru {biz_name}: {e}")
        # Fallback la template de baza daca Claude nu raspunde
        return _fallback_template(business, ctx)


def _fallback_template(business: dict, ctx: dict) -> dict:
    """Template de rezerva daca Claude API nu e disponibil."""
    name = business.get("name", "")
    city = business.get("city", "")
    cat  = business.get("category_label", "afacere")

    subject = f"{name} - va asteapta clienti noi online"
    body = f"""Buna ziua,

Am observat ca {name} din {city} nu are inca un website.

{ctx['hook']}

Noi construim website-uri profesionale pentru {cat.lower()} in 1-3 zile lucratoare, la preturi accesibile pentru orice afacere locala. Primul an de hosting si domeniu .ro sunt incluse.

Clientii va cauta online. Sa ii ajutam sa va gaseasca.

Puteti vedea exemple de lucrari la: {YOUR_PORTFOLIO}

Raspundeti la acest email sau scrieti-ne pentru o oferta personalizata gratuita.

Cu respect,
{YOUR_NAME}
{YOUR_WEBSITE}
"""
    return {"subject": subject, "body": body}


def preview_email(business: dict) -> None:
    """Afiseaza un preview al emailului generat (pentru testare)."""
    from colorama import Fore, Style, init
    init()

    result = generate_email(business)
    print(f"\n{Fore.CYAN}{'='*60}{Style.RESET_ALL}")
    print(f"{Fore.YELLOW}AFACERE: {business['name']} | {business['city']}{Style.RESET_ALL}")
    print(f"{Fore.GREEN}SUBJECT: {result['subject']}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'-'*60}{Style.RESET_ALL}")
    print(result["body"])
    print(f"{Fore.CYAN}{'='*60}{Style.RESET_ALL}\n")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Test cu date fictive
    test_business = {
        "name": "Restaurant La Mama",
        "category": "restaurant",
        "category_label": "Restaurant/Cafenea",
        "city": "Cluj-Napoca",
        "phone": "+40721123456",
        "rating": 4.3,
        "reviews_count": 87,
        "address": "Str. Dorobantilor 15, Cluj-Napoca",
    }
    preview_email(test_business)
