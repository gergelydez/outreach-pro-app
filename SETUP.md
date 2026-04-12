# 🚀 Outreach Pro v2.0 – Setup complet

## Ce face această aplicație

Găsește automat afaceri din România care **nu au website** pe Google Maps, generează mesaje personalizate cu Claude AI și îți permite să trimiți oferte pe **WhatsApp** (un click) sau Email.

---

## Setup în 10 minute

### 1. Instalare dependențe

```bash
npm install
```

### 2. Configurare chei API

Copiază `.env.example` în `.env.local`:

```bash
cp .env.example .env.local
```

Completează cheile în `.env.local` (sau le poți pune direct în app la Setări):

#### Google Places API Key
1. Mergi pe [console.cloud.google.com](https://console.cloud.google.com)
2. Creează un proiect nou
3. Activează **Places API**
4. Generează o cheie API
5. ⚠️ Costă ~$17 per 1000 cereri de detalii. Pentru 100 leads = ~$2.

#### Anthropic API Key
1. Mergi pe [console.anthropic.com](https://console.anthropic.com)
2. API Keys → Create Key
3. ~$0.003 per mesaj generat (practic gratuit)

#### Gmail App Password (pentru trimitere email)
1. Activează 2FA pe contul Gmail
2. Mergi pe [myaccount.google.com](https://myaccount.google.com) → Security → App passwords
3. Creează o parolă pentru "Mail"
4. Folosește acea parolă (nu parola normală!)

### 3. Pornire aplicație

```bash
npm run dev
```

Deschide [http://localhost:3000](http://localhost:3000)

### 4. Prima campanie

1. **Setări** → completează toate câmpurile
2. **Leads** → selectează un județ sau oraș + categorie
3. Apasă **Caută afaceri fără site**
4. Apasă **⚡ Generează toate** pentru mesaje în masă
5. Click pe orice lead → **📱 Trimite WhatsApp**

---

## Strategia pentru a face bani AZI

### Categorii cu conversie maximă (în ordine)
1. **Salon de Înfrumusețare** – proprietarele răspund repede pe WhatsApp
2. **Brutărie/Patiserie** – acum e sezon Paști, vor comenzi online
3. **Hotel/Pensiune** – sezon turistic = urgență
4. **Frizerie/Coafor** – similar saloane
5. **Studio Foto/Video** – sezon nunți, înțeleg valoarea portofoliului

### Orașe mici = GOLDMINE (marcate cu 🏘️)
- Zero concurență online
- Proprietarul e și recepționerul și marketingul
- Răspunde în 30 minute pe WhatsApp
- Nu știe cât costă un site → prețul tău e cel de referință

### Mesajul WhatsApp care convertește
Generatorul AI aplică automat:
- Menționează recenziile lor Google (credibilitate că le-ai văzut)
- Beneficiu specific categoriei lor (nu generic)
- Preț fix (oamenii cumpără când știu exact costul)
- O singură întrebare la final (nu CTA agresiv)
- Max 5 rânduri (ecran de telefon!)

### Statistici realiste
- 30 mesaje trimise/zi → 8-10 deschid conversația
- 3-5 cer detalii → 1-2 devin clienți/săptămână
- 500-1500 RON/site = **1000-3000 RON/săptămână**

---

## Structura proiectului

```
outreach-pro/
├── app/
│   ├── page.tsx                    # Dashboard principal
│   ├── leads/page.tsx              # Pagina principală – căutare + leads + trimitere
│   ├── settings/page.tsx           # Configurare chei și profil
│   ├── api/
│   │   ├── find-businesses/        # Google Places API – caută afaceri fără site
│   │   ├── generate-message/       # Claude AI – generează WhatsApp + Email
│   │   └── send-email/             # Nodemailer – trimite email Gmail
│   └── globals.css
├── lib/
│   ├── constants.ts                # Orașe, județe, categorii, pain points
│   ├── storage.ts                  # localStorage helpers
│   └── types.ts                    # TypeScript interfaces
└── .env.example
```

---

## Deploy pe Vercel (gratuit)

```bash
npm install -g vercel
vercel
```

Adaugă variabilele de mediu în dashboard-ul Vercel.

---

## Troubleshooting

**"Google API error: REQUEST_DENIED"**
→ Activează Places API în Google Cloud Console și verifică că cheia nu are restricții de domeniu

**"Lipsă Anthropic API key"**
→ Setează cheia în Setări sau în `.env.local`

**"Nodemailer: Invalid login"**
→ Folosește App Password, nu parola normală Gmail. Activează 2FA primul.

**WhatsApp nu se deschide**
→ Verifică că WhatsApp Web e autentificat în browser, sau folosește telefonul
