// Ce afaceri au un motiv concret să plătească un site ACUM, pe luni.
// Fiecare intrare are motivul, puterea dovezii și sursa, ca să poți verifica
// singur înainte să folosești argumentul într-un mesaj.

export interface SeasonEntry {
  categories: string[]          // tipuri Google Places din BUSINESS_CATEGORIES
  label: string                 // pentru chip-ul din căutare
  why: string                   // de ce cumpără acum (pentru tine)
  hook: string                  // frază pentru client, folosită opțional în mesaj
  evidence: 'puternică' | 'medie' | 'slabă'
  sources: { title: string; url: string }[]
}

const TIRES: SeasonEntry = {
  categories: ['car_repair', 'auto_body', 'gas_station'],
  label: 'Service auto / vulcanizare',
  why: 'Vârful schimbului de anvelope de iarnă: programările se aglomerează după 1 noiembrie, cu așteptare de până la 3 săptămâni. Au încasări acum și pierd clienți la telefon.',
  hook: 'acum, în sezonul de anvelope de iarnă, o programare online vă scutește de multe telefoane și nu pierdeți clienții care nu prind linia liberă',
  evidence: 'medie',
  sources: [
    { title: 'Capital — programări aglomerate în noiembrie, amenzi 2026', url: 'https://www.capital.ro/soferii-sunt-avertizati-sa-nu-astepte-prima-ninsoare-pentru-schimbarea-anvelopelor-amenzile-pot-ajunge-la-4-325-de-lei-in-2026.html' },
    { title: 'Mediafax — românii cumpără anvelopele de iarnă mai devreme', url: 'https://www.mediafax.ro/social/care-este-motivul-pentru-care-romanii-cumpara-mai-devreme-anul-acesta-anvelopele-de-iarna-23624907' },
  ],
}

const LODGING: SeasonEntry = {
  categories: ['lodging', 'campground', 'rv_park'],
  label: 'Pensiuni / hoteluri',
  why: 'Acum se vând Revelionul și sezonul de iarnă (12 nov 2026 – 18 apr 2027): pachete de Revelion de 2.840–3.370 lei/persoană, avans de 50%, termene de early booking în jur de 9 noiembrie. Fiecare rezervare directă le economisește comisionul platformelor.',
  hook: 'acum se fac rezervările de Revelion și de iarnă, iar un site cu rezervare directă vă scutește de comisionul platformelor',
  evidence: 'puternică',
  sources: [
    { title: 'Ocaziituristice — Revelion 2027 de la 3.370 lei', url: 'https://www.ocaziituristice.ro/oferte-revelion/romania/' },
    { title: 'Alltur — pachete Revelion 2027 (Bucovina de la 2.840 lei)', url: 'https://www.alltur.ro/revelion-2027-romania/' },
    { title: 'Casa Dives — avans 50%, locuri limitate', url: 'https://www.casadives.ro/cazare-revelion-transilvania/' },
    { title: 'Spotmedia — sezonul de schi 2026–2027', url: 'https://spotmedia.ro/stiri/timp-liber/vacante-ieftine-la-schi-in-sezonul-2026-2027-romania-printre-destinatiile-dintr-un-top-international' },
  ],
}

const RESTAURANTS: SeasonEntry = {
  categories: ['restaurant', 'event_venue', 'bar'],
  label: 'Restaurante / săli de evenimente',
  why: 'Petrecerile de Crăciun ale firmelor se rezervă în noiembrie (pachete corporate ~397 lei/persoană, avans 30%), urmate de Revelion. Firmele caută online meniul și disponibilitatea.',
  hook: 'acum firmele își caută locul pentru petrecerea de Crăciun și pentru Revelion, iar o pagină clară cu meniurile și un formular de rezervare aduce cererile direct la voi',
  evidence: 'medie',
  sources: [
    { title: 'Ghid Arad — petrecerile de firmă se rezervă în noiembrie', url: 'https://pensiune-arad.ro/petrecere-de-craciun-firma-arad/' },
    { title: 'Pachet corporate Crăciun 2026 — 397 lei/pers, avans 30%', url: 'https://buongiornocraciun.netlify.app/' },
  ],
}

const BEAUTY: SeasonEntry = {
  categories: ['spa', 'beauty_salon', 'nail_salon', 'hair_care'],
  label: 'Spa / saloane',
  why: 'Voucherele cadou de Moș Nicolae și Crăciun sunt vânzare în plus fără efort (ex. 400–500 lei pentru masaj de cuplu). Spa-urile care le vând online le promovează acum.',
  hook: 'înainte de Moș Nicolae și Crăciun, voucherele cadou vândute direct de pe site sunt vânzări în plus, fără telefoane',
  evidence: 'medie',
  sources: [
    { title: 'Rituals Bali Spa — vouchere Moș Nicolae / Crăciun', url: 'https://ritualsbalispa.ro/card-cadou-luna-decembrie/' },
    { title: 'Balinesse Spa — vouchere cadou', url: 'https://www.balinessespa.ro/en/gift-vouchers-massage-in-bucharest/' },
  ],
}

const GYMS: SeasonEntry = {
  categories: ['gym'],
  label: 'Săli de fitness',
  why: 'Ianuarie aduce valul rezoluțiilor de An Nou; site-ul trebuie gata înainte. Dovezile sunt mai ales declarații ale antrenorilor, nu statistici.',
  hook: 'în ianuarie vine valul de abonamente noi de după rezoluțiile de An Nou, iar oamenii compară sălile online înainte să aleagă',
  evidence: 'slabă',
  sources: [
    { title: 'Capital — rezoluțiile de început de an umplu sălile', url: 'https://www.capital.ro/rezolutiile-de-inceput-de-an-umplu-salile-de-fitness-dar-doar-30-dintre-incepatori-continua-dupa-luna-ianuarie-care-este-explicatia.html' },
    { title: 'ZF — ~1 milion de abonați, 44,5 €/lună în medie', url: 'https://www.zf.ro/business-sportiv/business-sportiv-un-abonament-la-o-sala-de-fitness-din-romania-costa-22884889' },
  ],
}

const WEDDINGS: SeasonEntry = {
  categories: ['photographer', 'florist', 'event_venue'],
  label: 'Nunți (foto, flori, saloane)',
  why: 'Târgurile de nunți sunt la final de ianuarie–februarie (ex. Ghid Mariaj Iași, 29–31 ian 2027; Timișoara și Arad la final de ianuarie; Craiova în februarie). Cuplurile le verifică portofoliul online după târg.',
  hook: 'înainte de târgurile de nunți din ianuarie–februarie, un portofoliu nou pe site face diferența când mirii vă caută după târg',
  evidence: 'medie',
  sources: [
    { title: 'Târgul de nunți Ghid Mariaj Iași (29–31 ian 2027)', url: 'https://www.facebook.com/Targdenunti.ro/' },
    { title: 'Nunto — calendarul târgurilor de nuntă', url: 'https://nunto.ro/targ-nunta' },
  ],
}

// Pe luni (1-12). Noiembrie–februarie verificate cu surse; restul lunilor fără recomandări.
const BY_MONTH: Record<number, SeasonEntry[]> = {
  11: [LODGING, TIRES, RESTAURANTS, BEAUTY, WEDDINGS, GYMS],
  12: [LODGING, BEAUTY, RESTAURANTS, WEDDINGS, GYMS, TIRES],
  1: [WEDDINGS, GYMS],
  2: [WEDDINGS],
}

export function seasonEntries(date = new Date()): SeasonEntry[] {
  return BY_MONTH[date.getMonth() + 1] || []
}

export function seasonFor(category: string, date = new Date()): SeasonEntry | null {
  return seasonEntries(date).find(e => e.categories.includes(category)) || null
}

export const MONTH_NAMES_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
