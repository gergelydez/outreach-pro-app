"""
Modul pentru gasirea afacerilor fara website folosind Google Places API.
v2.0 - Adaugat judete, localitati mici, numere WhatsApp
"""

import os
import time
import logging
import requests
from ratelimit import limits, sleep_and_retry
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)
GOOGLE_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY")

CITY_COORDINATES = {
    "Cluj-Napoca":     {"lat": 46.7712, "lng": 23.6236, "radius": 15000},
    "Brașov":          {"lat": 45.6427, "lng": 25.5887, "radius": 15000},
    "Sibiu":           {"lat": 45.7983, "lng": 24.1256, "radius": 12000},
    "Târgu Mureș":     {"lat": 46.5386, "lng": 24.5575, "radius": 12000},
    "Alba Iulia":      {"lat": 46.0669, "lng": 23.5799, "radius": 10000},
    "Bistrița":        {"lat": 47.1333, "lng": 24.5000, "radius": 10000},
    "Deva":            {"lat": 45.8833, "lng": 22.9000, "radius": 8000},
    "Sighișoara":      {"lat": 46.2197, "lng": 24.7937, "radius": 6000},
    "Sfântu Gheorghe": {"lat": 45.8670, "lng": 25.7870, "radius": 8000},
    "Miercurea Ciuc":  {"lat": 46.3578, "lng": 25.8024, "radius": 8000},
    "Zalău":           {"lat": 47.1897, "lng": 23.0569, "radius": 8000},
    "Turda":           {"lat": 46.5667, "lng": 23.7833, "radius": 6000},
    "Oradea":          {"lat": 47.0458, "lng": 21.9189, "radius": 15000},
    "Timișoara":       {"lat": 45.7489, "lng": 21.2087, "radius": 18000},
    "Arad":            {"lat": 46.1700, "lng": 21.3150, "radius": 12000},
    "București":       {"lat": 44.4268, "lng": 26.1025, "radius": 25000},
    "Iași":            {"lat": 47.1585, "lng": 27.6014, "radius": 15000},
    "Constanța":       {"lat": 44.1765, "lng": 28.6480, "radius": 15000},
    "Craiova":         {"lat": 44.3302, "lng": 23.7949, "radius": 12000},
    "Ploiești":        {"lat": 44.9365, "lng": 26.0226, "radius": 12000},
    "Galați":          {"lat": 45.4353, "lng": 28.0080, "radius": 12000},
    "Bacău":           {"lat": 46.5670, "lng": 26.9146, "radius": 12000},
    "Suceava":         {"lat": 47.6520, "lng": 26.2547, "radius": 10000},
    "Pitești":         {"lat": 44.8565, "lng": 24.8692, "radius": 10000},
    "Baia Mare":       {"lat": 47.6567, "lng": 23.5681, "radius": 10000},
    "Satu Mare":       {"lat": 47.7914, "lng": 22.8844, "radius": 10000},
    "Brăila":          {"lat": 45.2692, "lng": 27.9574, "radius": 10000},
    "Râmnicu Vâlcea":  {"lat": 45.0996, "lng": 24.3690, "radius": 8000},
    "Buzău":           {"lat": 45.1500, "lng": 26.8167, "radius": 8000},
    "Focșani":         {"lat": 45.6969, "lng": 27.1876, "radius": 8000},
    "Târgu Jiu":       {"lat": 45.0333, "lng": 23.2833, "radius": 8000},
    "Tulcea":          {"lat": 45.1787, "lng": 28.8042, "radius": 8000},
    "Dej":             {"lat": 47.1508, "lng": 23.8697, "radius": 6000},
}

# LOCALITATI MICI = CONCURENTA ZERO
SMALL_CITIES = {
    # Cluj
    "Câmpia Turzii":   {"lat": 46.5573, "lng": 23.8831, "radius": 5000},
    "Gherla":          {"lat": 47.0333, "lng": 23.9000, "radius": 5000},
    "Huedin":          {"lat": 46.8833, "lng": 22.9000, "radius": 4000},
    "Florești CJ":     {"lat": 46.7430, "lng": 23.5116, "radius": 4000},
    # Brașov
    "Săcele":          {"lat": 45.6167, "lng": 25.7000, "radius": 5000},
    "Codlea":          {"lat": 45.7000, "lng": 25.4500, "radius": 4000},
    "Zărnești":        {"lat": 45.5500, "lng": 25.3333, "radius": 4000},
    "Râșnov":          {"lat": 45.5858, "lng": 25.4558, "radius": 4000},
    "Predeal":         {"lat": 45.5058, "lng": 25.5783, "radius": 3000},
    # Sibiu
    "Cisnădie":        {"lat": 45.7083, "lng": 24.1550, "radius": 4000},
    "Avrig":           {"lat": 45.7083, "lng": 24.3667, "radius": 3000},
    # Mureș
    "Reghin":          {"lat": 46.7756, "lng": 24.7025, "radius": 5000},
    "Luduș":           {"lat": 46.4769, "lng": 24.1092, "radius": 4000},
    "Mediaș":          {"lat": 46.1622, "lng": 24.3519, "radius": 6000},
    # Alba
    "Sebeș":           {"lat": 45.9567, "lng": 23.5675, "radius": 5000},
    "Blaj":            {"lat": 46.1750, "lng": 23.9167, "radius": 4000},
    # Bihor
    "Beiuș":           {"lat": 46.6706, "lng": 22.3525, "radius": 4000},
    "Salonta":         {"lat": 46.7992, "lng": 21.6503, "radius": 4000},
    "Marghita":        {"lat": 47.3503, "lng": 22.3228, "radius": 4000},
    # Timiș
    "Lugoj":           {"lat": 45.6881, "lng": 21.9036, "radius": 6000},
    "Deta":            {"lat": 45.3972, "lng": 21.2250, "radius": 3000},
    # Hunedoara
    "Petroșani":       {"lat": 45.4178, "lng": 23.3644, "radius": 5000},
    "Orăștie":         {"lat": 45.8333, "lng": 23.2000, "radius": 4000},
    "Brad":            {"lat": 46.1267, "lng": 22.7817, "radius": 3000},
    # Prahova (turism munte)
    "Sinaia":          {"lat": 45.3500, "lng": 25.5500, "radius": 4000},
    "Bușteni":         {"lat": 45.4000, "lng": 25.5333, "radius": 3000},
    "Câmpina":         {"lat": 45.1167, "lng": 25.7333, "radius": 5000},
    # Constanța (litoral)
    "Mangalia":        {"lat": 43.8122, "lng": 28.5847, "radius": 5000},
    "Eforie Nord":     {"lat": 44.0608, "lng": 28.6308, "radius": 3000},
    "Năvodari":        {"lat": 44.3228, "lng": 28.6164, "radius": 5000},
    # Suceava
    "Câmpulung Moldovenesc": {"lat": 47.5272, "lng": 25.5592, "radius": 4000},
    "Rădăuți":         {"lat": 47.8453, "lng": 25.9197, "radius": 5000},
    "Vatra Dornei":    {"lat": 47.3556, "lng": 25.3600, "radius": 4000},
    # Neamț
    "Piatra Neamț":    {"lat": 46.9258, "lng": 26.3717, "radius": 8000},
    "Târgu Neamț":     {"lat": 47.2000, "lng": 26.3667, "radius": 4000},
    # Maramureș
    "Sighetul Marmației": {"lat": 47.9289, "lng": 23.8889, "radius": 6000},
    # Argeș
    "Curtea de Argeș": {"lat": 45.1381, "lng": 24.6758, "radius": 4000},
    "Câmpulung":       {"lat": 45.2653, "lng": 25.0486, "radius": 5000},
    # Vâlcea
    "Drăgășani":       {"lat": 44.6622, "lng": 24.2664, "radius": 4000},
    "Horezu":          {"lat": 45.1036, "lng": 23.9903, "radius": 3000},
}

ALL_LOCATIONS = {**CITY_COORDINATES, **SMALL_CITIES}

BUSINESS_CATEGORIES = {
    "restaurant":         "Restaurant/Cafenea/Fast-food",
    "dentist":            "Cabinet Stomatologic",
    "beauty_salon":       "Salon de Înfrumusețare",
    "car_repair":         "Service Auto",
    "plumber":            "Instalator/Sanitare",
    "electrician":        "Electrician/Instalații",
    "lawyer":             "Cabinet Avocat",
    "accounting":         "Contabilitate/Audit",
    "lodging":            "Hotel/Pensiune/Cazare",
    "hair_care":          "Frizerie/Coafor",
    "doctor":             "Cabinet Medical",
    "gym":                "Sală de Fitness/Sport",
    "florist":            "Florărie",
    "bakery":             "Brutărie/Patiserie",
    "veterinary_care":    "Cabinet Veterinar",
    "moving_company":     "Firmă Mutări/Transport",
    "photographer":       "Studio Foto/Video",
    "physiotherapist":    "Cabinet Fizioterapie",
    "car_wash":           "Spălătorie Auto",
    "wedding_venue":      "Organizare Evenimente/Nuntă",
    "painter":            "Constructor/Zugrav",
}

# Categorii cu cea mai buna rata de conversie (testat)
HIGH_CONVERSION_CATEGORIES = [
    "beauty_salon",   # proprietarele raspund rapid pe WA
    "lodging",        # sezon turistic = urgenta
    "car_repair",     # stiu ca pierd clienti fara online
    "hair_care",      # similar beauty_salon
    "restaurant",     # volum mare
    "dentist",        # venituri mari = budget
    "photographer",   # inteleg valoarea portofoliului
    "bakery",         # comenzi online = beneficiu clar
]


@sleep_and_retry
@limits(calls=10, period=1)
def _places_nearby_search(lat, lng, radius, business_type, page_token=None):
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {"location": f"{lat},{lng}", "radius": radius, "type": business_type, "key": GOOGLE_API_KEY}
    if page_token:
        params["pagetoken"] = page_token
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


@sleep_and_retry
@limits(calls=10, period=1)
def _place_details(place_id):
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,business_status",
        "key": GOOGLE_API_KEY,
        "language": "ro",
    }
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def _normalize_phone_for_whatsapp(phone: str) -> str:
    """Converteste numarul in format international fara spatii: +40721123456 -> 40721123456"""
    if not phone:
        return ""
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("0"):
        digits = "40" + digits[1:]
    return digits


def find_businesses_without_website(city: str, category: str, max_results: int = 60) -> list[dict]:
    """Gaseste afacerile fara website dintr-un oras/localitate data."""
    if city not in ALL_LOCATIONS:
        logger.warning(f"Locatia '{city}' nu e in lista.")
        return []

    coords = ALL_LOCATIONS[city]
    results_list = []
    page_token = None
    total_checked = 0

    logger.info(f"Caut '{category}' in {city}...")

    while total_checked < max_results:
        try:
            result = _places_nearby_search(coords["lat"], coords["lng"], coords["radius"], category, page_token)
        except requests.RequestException as e:
            logger.error(f"Eroare API: {e}")
            break

        if result.get("status") not in ("OK", "ZERO_RESULTS"):
            break

        places = result.get("results", [])
        if not places:
            break

        for place in places:
            total_checked += 1
            place_id = place.get("place_id")
            if not place_id:
                continue

            try:
                details = _place_details(place_id)
                biz = details.get("result", {})
            except requests.RequestException:
                continue

            if biz.get("business_status") == "CLOSED_PERMANENTLY":
                continue
            if biz.get("website"):
                continue

            phone = biz.get("formatted_phone_number", "").strip()
            intl_phone = biz.get("international_phone_number", "").strip()
            if not phone and not intl_phone:
                continue

            wa_number = _normalize_phone_for_whatsapp(intl_phone or phone)

            biz_data = {
                "place_id":       place_id,
                "name":           biz.get("name", place.get("name", "")),
                "address":        biz.get("formatted_address", ""),
                "phone":          phone or intl_phone,
                "phone_intl":     wa_number,
                "whatsapp_link":  f"https://wa.me/{wa_number}" if wa_number else "",
                "rating":         biz.get("rating", 0),
                "reviews_count":  biz.get("user_ratings_total", 0),
                "category":       category,
                "category_label": BUSINESS_CATEGORIES.get(category, category),
                "city":           city,
                "is_small_city":  city in SMALL_CITIES,
                "has_website":    False,
                "contact_email":  "",
                "wa_message_sent": False,
            }
            results_list.append(biz_data)
            tag = "🏘️" if city in SMALL_CITIES else "🏙️"
            logger.info(f"  ✓ {tag} {biz_data['name']} | {phone} | WA: {wa_number}")

            if len(results_list) >= max_results:
                break

        page_token = result.get("next_page_token")
        if not page_token:
            break
        time.sleep(2.5)

    logger.info(f"Total {city}/{category}: {len(results_list)} fara website")
    return results_list


def find_all_targets(cities=None, categories=None, include_small_cities=True,
                     max_per_city_category=20, priority_small_cities=True) -> list[dict]:
    """Ruleaza cautarea pentru toate orasele si categoriile."""
    if cities is None:
        cities_env = os.getenv("TARGET_CITIES", "Cluj-Napoca,Brașov,Sibiu")
        cities = [c.strip() for c in cities_env.split(",")]

    if categories is None:
        cats_env = os.getenv("TARGET_CATEGORIES", ",".join(HIGH_CONVERSION_CATEGORIES[:4]))
        categories = [c.strip() for c in cats_env.split(",")]

    if include_small_cities:
        # Adaugam automat localitati mici din jur
        proximity_map = {
            "Cluj-Napoca":  ["Câmpia Turzii", "Gherla", "Huedin", "Florești CJ"],
            "Brașov":       ["Săcele", "Codlea", "Zărnești", "Râșnov", "Predeal"],
            "Sibiu":        ["Mediaș", "Cisnădie", "Avrig"],
            "Târgu Mureș":  ["Reghin", "Luduș"],
            "Alba Iulia":   ["Sebeș", "Blaj"],
            "Timișoara":    ["Lugoj", "Deta"],
            "Deva":         ["Orăștie", "Brad"],
            "Oradea":       ["Beiuș", "Salonta", "Marghita"],
            "Constanța":    ["Mangalia", "Eforie Nord", "Năvodari"],
            "Ploiești":     ["Câmpina", "Sinaia", "Bușteni"],
            "Suceava":      ["Câmpulung Moldovenesc", "Rădăuți", "Vatra Dornei"],
            "Baia Mare":    ["Sighetul Marmației"],
            "Pitești":      ["Câmpulung", "Curtea de Argeș"],
        }
        extra = []
        for city in cities:
            for small in proximity_map.get(city, []):
                if small not in cities and small not in extra:
                    extra.append(small)
        if priority_small_cities:
            cities = extra + cities  # orase mici primele!
        else:
            cities = cities + extra

    all_leads = []
    seen_ids = set()

    for i, city in enumerate(cities):
        for j, category in enumerate(categories):
            logger.info(f"[{i*len(categories)+j+1}/{len(cities)*len(categories)}] {city} / {category}")
            results = find_businesses_without_website(city, category, max_per_city_category)
            for biz in results:
                if biz["place_id"] not in seen_ids:
                    seen_ids.add(biz["place_id"])
                    all_leads.append(biz)
            time.sleep(1)

    logger.info(f"\nTotal leads unici: {len(all_leads)}")
    logger.info(f"  Localitati mici: {sum(1 for l in all_leads if l['is_small_city'])}")
    logger.info(f"  Orase mari: {sum(1 for l in all_leads if not l['is_small_city'])}")
    return all_leads


def save_leads_to_csv(leads: list[dict], filepath: str = "data/leads.csv") -> str:
    """Salveaza leads-urile intr-un CSV bine organizat."""
    import pandas as pd
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    df = pd.DataFrame(leads)
    priority_cols = ["name", "city", "is_small_city", "category_label", "phone",
                     "whatsapp_link", "contact_email", "rating", "reviews_count", "address"]
    other_cols = [c for c in df.columns if c not in priority_cols]
    df = df[[c for c in priority_cols if c in df.columns] + other_cols]
    df.to_csv(filepath, index=False, encoding="utf-8-sig")
    logger.info(f"Salvat {len(leads)} leads in {filepath}")
    return filepath
