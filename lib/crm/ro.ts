// Texte în română pentru pagina simplă: ce înseamnă fiecare problemă găsită la audit
// și fiecare stare a site-ului. Mesajele către clienți rămân în engleză.

export const STATUS_RO: Record<string, { label: string; tone: 'bad' | 'warn' | 'good' | 'neutral'; hint: string }> = {
  NO_WEBSITE: { label: 'Fără site', tone: 'bad', hint: 'Nu are site în Google și nu am găsit nici pe domeniile probabile. Client ideal pentru un site nou.' },
  SOCIAL_ONLY: { label: 'Doar Facebook/Instagram', tone: 'bad', hint: 'În Google are doar o pagină de social media — nu un site propriu.' },
  DIRECTORY_ONLY: { label: 'Doar pe un director', tone: 'warn', hint: 'Linkul din Google duce la un director (Yell, Checkatrade etc.), nu la un site propriu.' },
  FREE_SUBDOMAIN: { label: 'Site gratuit (Wix/…)', tone: 'warn', hint: 'Site făcut pe o platformă gratuită, cu adresă de tip nume.wixsite.com.' },
  BROKEN_WEBSITE: { label: 'Site căzut', tone: 'bad', hint: 'Site-ul nu s-a deschis la două verificări diferite.' },
  OUTDATED_WEBSITE: { label: 'Site învechit', tone: 'warn', hint: 'Site vechi: semne clare (nu e făcut pentru telefon, tehnologie veche, an vechi în subsol).' },
  NEEDS_REDESIGN: { label: 'Site slab', tone: 'warn', hint: 'Site-ul merge, dar are probleme care îi costă clienți.' },
  GOOD_WEBSITE: { label: 'Site bun', tone: 'good', hint: 'Site modern — șanse mici să vrea unul nou.' },
  UNVERIFIED: { label: 'Neverificat încă', tone: 'neutral', hint: 'Auditul n-a rulat încă sau site-ul n-a putut fi verificat.' },
}

export const FINDING_RO: Record<string, string> = {
  no_website: 'Nu are site — clienții care îi caută pe Google nu văd servicii, poze sau un formular de ofertă.',
  social_only: 'Are doar pagină de Facebook/Instagram — greu de găsit pe Google și fără servicii clare.',
  directory_only: 'Linkul din Google duce la un director, nu la site-ul lor.',
  free_subdomain: 'Site pe platformă gratuită (adresă lungă, cu reclame) — arată mai puțin profesionist.',
  broken: 'Site-ul nu se deschide — cine apasă pe link din Google vede o eroare.',
  no_https: 'Fără HTTPS — Chrome afișează „Nesigur” lângă adresă.',
  not_mobile_friendly: 'Nu e făcut pentru telefon — pe mobil textul e mic și trebuie mărit.',
  mobile_overflow: 'Pe telefon pagina „fuge” în lateral — arată stricat.',
  slow_mobile: 'Se încarcă greu pe telefon (scor Google PageSpeed mic).',
  no_contact_form: 'Nu are formular de contact / cerere de ofertă.',
  no_cta: 'Nu are un buton clar de tip „Cere ofertă” sau „Sună acum”.',
  no_click_to_call: 'Telefonul nu e clickabil pe mobil.',
  outdated_signal: 'Semne de site vechi (tehnologie depășită sau an vechi în subsol).',
  no_meta_description: 'Lipsește descrierea pentru Google — apare mai slab în căutări.',
  weak_title: 'Titlul paginii e slab (nu spune ce fac și unde).',
  no_local_signals: 'Nu menționează orașul / zona — pierde căutări locale.',
  no_service_pages: 'Nu are pagini separate pentru servicii — apare mai rar pe Google.',
}

export const findingRo = (code: string, fallback: string) => FINDING_RO[code] || fallback

// Telefon UK → link WhatsApp (doar mobile: +44 7…)
export function waNumber(phoneE164: string | null | undefined): string | null {
  if (!phoneE164) return null
  const d = phoneE164.replace(/\D/g, '')
  return d.startsWith('447') && d.length === 12 ? d : null
}

export const CATEGORY_RO: Record<string, string> = {
  plumber: 'Instalatori', electrician: 'Electricieni', heating_engineer: 'Centrale termice', builder: 'Constructori',
  roofer: 'Acoperișuri', painter_decorator: 'Zugravi', cleaning: 'Firme de curățenie', landscaping: 'Amenajări peisagistice',
  locksmith: 'Lăcătuși', carpenter: 'Tâmplari', plasterer: 'Tencuitori', handyman: 'Meșteri (handyman)',
  tiler: 'Faianțari', gardener: 'Grădinari', tree_surgeon: 'Toaletare copaci', fencing: 'Garduri', driveways: 'Alei și pavaje',
  window_cleaner: 'Spălători geamuri', carpet_cleaning: 'Curățare covoare', removals: 'Mutări / transport', pest_control: 'Dezinsecție',
  scaffolding: 'Schele', car_repair: 'Service-uri auto', mobile_mechanic: 'Mecanici mobili', car_wash: 'Spălătorii auto',
  tyres: 'Vulcanizări', body_shop: 'Tinichigerii', driving_instructor: 'Instructori auto', barber: 'Frizerii',
  hairdresser: 'Coafuri', beauty_salon: 'Saloane de înfrumusețare', nail_salon: 'Saloane de unghii', lash_brow: 'Gene și sprâncene',
  massage: 'Masaj', tattoo: 'Tatuaje', dog_groomer: 'Toaletaj câini', personal_trainer: 'Antrenori personali',
  takeaway: 'Take-away', cafe: 'Cafenele', bakery: 'Brutării', caterer: 'Catering', florist: 'Florării',
  tailor: 'Croitorii', phone_repair: 'Reparații telefoane', computer_repair: 'Reparații calculatoare', photographer: 'Fotografi', tutor: 'Meditații',
}
