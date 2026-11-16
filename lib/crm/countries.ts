// Țările în care caută aplicația: UK și Ungaria. Aici stau diferențele: formatul telefonului,
// ce înseamnă „mobil” (WhatsApp), meseriile (cu numele lor de căutare locale), orașele și
// ordinea în care le căutăm — întâi categoriile care plătesc cel mai probabil, acum (iarna).
import { UK_CATEGORIES, UK_REGIONS } from './constants'
import { JUDETE } from '@/lib/constants'

export type Country = 'UK' | 'HU' | 'RO'
export const COUNTRIES: Country[] = ['UK', 'HU', 'RO']
export const asCountry = (v: unknown): Country => (v === 'HU' || v === 'RO' ? v : 'UK')

export const COUNTRY_CFG: Record<Country, { regionCode: string; legacyRegion: string; lang: string; dial: string; mobile: RegExp; name: string }> = {
  UK: { regionCode: 'GB', legacyRegion: 'uk', lang: 'en-GB', dial: '+44', mobile: /^\+447\d{9}$/, name: 'UK' },
  // HU: mobil = 20, 30, 31, 50, 70 + 7 cifre
  HU: { regionCode: 'HU', legacyRegion: 'hu', lang: 'hu', dial: '+36', mobile: /^\+36(20|30|31|50|70)\d{7}$/, name: 'Ungaria' },
  // RO: mobil = 07xx xxx xxx → +407…
  RO: { regionCode: 'RO', legacyRegion: 'ro', lang: 'ro', dial: '+40', mobile: /^\+407\d{8}$/, name: 'România' },
}

// Telefon → format internațional (+44… / +36…), sau null dacă nu e valid
export function normalizePhone(raw: string | null | undefined, country: Country = 'UK'): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d+]/g, '')
  if (country === 'UK') {
    if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2)
    if (d.startsWith('44')) d = d.slice(2)
    if (d.startsWith('0')) d = d.slice(1)
    return /^\d{9,10}$/.test(d) ? `+44${d}` : null
  }
  if (country === 'RO') {
    if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2)
    if (d.startsWith('40')) d = d.slice(2)
    if (d.startsWith('0')) d = d.slice(1)
    return /^\d{9}$/.test(d) ? `+40${d}` : null
  }
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('36')) d = d.slice(2)
  else if (d.startsWith('06')) d = d.slice(2)
  return /^\d{8,9}$/.test(d) ? `+36${d}` : null
}

export const isMobile = (e164: string | null | undefined, country: Country = 'UK') => !!e164 && COUNTRY_CFG[country].mobile.test(e164)

// Număr pentru linkul wa.me (doar mobile)
export function waDigits(e164: string | null | undefined): string | null {
  if (!e164) return null
  if (isMobile(e164, 'UK') || isMobile(e164, 'HU') || isMobile(e164, 'RO')) return e164.replace(/\D/g, '')
  return null
}

export interface CountryCategory { key: string; label: string; query: string; ro: string }

// Ungaria: căutările în maghiară (așa apar firmele în Google Maps)
export const HU_CATEGORIES: CountryCategory[] = [
  { key: 'heating', label: 'Fűtésszerelők', query: 'fűtésszerelő', ro: 'Instalatori încălzire' },
  { key: 'boiler_service', label: 'Gázkazán szervizek', query: 'gázkazán szerviz', ro: 'Service centrale pe gaz' },
  { key: 'plumber', label: 'Vízszerelők', query: 'vízszerelő', ro: 'Instalatori' },
  { key: 'electrician', label: 'Villanyszerelők', query: 'villanyszerelő', ro: 'Electricieni' },
  { key: 'tyres', label: 'Gumiszervizek', query: 'gumiszerviz', ro: 'Vulcanizări (anvelope iarnă)' },
  { key: 'car_repair', label: 'Autószervizek', query: 'autószerviz', ro: 'Service-uri auto' },
  { key: 'guesthouse', label: 'Vendégházak', query: 'vendégház', ro: 'Pensiuni / case de oaspeți' },
  { key: 'apartment', label: 'Apartmanok', query: 'apartman szállás', ro: 'Apartamente de închiriat' },
  { key: 'pension', label: 'Panziók', query: 'panzió', ro: 'Pensiuni' },
  { key: 'beauty', label: 'Kozmetikák', query: 'kozmetika', ro: 'Saloane cosmetice' },
  { key: 'hairdresser', label: 'Fodrászatok', query: 'fodrászat', ro: 'Coafuri' },
  { key: 'nails', label: 'Műkörmösök', query: 'műköröm', ro: 'Unghii' },
  { key: 'massage', label: 'Masszázsszalonok', query: 'masszázs', ro: 'Masaj' },
  { key: 'confectionery', label: 'Cukrászdák', query: 'cukrászda', ro: 'Cofetării' },
  { key: 'florist', label: 'Virágboltok', query: 'virágbolt', ro: 'Florării' },
  { key: 'catering', label: 'Catering cégek', query: 'catering', ro: 'Catering' },
  { key: 'event', label: 'Rendezvényszervezők', query: 'rendezvényszervező', ro: 'Organizare evenimente' },
  { key: 'photographer', label: 'Fotósok', query: 'fotós', ro: 'Fotografi' },
  { key: 'accountant', label: 'Könyvelők', query: 'könyvelő iroda', ro: 'Contabili' },
  { key: 'driving_school', label: 'Autósiskolák', query: 'autósiskola', ro: 'Școli de șoferi' },
  { key: 'language_school', label: 'Nyelviskolák', query: 'nyelviskola', ro: 'Școli de limbi' },
  { key: 'personal_trainer', label: 'Személyi edzők', query: 'személyi edző', ro: 'Antrenori personali' },
  { key: 'windows', label: 'Nyílászárósok', query: 'nyílászáró', ro: 'Tâmplărie / geamuri' },
  { key: 'roofer', label: 'Tetőfedők', query: 'tetőfedő', ro: 'Acoperișuri' },
  { key: 'locksmith', label: 'Zárszervizek', query: 'zárszerviz', ro: 'Lăcătuși' },
  { key: 'cleaning', label: 'Takarító cégek', query: 'takarító cég', ro: 'Firme de curățenie' },
  { key: 'removals', label: 'Költöztetők', query: 'költöztetés', ro: 'Mutări' },
  { key: 'painter', label: 'Szobafestők', query: 'szobafestő', ro: 'Zugravi' },
  { key: 'tiler', label: 'Burkolók', query: 'burkoló', ro: 'Faianțari' },
  { key: 'builder', label: 'Kőművesek', query: 'kőműves', ro: 'Constructori' },
  { key: 'carpenter', label: 'Asztalosok', query: 'asztalos', ro: 'Tâmplari' },
  { key: 'dentist', label: 'Fogorvosok', query: 'fogorvos', ro: 'Stomatologi' },
  { key: 'vet', label: 'Állatorvosok', query: 'állatorvos', ro: 'Veterinari' },
  { key: 'dog_groomer', label: 'Kutyakozmetikák', query: 'kutyakozmetika', ro: 'Toaletaj câini' },
  { key: 'barber', label: 'Barberek', query: 'barber', ro: 'Frizerii' },
]

// România: căutările în română
export const RO_CATEGORIES: CountryCategory[] = [
  { key: 'cabin', label: 'Cabane', query: 'cabană', ro: 'Cabane' },
  { key: 'pension', label: 'Pensiuni', query: 'pensiune', ro: 'Pensiuni' },
  { key: 'apartment', label: 'Apartamente în regim hotelier', query: 'apartament regim hotelier', ro: 'Apartamente în regim hotelier' },
  { key: 'tyres', label: 'Vulcanizări', query: 'vulcanizare', ro: 'Vulcanizări (anvelope de iarnă)' },
  { key: 'boiler_service', label: 'Service centrale termice', query: 'service centrale termice', ro: 'Service centrale termice' },
  { key: 'plumber', label: 'Instalatori', query: 'instalator', ro: 'Instalatori' },
  { key: 'car_repair', label: 'Service-uri auto', query: 'service auto', ro: 'Service-uri auto' },
  { key: 'beauty', label: 'Saloane de înfrumusețare', query: 'salon înfrumusețare', ro: 'Saloane de înfrumusețare' },
  { key: 'hairdresser', label: 'Coafuri', query: 'coafor', ro: 'Coafuri' },
  { key: 'nails', label: 'Saloane de unghii', query: 'salon unghii manichiură', ro: 'Unghii' },
  { key: 'barber', label: 'Frizerii', query: 'frizerie barber', ro: 'Frizerii' },
  { key: 'massage', label: 'Masaj', query: 'salon masaj', ro: 'Masaj' },
  { key: 'confectionery', label: 'Cofetării', query: 'cofetărie', ro: 'Cofetării' },
  { key: 'florist', label: 'Florării', query: 'florărie', ro: 'Florării' },
  { key: 'catering', label: 'Catering', query: 'catering', ro: 'Catering' },
  { key: 'event', label: 'Organizare evenimente', query: 'organizare evenimente', ro: 'Organizare evenimente' },
  { key: 'photographer', label: 'Fotografi', query: 'fotograf', ro: 'Fotografi' },
  { key: 'driving_school', label: 'Școli de șoferi', query: 'școală de șoferi', ro: 'Școli de șoferi' },
  { key: 'gym', label: 'Săli de fitness', query: 'sală fitness', ro: 'Săli de fitness' },
  { key: 'dentist', label: 'Cabinete stomatologice', query: 'cabinet stomatologic', ro: 'Stomatologi' },
  { key: 'accountant', label: 'Contabili', query: 'cabinet contabilitate', ro: 'Contabili' },
  { key: 'windows', label: 'Termopane', query: 'termopane', ro: 'Termopane' },
  { key: 'electrician', label: 'Electricieni', query: 'electrician', ro: 'Electricieni' },
  { key: 'roofer', label: 'Acoperișuri', query: 'acoperișuri', ro: 'Acoperișuri' },
  { key: 'builder', label: 'Firme de construcții', query: 'firmă construcții', ro: 'Construcții' },
  { key: 'painter', label: 'Zugravi', query: 'zugrav', ro: 'Zugravi' },
  { key: 'cleaning', label: 'Firme de curățenie', query: 'firmă curățenie', ro: 'Curățenie' },
  { key: 'removals', label: 'Mutări mobilă', query: 'mutări mobilă transport', ro: 'Mutări' },
  { key: 'car_wash', label: 'Spălătorii auto', query: 'spălătorie auto', ro: 'Spălătorii auto' },
  { key: 'car_rental', label: 'Închirieri auto', query: 'închirieri auto', ro: 'Închirieri auto' },
  { key: 'vet', label: 'Cabinete veterinare', query: 'cabinet veterinar', ro: 'Veterinari' },
  { key: 'locksmith', label: 'Lăcătuși', query: 'lăcătuș deblocări uși', ro: 'Lăcătuși' },
  { key: 'tailor', label: 'Croitorii', query: 'croitorie', ro: 'Croitorii' },
  { key: 'phone_repair', label: 'Service telefoane', query: 'service telefoane', ro: 'Service telefoane' },
  { key: 'garden', label: 'Amenajări grădini', query: 'amenajări grădină', ro: 'Amenajări grădini' },
]

// Stațiunile de iarnă întâi (cabane/pensiuni iarna), apoi orașele pe județe
const RO_WINTER_RESORTS: Record<string, string[]> = {
  'Stațiuni': ['Sinaia', 'Predeal', 'Bran', 'Moieciu', 'Poiana Brașov', 'Bușteni', 'Azuga', 'Rânca', 'Păltiniș', 'Borșa', 'Straja', 'Vatra Dornei', 'Durău', 'Arieșeni', 'Băile Herculane', 'Sovata'],
}
export const RO_REGIONS: Record<string, string[]> = { ...RO_WINTER_RESORTS, ...JUDETE }

export const HU_REGIONS: Record<string, string[]> = {
  'Budapest': ['Budapest I. kerület', 'Budapest II. kerület', 'Budapest III. kerület', 'Budapest IV. kerület', 'Budapest V. kerület', 'Budapest VI. kerület',
    'Budapest VII. kerület', 'Budapest VIII. kerület', 'Budapest IX. kerület', 'Budapest X. kerület', 'Budapest XI. kerület', 'Budapest XII. kerület',
    'Budapest XIII. kerület', 'Budapest XIV. kerület', 'Budapest XV. kerület', 'Budapest XVI. kerület', 'Budapest XVII. kerület', 'Budapest XVIII. kerület',
    'Budapest XIX. kerület', 'Budapest XX. kerület', 'Budapest XXI. kerület', 'Budapest XXII. kerület', 'Budapest XXIII. kerület'],
  'Pest megye': ['Érd', 'Gödöllő', 'Szentendre', 'Vác', 'Cegléd', 'Budaörs', 'Dunakeszi'],
  'Nyugat': ['Győr', 'Sopron', 'Szombathely', 'Zalaegerszeg', 'Nagykanizsa', 'Mosonmagyaróvár', 'Sárvár', 'Bük', 'Hévíz', 'Keszthely', 'Zalakaros'],
  'Közép': ['Székesfehérvár', 'Veszprém', 'Tatabánya', 'Esztergom', 'Dunaújváros', 'Balatonfüred', 'Siófok'],
  'Dél': ['Pécs', 'Kaposvár', 'Szekszárd', 'Szeged', 'Kecskemét', 'Baja', 'Hódmezővásárhely', 'Békéscsaba', 'Gyula'],
  'Kelet': ['Debrecen', 'Nyíregyháza', 'Miskolc', 'Eger', 'Szolnok', 'Hajdúszoboszló', 'Salgótarján', 'Jászberény'],
}

// ── Ordinea de căutare: categoriile care plătesc cel mai probabil, în sezonul curent ──
// Iarna (nov–feb): încălzire/instalații (avarii de centrale și țevi înghețate), anvelope de iarnă (HU),
// saloane înainte de sărbători, cofetării/florării/catering (Crăciun, Revelion), cazare (sărbători,
// stațiuni termale în HU), contabili (UK: termenul Self Assessment e 31 ianuarie), școli de șoferi și
// antrenori (hotărâri de an nou). Meseriile cu lucrări scumpe sunt înaintea celor ieftine.
const WINTER = [10, 11, 0, 1] // nov, dec, ian, feb (getMonth)

const UK_WINTER = ['heating_engineer', 'plumber', 'roofer', 'electrician', 'damp_proofing', 'double_glazing', 'accountant', 'locksmith', 'chimney_sweep',
  'beauty_salon', 'hairdresser', 'nail_salon', 'lash_brow', 'caterer', 'florist', 'bakery', 'driving_instructor', 'personal_trainer', 'removals',
  'builder', 'carpenter', 'plasterer', 'painter_decorator', 'tiler', 'car_repair', 'body_shop', 'tyres', 'mobile_mechanic', 'pest_control',
  'cleaning', 'carpet_cleaning', 'landscaping', 'driveways', 'fencing', 'tree_surgeon', 'massage', 'barber', 'tattoo', 'dog_groomer', 'photographer',
  'tutor', 'scaffolding', 'window_cleaner', 'gardener', 'handyman', 'phone_repair', 'computer_repair', 'tailor', 'cafe', 'takeaway', 'car_wash']
const UK_REST = ['roofer', 'builder', 'landscaping', 'driveways', 'plumber', 'electrician', 'heating_engineer', 'double_glazing', 'damp_proofing', 'fencing',
  'tree_surgeon', 'beauty_salon', 'hairdresser', 'nail_salon', 'lash_brow', 'removals', 'accountant', 'car_repair', 'body_shop', 'carpenter', 'plasterer',
  'painter_decorator', 'tiler', 'cleaning', 'caterer', 'photographer', 'personal_trainer', 'driving_instructor']

const HU_WINTER = ['heating', 'boiler_service', 'plumber', 'tyres', 'guesthouse', 'apartment', 'pension', 'beauty', 'hairdresser', 'nails', 'massage',
  'confectionery', 'florist', 'catering', 'event', 'electrician', 'car_repair', 'accountant', 'photographer', 'driving_school', 'language_school',
  'personal_trainer', 'windows', 'roofer', 'locksmith', 'cleaning', 'dentist', 'vet', 'removals', 'painter', 'tiler', 'builder', 'carpenter', 'dog_groomer', 'barber']
const RO_WINTER = ['cabin', 'pension', 'apartment', 'tyres', 'boiler_service', 'plumber', 'car_repair', 'beauty', 'hairdresser', 'nails', 'confectionery',
  'florist', 'catering', 'event', 'photographer', 'driving_school', 'gym', 'dentist', 'accountant', 'windows', 'electrician', 'massage', 'barber',
  'car_rental', 'vet', 'locksmith', 'roofer', 'builder', 'painter', 'cleaning', 'removals', 'car_wash', 'tailor', 'phone_repair', 'garden']
const RO_REST = ['pension', 'cabin', 'apartment', 'roofer', 'windows', 'builder', 'garden', 'car_repair', 'beauty', 'hairdresser', 'nails', 'dentist',
  'catering', 'event', 'photographer', 'driving_school', 'gym', 'electrician', 'plumber']
const HU_REST = ['guesthouse', 'apartment', 'pension', 'roofer', 'windows', 'builder', 'electrician', 'plumber', 'heating', 'beauty', 'hairdresser', 'nails',
  'massage', 'car_repair', 'tyres', 'catering', 'event', 'photographer', 'confectionery', 'florist', 'accountant', 'dentist']

export function categoriesFor(country: Country): CountryCategory[] {
  if (country === 'HU') return HU_CATEGORIES
  if (country === 'RO') return RO_CATEGORIES
  return UK_CATEGORIES.map(c => ({ key: c.key, label: c.label, query: c.query, ro: c.label }))
}

export function huntOrder(country: Country, month = new Date().getMonth()): string[] {
  const winter = WINTER.includes(month)
  const pref = country === 'HU' ? (winter ? HU_WINTER : HU_REST) : country === 'RO' ? (winter ? RO_WINTER : RO_REST) : (winter ? UK_WINTER : UK_REST)
  const all = categoriesFor(country).map(c => c.key)
  return [...pref.filter(k => all.includes(k)), ...all.filter(k => !pref.includes(k))]
}

export function citiesFor(country: Country): { city: string; region: string }[] {
  const regions = country === 'HU' ? HU_REGIONS : country === 'RO' ? RO_REGIONS : UK_REGIONS
  return Object.entries(regions).flatMap(([region, cities]) => cities.map(city => ({ city, region })))
}

export function buildCountryQuery(country: Country, category: string, city: string, region?: string | null): string {
  const cat = categoriesFor(country).find(c => c.key === category)
  const what = cat?.query || category.replace(/_/g, ' ')
  if (country === 'RO') return `${what} ${city}${region && region !== 'Stațiuni' ? `, ${region}` : ''}`
  return country === 'HU' ? `${what} ${city}` : `${what} in ${city}${region ? `, ${region}` : ''}, UK`
}
