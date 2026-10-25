# 🎯 Outreach Pro

## 🔁 NOU: Rebuild Their Site (`/rebuild`)

În loc de mesaje la rece, arăți valoare: găsești afaceri **prospere cu site vechi**, construiești un redesign cu **conținutul lor real** pe un **link live** și le scrii personal: *„Am făcut un concept modern pentru site-ul vostru, fără obligații.”*

1. **Caută**: un oraș, o nișă, minimum N recenzii Google (= afacere cu clienți și bani). Max. 20 de rezultate pe căutare, prin API-ul oficial Google Places.
2. **Auditează**: aplicația citește site-ul actual și găsește ce nu merge (nu e adaptat pentru mobil, nu are HTTPS, ultima actualizare e din 2014, tehnologie veche, e lent) plus textele, serviciile, emailul și pozele lor.
3. **Alege 2–3**: scorul de oportunitate combină cât de vechi e site-ul (60%) cu semnalele că afacerea face bani (40%).
4. **Redesign**: Claude construiește un site complet, fără să inventeze prețuri sau recenzii. Îl vezi pe desktop și pe mobil, apoi îl publici la `/p/<slug>` (cu banner „concept, nu site-ul oficial” și noindex).
5. **Mesaj**: îl generezi cu AI sau din șablon, îl editezi și îl trimiți **tu**, pe WhatsApp, email sau prin formularul lor. Ai o limită zilnică (implicit 10) și urmărire: răspuns, client, pierdut.

**Setup:** cheile Google Places și Anthropic (în Setări sau ca env vars), plus Vercel Blob pentru linkurile live (Vercel → Storage → Blob → Connect to project). Fără Blob: *Descarcă HTML*, apoi îl tragi pe [app.netlify.com/drop](https://app.netlify.com/drop).

**Reguli:** nu automatiza trimiterea (risc de ban, blacklist pe domeniu și încălcarea legii anti-spam), fă un singur demo excelent în loc de o sută mediocre și alege afaceri care chiar pot plăti.

---

## Fluxul clasic: afaceri fără site (`/leads`)

Aplicație Next.js care găsește automat afaceri din România fără website, generează mesaje personalizate cu Claude AI și trimite oferte pe **WhatsApp** sau Email.

## ✨ Funcționalități

- 🔍 **Căutare automată** pe Google Places – afaceri fără site din orice oraș/județ
- 📱 **Trimitere WhatsApp** cu un singur click – mesajul se copiază automat
- 🤖 **AI Personalizare** – Claude generează mesaje unice per afacere
- 🗺️ **60+ orașe** + căutare pe județ
- ⚡ **Generare în masă** – procesează toate leads-urile automat
- 💾 **Salvare locală** – leads și setări persistente

## 🚀 Deploy rapid pe Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Fork acest repo pe GitHub
2. Importă în Vercel
3. Adaugă variabilele de mediu (vezi mai jos)
4. Deploy!

## ⚙️ Variabile de mediu

Copiază `.env.example` în `.env.local` și completează:

```bash
cp .env.example .env.local
```

| Variabilă | Descriere | Unde o obții |
|-----------|-----------|--------------|
| `GOOGLE_PLACES_API_KEY` | Google Places API | [console.cloud.google.com](https://console.cloud.google.com) |
| `ANTHROPIC_API_KEY` | Claude AI | [console.anthropic.com](https://console.anthropic.com) |
| `SENDER_EMAIL` | Gmail pentru outreach | Contul tău Gmail |
| `SENDER_APP_PASSWORD` | Gmail App Password | myaccount.google.com → Security |
| `SENDER_NAME` | Numele tău | - |
| `YOUR_WEBSITE` | Site-ul tău | - |
| `YOUR_PORTFOLIO_URL` | Portofoliu lucrări | - |
| `YOUR_PHONE` | Telefon contact | - |
| `PRICE_FROM` | Preț minim RON | Default: 500 |
| `PRICE_TO` | Preț maxim RON | Default: 1500 |
| `DELIVERY_DAYS` | Zile livrare | Default: 5 |

> **Notă:** Cheile API pot fi configurate și direct din aplicație (Setări), fără `.env`.

## 💻 Rulare locală

```bash
npm install
npm run dev
```

Deschide [http://localhost:3000](http://localhost:3000)

## 📁 Structură proiect

```
outreach-pro/
├── app/
│   ├── page.tsx                    # Dashboard
│   ├── leads/page.tsx              # Pagina principală
│   ├── settings/page.tsx           # Setări
│   └── api/
│       ├── find-businesses/        # Google Places search
│       ├── generate-message/       # Claude AI mesaje
│       └── send-email/             # Trimitere email Gmail
├── lib/
│   ├── constants.ts                # Orașe, județe, categorii
│   ├── storage.ts                  # localStorage helpers
│   └── types.ts                    # TypeScript types
└── .env.example
```

## 💰 Strategie pentru clienți rapizi

**Categorii cu conversie maximă:**
- 💄 Salon de Înfrumusețare – proprietarele răspund repede pe WA
- 🥐 Brutărie/Patiserie – sezon Paști, comenzi online urgente
- 🏨 Hotel/Pensiune – sezon turistic activ
- 📸 Studio Foto – sezon nunți

**De ce orașe mici?**
- Zero concurență online
- Proprietarul e și el la telefon
- Nu știe cât costă un site → prețul tău e referința

**Statistici reale:**
- 30 mesaje/zi → 3-5 clienți interesați/săptămână
- 500-1500 RON/site = 1000-3000 RON/săptămână

## 📄 Licență

MIT
