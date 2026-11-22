'use client'

// Aplicația clientului (instalabilă pe telefon): mesajele de pe site cu răspuns dintr-o atingere
// (telefon, WhatsApp, email), editarea tarifelor / ofertelor / galeriei / contactului, contul și notificările.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shrinkImage } from '@/lib/client-image'
import { normalizePhone, waDigits, asCountry } from '@/lib/crm/countries'

interface Content {
  contact: { phone: string; email: string; address: string; hours: string }
  prices: { name: string; price: string; note: string }[]
  offers: { title: string; text: string; from: string; to: string; active: boolean }[]
  gallery: { src: string; alt: string }[]
}
interface Msg { id: string; name: string; email: string; phone: string; message: string; extra: Record<string, string> | null; status: string; replied_via: string | null; created_at: string }
interface Me { account: { email: string }; notify: { email: string | null; pending: string | null; available: boolean }; business: { id: string; name: string; country: string; preview_url: string | null; live_url: string | null }; content: Content; messages: Msg[]; vapidPublicKey: string }
type Lang = 'ro' | 'hu' | 'en'

const T = {
  ro: {
    login: 'Intră în cont', email: 'Email', password: 'Parola', signIn: 'Intră', wrong: 'Email sau parolă greșită.', locked: 'Prea multe încercări. Încearcă din nou peste 15 minute.',
    noAccount: 'Nu ai cont? Deschide linkul de activare primit pe WhatsApp.', noSuchAccount: 'Nu există cont cu acest email. Verifică adresa sau creează contul din linkul de activare.', wrongPw: 'Parola e greșită. Apasă pe ochi ca să vezi ce ai scris.', forgot: 'Ai uitat parola? Cere-i designerului site-ului un cod nou: cu același link îți setezi o parolă nouă.', show: 'Arată parola', hide: 'Ascunde parola', error: 'A apărut o eroare. Încearcă din nou.',
    inbox: 'Mesaje', site: 'Site-ul meu', account: 'Cont', viewSite: 'Vezi site-ul', refresh: 'Reîncarcă',
    fNew: 'Noi', fAll: 'Toate', fReplied: 'Răspunse', emptyNew: 'Niciun mesaj nou. Când cineva completează formularul de pe site, apare aici.', emptyAll: 'Încă niciun mesaj de pe site.',
    call: 'Sună', whatsapp: 'WhatsApp', mail: 'Email', done: 'Rezolvat', checkin: 'Sosire', checkout: 'Plecare', guests: 'persoane', repliedBy: 'Răspuns prin',
    via: { phone: 'telefon', whatsapp: 'WhatsApp', email: 'email' } as Record<string, string>,
    greet: (n: string) => `Bună ziua${n ? `, ${n}` : ''}! Vă mulțumim pentru mesajul trimis de pe site. `, mailSubject: 'Răspuns la mesajul dumneavoastră',
    prices: 'Tarife', offers: 'Oferte', gallery: 'Galerie', contact: 'Contact', name: 'Denumire', price: 'Preț', note: 'Notă (opțional)', addPrice: 'Adaugă tarif',
    offerTitle: 'Titlu', offerText: 'Descriere', from: 'De la', to: 'Până la', active: 'Activă pe site', addOffer: 'Adaugă ofertă', offersHint: 'Ofertele expirate dispar singure de pe site.',
    addPhotos: 'Adaugă poze', uploading: 'Se încarcă…', galleryHint: 'Ordinea de aici este ordinea de pe site.', phone: 'Telefon', address: 'Adresă', hours: 'Program', contactEmail: 'Email (afișat pe site)',
    save: 'Salvează', saving: 'Se salvează…', saved: 'Salvat. Apare pe site în câteva secunde.', unsaved: 'Modificări nesalvate', remove: 'Șterge',
    notif: 'Notificări pe telefon', notifOn: 'Activează notificările', notifOff: 'Oprește notificările', notifActive: 'Primești o notificare la fiecare mesaj nou.', notifBlocked: 'Notificările sunt blocate pentru acest site.', notifUnblock: ['Apasă pe iconița din stânga adresei site-ului (🔒 sau ⚙️).', 'Alege „Permisiuni” sau „Setări site” → „Notificări” → „Permite”.', 'Revino aici și apasă din nou „Activează notificările”.'], notifUnblockApp: 'Dacă aplicația e instalată: Setări telefon → Aplicații → Panoul meu → Notificări → Permite.', notifUnblockInstalled: ['Ieși din aplicație și ține apăsat pe iconița „Panoul meu” de pe ecran.', 'Apasă ⓘ („Informații aplicație”) → „Notificări” → pornește „Permite notificări”.', 'Deschide din nou aplicația: notificările pornesc singure.'], notifAuto: 'După ce le permiți, revino aici: se activează automat.', notifUnsupported: 'Browserul acesta nu primește notificări. Deschide panoul în Chrome (Android) sau instalează-l pe ecranul principal (iPhone).',
    notifIos: 'Pe iPhone, notificările merg după ce instalezi aplicația pe ecranul principal.', install: 'Instalează aplicația', installBtn: 'Instalează pe telefon',
    installIos: 'Pe iPhone: apasă Distribuie, apoi „Adaugă pe ecranul principal”.', installAndroid: 'Sau din meniul browserului ⋮: „Instalează aplicația” / „Adaugă pe ecranul de pornire”.', installed: 'Aplicația este instalată.', installStepsAndroid: ['Deschide panoul în Google Chrome (nu Opera / Samsung Internet).', 'Apasă meniul ⋮ din dreapta sus și alege „Instalează aplicația” (nu „Adaugă pe ecranul de pornire”, care pune o scurtătură cu eticheta Chrome).', 'Confirmă: „Panoul meu” apare ca aplicație, cu iconița lui.'], installStepsIos: ['Deschide panoul în Safari.', 'Apasă butonul Distribuie (pătratul cu săgeată în sus).', 'Alege „Adaugă pe ecranul principal”, apoi „Adaugă”.'], installBanner: 'Instalează panoul pe telefon, ca o aplicație', installBannerSub: 'Îl deschizi dintr-o atingere și primești notificări la mesajele noi.', later: 'Mai târziu',
    mailNotif: 'Notificări pe email', mailNotifSub: 'Primești pe email fiecare mesaj trimis din formularul site-ului.', mailAddr: 'Emailul la care vrei notificările', sendCode: 'Trimite codul', codeSentTo: 'Ți-am trimis un cod de 6 cifre la', codeLabel: 'Codul din email', confirm: 'Confirmă', resend: 'Retrimite codul', change: 'Schimbă emailul', stopMail: 'Oprește notificările pe email', mailOn: 'Primești notificările la', wrongCode: 'Cod greșit.', expiredCode: 'Codul a expirat. Cere unul nou.', waitCode: 'Așteaptă un minut înainte de un cod nou.', mailBad: 'Emailul nu pare corect.', mailSoon: 'Notificările pe email vor fi disponibile în curând.', checkSpam: 'Nu găsești emailul? Uită-te și în Spam.',
    changePw: 'Schimbă parola', currentPw: 'Parola actuală', newPw: 'Parola nouă (minim 8 caractere)', pwSaved: 'Parola a fost schimbată.', logout: 'Ieși din cont', signedAs: 'Conectat ca',
    today: 'azi', yesterday: 'ieri',
  },
  hu: {
    login: 'Belépés', email: 'E-mail', password: 'Jelszó', signIn: 'Belépés', wrong: 'Hibás e-mail vagy jelszó.', locked: 'Túl sok próbálkozás. Próbálja újra 15 perc múlva.',
    noAccount: 'Nincs még fiókja? Nyissa meg a WhatsAppon kapott aktiváló linket.', noSuchAccount: 'Ezzel az e-mail címmel nincs fiók. Ellenőrizze a címet, vagy hozza létre a fiókot az aktiváló linkkel.', wrongPw: 'Hibás jelszó. Koppintson a szemre, hogy lássa, mit írt be.', forgot: 'Elfelejtette a jelszót? Kérjen új kódot a weboldal készítőjétől: ugyanazzal a linkkel új jelszót állíthat be.', show: 'Jelszó mutatása', hide: 'Jelszó elrejtése', error: 'Hiba történt. Próbálja újra.',
    inbox: 'Üzenetek', site: 'Weboldalam', account: 'Fiók', viewSite: 'Weboldal', refresh: 'Frissítés',
    fNew: 'Új', fAll: 'Összes', fReplied: 'Megválaszolt', emptyNew: 'Nincs új üzenet. Ha valaki kitölti az űrlapot, itt jelenik meg.', emptyAll: 'Még nem érkezett üzenet.',
    call: 'Hívás', whatsapp: 'WhatsApp', mail: 'E-mail', done: 'Kész', checkin: 'Érkezés', checkout: 'Távozás', guests: 'fő', repliedBy: 'Válasz:',
    via: { phone: 'telefon', whatsapp: 'WhatsApp', email: 'e-mail' } as Record<string, string>,
    greet: (n: string) => `Jó napot${n ? `, ${n}` : ''}! Köszönjük az üzenetét. `, mailSubject: 'Válasz az üzenetére',
    prices: 'Árak', offers: 'Ajánlatok', gallery: 'Galéria', contact: 'Elérhetőség', name: 'Megnevezés', price: 'Ár', note: 'Megjegyzés (nem kötelező)', addPrice: 'Új ár',
    offerTitle: 'Cím', offerText: 'Leírás', from: 'Kezdete', to: 'Vége', active: 'Aktív az oldalon', addOffer: 'Új ajánlat', offersHint: 'A lejárt ajánlatok automatikusan eltűnnek.',
    addPhotos: 'Képek hozzáadása', uploading: 'Feltöltés…', galleryHint: 'Az itteni sorrend az oldalon is ugyanaz.', phone: 'Telefon', address: 'Cím', hours: 'Nyitvatartás', contactEmail: 'E-mail (megjelenik az oldalon)',
    save: 'Mentés', saving: 'Mentés…', saved: 'Mentve. Néhány másodperc múlva megjelenik az oldalon.', unsaved: 'Nem mentett változások', remove: 'Törlés',
    notif: 'Értesítések', notifOn: 'Értesítések bekapcsolása', notifOff: 'Értesítések kikapcsolása', notifActive: 'Minden új üzenetről értesítést kap.', notifBlocked: 'Az értesítések le vannak tiltva ennél az oldalnál.', notifUnblock: ['Koppintson a címsor bal oldalán lévő ikonra (🔒 vagy ⚙️).', 'Válassza: „Engedélyek” vagy „Webhelybeállítások” → „Értesítések” → „Engedélyezés”.', 'Térjen vissza ide, és koppintson ismét az „Értesítések bekapcsolása” gombra.'], notifUnblockApp: 'Ha az alkalmazás telepítve van: Telefon beállításai → Alkalmazások → Panoul meu → Értesítések → Engedélyezés.', notifUnblockInstalled: ['Lépjen ki az alkalmazásból, és tartsa lenyomva a „Panoul meu” ikont.', 'Koppintson az ⓘ („Alkalmazásinformáció”) → „Értesítések” → kapcsolja be.', 'Nyissa meg újra az alkalmazást: az értesítések maguktól bekapcsolnak.'], notifAuto: 'Engedélyezés után térjen vissza ide: automatikusan bekapcsolnak.', notifUnsupported: 'Ez a böngésző nem fogad értesítéseket. Nyissa meg Chrome-ban (Android), vagy adja hozzá a kezdőképernyőhöz (iPhone).',
    notifIos: 'iPhone-on az értesítések a kezdőképernyőre telepítés után működnek.', install: 'Alkalmazás telepítése', installBtn: 'Telepítés a telefonra',
    installIos: 'iPhone-on: Megosztás, majd „Főképernyőhöz adás”.', installAndroid: 'Vagy a böngésző menüjéből ⋮: „Alkalmazás telepítése”.', installed: 'Az alkalmazás telepítve van.', installStepsAndroid: ['Nyissa meg a Google Chrome-ban (nem Operában / Samsung Internetben).', 'Koppintson a ⋮ menüre, és válassza az „Alkalmazás telepítése” lehetőséget (nem a „Hozzáadás a kezdőképernyőhöz”, az csak parancsikon Chrome-jelzéssel).', 'Erősítse meg: a „Panoul meu” alkalmazásként jelenik meg, saját ikonnal.'], installStepsIos: ['Nyissa meg Safariban.', 'Koppintson a Megosztás gombra (négyzet felfelé mutató nyíllal).', 'Válassza a „Főképernyőhöz adás”, majd a „Hozzáadás” lehetőséget.'], installBanner: 'Telepítse a telefonjára alkalmazásként', installBannerSub: 'Egy koppintással megnyitja, és értesítést kap az új üzenetekről.', later: 'Később',
    mailNotif: 'E-mail értesítések', mailNotifSub: 'Minden űrlapüzenetet megkap e-mailben is.', mailAddr: 'E-mail cím az értesítésekhez', sendCode: 'Kód küldése', codeSentTo: '6 jegyű kódot küldtünk ide:', codeLabel: 'Az e-mailben kapott kód', confirm: 'Megerősítés', resend: 'Kód újraküldése', change: 'E-mail módosítása', stopMail: 'E-mail értesítések kikapcsolása', mailOn: 'Az értesítések ide érkeznek:', wrongCode: 'Hibás kód.', expiredCode: 'A kód lejárt. Kérjen újat.', waitCode: 'Várjon egy percet az új kód előtt.', mailBad: 'Az e-mail cím nem tűnik helyesnek.', mailSoon: 'Az e-mail értesítések hamarosan elérhetők lesznek.', checkSpam: 'Nem találja? Nézze meg a Spam mappát is.',
    changePw: 'Jelszó módosítása', currentPw: 'Jelenlegi jelszó', newPw: 'Új jelszó (legalább 8 karakter)', pwSaved: 'A jelszó megváltozott.', logout: 'Kilépés', signedAs: 'Bejelentkezve:',
    today: 'ma', yesterday: 'tegnap',
  },
  en: {
    login: 'Sign in', email: 'Email', password: 'Password', signIn: 'Sign in', wrong: 'Wrong email or password.', locked: 'Too many attempts. Try again in 15 minutes.',
    noAccount: 'No account yet? Open the activation link you received on WhatsApp.', noSuchAccount: 'There is no account with this email. Check the address or create the account from your activation link.', wrongPw: 'Wrong password. Tap the eye to see what you typed.', forgot: 'Forgot your password? Ask your website designer for a new code: the same link lets you set a new password.', show: 'Show password', hide: 'Hide password', error: 'Something went wrong. Please try again.',
    inbox: 'Messages', site: 'My website', account: 'Account', viewSite: 'View site', refresh: 'Refresh',
    fNew: 'New', fAll: 'All', fReplied: 'Replied', emptyNew: 'No new messages. When someone fills in your website form, it shows up here.', emptyAll: 'No messages yet.',
    call: 'Call', whatsapp: 'WhatsApp', mail: 'Email', done: 'Done', checkin: 'Check-in', checkout: 'Check-out', guests: 'guests', repliedBy: 'Replied by',
    via: { phone: 'phone', whatsapp: 'WhatsApp', email: 'email' } as Record<string, string>,
    greet: (n: string) => `Hello${n ? ` ${n}` : ''}, thank you for your message. `, mailSubject: 'Re: your message',
    prices: 'Prices', offers: 'Offers', gallery: 'Gallery', contact: 'Contact', name: 'Name', price: 'Price', note: 'Note (optional)', addPrice: 'Add price',
    offerTitle: 'Title', offerText: 'Description', from: 'From', to: 'Until', active: 'Live on site', addOffer: 'Add offer', offersHint: 'Expired offers disappear automatically.',
    addPhotos: 'Add photos', uploading: 'Uploading…', galleryHint: 'The order here is the order on your site.', phone: 'Phone', address: 'Address', hours: 'Opening hours', contactEmail: 'Email (shown on your site)',
    save: 'Save', saving: 'Saving…', saved: 'Saved. It shows on your site in a few seconds.', unsaved: 'Unsaved changes', remove: 'Remove',
    notif: 'Notifications', notifOn: 'Turn on notifications', notifOff: 'Turn off notifications', notifActive: 'You get a notification for every new message.', notifBlocked: 'Notifications are blocked for this site.', notifUnblock: ['Tap the icon left of the site address (🔒 or ⚙️).', 'Choose “Permissions” or “Site settings” → “Notifications” → “Allow”.', 'Come back and tap “Turn on notifications” again.'], notifUnblockApp: 'If the app is installed: phone Settings → Apps → Panoul meu → Notifications → Allow.', notifUnblockInstalled: ['Leave the app and long-press the “Panoul meu” icon on your home screen.', 'Tap ⓘ (“App info”) → “Notifications” → turn them on.', 'Open the app again: notifications turn on by themselves.'], notifAuto: 'Once allowed, come back here: they turn on automatically.', notifUnsupported: 'This browser cannot receive notifications. Open it in Chrome (Android) or add it to your home screen (iPhone).',
    notifIos: 'On iPhone, notifications work after you add the app to your home screen.', install: 'Install the app', installBtn: 'Install on phone',
    installIos: 'On iPhone: tap Share, then “Add to Home Screen”.', installAndroid: 'Or from the browser menu ⋮: “Install app”.', installed: 'The app is installed.', installStepsAndroid: ['Open it in Google Chrome (not Opera / Samsung Internet).', 'Tap the ⋮ menu and choose “Install app” (not “Add to Home screen”, which adds a shortcut with the Chrome badge).', 'Confirm: “Panoul meu” appears as an app with its own icon.'], installStepsIos: ['Open it in Safari.', 'Tap the Share button (square with an up arrow).', 'Choose “Add to Home Screen”, then “Add”.'], installBanner: 'Install the panel on your phone as an app', installBannerSub: 'Open it with one tap and get notified about new messages.', later: 'Later',
    mailNotif: 'Email notifications', mailNotifSub: 'Get every message from your website form by email too.', mailAddr: 'Email for notifications', sendCode: 'Send code', codeSentTo: 'We sent a 6-digit code to', codeLabel: 'Code from the email', confirm: 'Confirm', resend: 'Resend code', change: 'Change email', stopMail: 'Turn off email notifications', mailOn: 'Notifications go to', wrongCode: 'Wrong code.', expiredCode: 'The code has expired. Ask for a new one.', waitCode: 'Wait a minute before asking for a new code.', mailBad: 'That email does not look right.', mailSoon: 'Email notifications will be available soon.', checkSpam: 'Can’t find it? Check your Spam folder.',
    changePw: 'Change password', currentPw: 'Current password', newPw: 'New password (at least 8 characters)', pwSaved: 'Password changed.', logout: 'Sign out', signedAs: 'Signed in as',
    today: 'today', yesterday: 'yesterday',
  },
}

const input = 'w-full h-12 rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500'
const card = 'bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,.04),0_4px_16px_rgba(15,23,42,.04)]'

const Icon = {
  inbox: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>,
  site: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18" /><path d="M8 14h5" /></svg>,
  user: <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  phone: <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
  wa: <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.8a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.72.97.99-3.62-.24-.37A9.8 9.8 0 1 1 12.05 21.8zm8.42-18.22A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.88c0 2.1.55 4.14 1.59 5.94L.06 24l6.33-1.66a11.86 11.86 0 0 0 5.66 1.44h.01c6.55 0 11.88-5.33 11.89-11.88a11.8 11.8 0 0 0-3.48-8.32z" /></svg>,
  mail: <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="m22 7-10 6L2 7" /></svg>,
  check: <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  refresh: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" /></svg>,
  ext: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>,
  up: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 15 6-6 6 6" /></svg>,
  down: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>,
  trash: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>,
  plus: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  cal: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
}

type InstallEvt = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> }
let deferredInstall: InstallEvt | null = null
const installListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e as InstallEvt; installListeners.forEach(f => f()) })
  window.addEventListener('appinstalled', () => { deferredInstall = null; installListeners.forEach(f => f()) })
}
function useInstall() {
  const [, force] = useState(0)
  const [standalone, setStandalone] = useState(false)
  useEffect(() => {
    const f = () => force(x => x + 1)
    installListeners.add(f)
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
    return () => { installListeners.delete(f) }
  }, [])
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  return { standalone, ios, canPrompt: !!deferredInstall, prompt: async () => { const e = deferredInstall; if (!e) return false; await e.prompt(); deferredInstall = null; force(x => x + 1); return true } }
}

function InstallCard({ t, compact, onClose }: { t: typeof T.ro; compact?: boolean; onClose?: () => void }) {
  const { standalone, ios, canPrompt, prompt } = useInstall()
  const [steps, setSteps] = useState(false)
  if (standalone) return compact ? null : <p className="text-[13px] text-emerald-700">{t.installed}</p>
  const list = ios ? t.installStepsIos : t.installStepsAndroid
  return (
    <div className={compact ? `${card} p-4 flex gap-3 items-start` : ''}>
      {compact && <img src="/icons/client-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />}
      <div className="flex-1 min-w-0">
        {compact && <><div className="font-semibold leading-snug">{t.installBanner}</div><p className="text-[13px] text-slate-500 mt-0.5">{t.installBannerSub}</p></>}
        <div className="flex flex-wrap gap-2 mt-2">
          <button onClick={async () => { if (!(await prompt())) setSteps(v => !v) }} className="h-10 px-4 rounded-xl bg-teal-600 text-white font-medium">{t.installBtn}</button>
          {compact && onClose && <button onClick={onClose} className="h-10 px-3 rounded-xl text-slate-500">{t.later}</button>}
        </div>
        {(steps || (!compact && !canPrompt)) && (
          <ol className="mt-3 space-y-1.5 text-[13px] text-slate-700">
            {list.map((x, i) => <li key={i} className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] grid place-items-center">{i + 1}</span>{x}</li>)}
          </ol>
        )}
      </div>
    </div>
  )
}

function move<X>(list: X[], i: number, d: number): X[] { const j = i + d; if (j < 0 || j >= list.length) return list; const c = list.slice(); [c[i], c[j]] = [c[j], c[i]]; return c }
function b64ToUint8(s: string) { const pad = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)) }

async function call<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'same-origin' })
  const data = await res.json().catch(() => ({})) as T
  return { ok: res.ok, status: res.status, data }
}

export default function ClientApp() {
  const [me, setMe] = useState<Me | null>(null)
  const [state, setState] = useState<'loading' | 'login' | 'ready'>('loading')
  const [lang, setLang] = useState<Lang>('ro')
  const t = T[lang]

  const load = useCallback(async () => {
    const r = await call<Me>('/api/client/me')
    if (r.status === 401) { setState('login'); return }
    if (r.ok) { setMe(r.data); setLang(r.data.business.country === 'HU' ? 'hu' : r.data.business.country === 'UK' ? 'en' : 'ro'); setState('ready') }
  }, [])
  useEffect(() => {
    try { const saved = localStorage.getItem('client_lang'); const l = (saved || navigator.language).slice(0, 2); if (l === 'hu' || l === 'en' || l === 'ro') setLang(l as Lang) } catch { /* */ }
    load()
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/client-sw.js', { scope: '/client' }).catch(() => {})
  }, [load])

  if (state === 'loading') return <div className="min-h-[100dvh] grid place-items-center bg-[#f4f5f7]"><div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" /></div>
  if (state === 'login' || !me) return <Login t={t} lang={lang} setLang={l => { setLang(l); try { localStorage.setItem('client_lang', l) } catch { /* */ } }} onDone={load} />
  return <Shell me={me} t={t} lang={lang} reload={load} setMe={setMe} />
}

function Login({ t, lang, setLang, onDone }: { t: typeof T.ro; lang: Lang; setLang: (l: Lang) => void; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const r = await call<{ error?: string }>('/api/client/login', 'POST', { email: email.trim(), password: pw })
    setBusy(false)
    if (r.ok) onDone()
    else setErr(r.status === 429 ? t.locked : r.status === 401 ? (r.data.error === 'no_account' ? t.noSuchAccount : t.wrongPw) : t.error)
  }
  return (
    <main className="min-h-[100dvh] bg-[#f4f5f7] text-slate-900 flex flex-col">
      <div className="bg-slate-900 text-white px-6 pt-[max(48px,env(safe-area-inset-top))] pb-16">
        <img src="/icons/client-192.png" alt="" className="w-12 h-12 rounded-xl mb-5" />
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">{t.login}</h1>
          <div className="flex gap-1 text-[12px] font-medium">
            {(['ro', 'hu', 'en'] as Lang[]).map(l => <button key={l} type="button" onClick={() => setLang(l)} className={`h-8 px-2.5 rounded-full uppercase ${lang === l ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300'}`}>{l}</button>)}
          </div>
        </div>
      </div>
      <form onSubmit={submit} className={`${card} mx-4 -mt-10 p-5 space-y-4`}>
        <label className="block text-[13px] font-medium text-slate-600">{t.email}<input className={`${input} mt-1.5`} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label className="block text-[13px] font-medium text-slate-600">{t.password}
          <div className="relative mt-1.5">
            <input className={`${input} pr-12`} type={showPw ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required />
            <button type="button" aria-label={showPw ? t.hide : t.show} onClick={() => setShowPw(v => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 grid place-items-center rounded-lg text-slate-500">
              {showPw
                ? <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="m1 1 22 22" /></svg>
                : <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
            </button>
          </div>
        </label>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button className="w-full h-12 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50 active:scale-[.98] transition" disabled={busy}>{busy ? '…' : t.signIn}</button>
      </form>
      <p className="mx-6 mt-5 text-[13px] text-slate-500 text-center">{t.noAccount}</p>
      <p className="mx-6 mt-2 text-[13px] text-slate-500 text-center">{t.forgot}</p>
    </main>
  )
}

function Shell({ me, t, lang, reload, setMe }: { me: Me; t: typeof T.ro; lang: Lang; reload: () => Promise<void>; setMe: (m: Me) => void }) {
  const [tab, setTab] = useState<'inbox' | 'site' | 'account'>('inbox')
  const unread = me.messages.filter(m => m.status === 'new').length
  const siteUrl = me.business.live_url || me.business.preview_url
  const [spinning, setSpinning] = useState(false)
  const refresh = useCallback(async () => { setSpinning(true); await reload(); setTimeout(() => setSpinning(false), 400) }, [reload])

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (unread) nav.setAppBadge?.(unread).catch(() => {}); else nav.clearAppBadge?.().catch(() => {})
  }, [unread])
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'refresh') reload() }
    document.addEventListener('visibilitychange', onVis)
    navigator.serviceWorker?.addEventListener('message', onMsg)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 60_000)
    return () => { document.removeEventListener('visibilitychange', onVis); navigator.serviceWorker?.removeEventListener('message', onMsg); clearInterval(iv) }
  }, [reload])

  const tabs: { k: typeof tab; label: string; icon: JSX.Element; badge?: number }[] = [
    { k: 'inbox', label: t.inbox, icon: Icon.inbox, badge: unread },
    { k: 'site', label: t.site, icon: Icon.site },
    { k: 'account', label: t.account, icon: Icon.user },
  ]
  return (
    <div className="min-h-[100dvh] bg-[#f4f5f7] text-slate-900">
      <header className="sticky top-0 z-30 bg-slate-900 text-white pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src="/icons/client-192.png" alt="" className="w-8 h-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[.14em] text-slate-400">{tabs.find(x => x.k === tab)?.label}</div>
            <div className="font-semibold leading-tight truncate">{me.business.name}</div>
          </div>
          {siteUrl && <a href={siteUrl} target="_blank" rel="noreferrer" className="h-9 px-3 inline-flex items-center gap-1 rounded-full bg-white/10 text-[13px]">{t.viewSite} {Icon.ext}</a>}
          <button aria-label={t.refresh} onClick={refresh} className="h-9 w-9 grid place-items-center rounded-full bg-white/10"><span className={spinning ? 'animate-spin' : ''}>{Icon.refresh}</span></button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {tab === 'inbox' && <Inbox me={me} t={t} lang={lang} setMe={setMe} />}
        {tab === 'site' && <SiteEditor me={me} t={t} setMe={setMe} />}
        {tab === 'account' && <Account me={me} t={t} reload={reload} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto grid grid-cols-3">
          {tabs.map(x => (
            <button key={x.k} onClick={() => setTab(x.k)} className={`relative h-16 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${tab === x.k ? 'text-teal-700' : 'text-slate-500'}`}>
              <span className="relative">{x.icon}{!!x.badge && <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">{x.badge > 99 ? '99+' : x.badge}</span>}</span>
              {x.label}
              {tab === x.k && <span className="absolute top-0 h-[3px] w-10 rounded-b-full bg-teal-600" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function when(iso: string, t: typeof T.ro, lang: Lang) {
  const d = new Date(iso), now = new Date()
  const loc = lang === 'hu' ? 'hu-HU' : lang === 'en' ? 'en-GB' : 'ro-RO'
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5)
  return days === 0 ? `${t.today}, ${time}` : days === 1 ? `${t.yesterday}, ${time}` : d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + `, ${time}`
}

function Inbox({ me, t, lang, setMe }: { me: Me; t: typeof T.ro; lang: Lang; setMe: (m: Me) => void }) {
  const [filter, setFilter] = useState<'new' | 'all' | 'replied'>(() => (me.messages.some(m => m.status === 'new') ? 'new' : 'all'))
  const [openId, setOpenId] = useState<string | null>(null)
  const list = me.messages.filter(m => m.status !== 'archived' && (filter === 'all' || (filter === 'new' ? m.status === 'new' : m.status === 'replied')))
  const country = asCountry(me.business.country)

  function patch(id: string, status: string, via?: string) {
    setMe({ ...me, messages: me.messages.map(m => (m.id === id ? { ...m, status, replied_via: via || m.replied_via } : m)) })
    call('/api/client/messages', 'PATCH', { id, status, via })
  }
  function open(m: Msg) { setOpenId(openId === m.id ? null : m.id); if (m.status === 'new') patch(m.id, 'read') }

  const counts = { new: me.messages.filter(m => m.status === 'new').length, replied: me.messages.filter(m => m.status === 'replied').length }
  const [banner, setBanner] = useState(false)
  useEffect(() => { try { setBanner(Number(localStorage.getItem('client_install_later') || 0) < Date.now()) } catch { setBanner(true) } }, [])
  const later = () => { setBanner(false); try { localStorage.setItem('client_install_later', String(Date.now() + 3 * 864e5)) } catch { /* */ } }
  return (
    <div className="space-y-3">
      {banner && <InstallCard t={t} compact onClose={later} />}
      <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-200/70 text-[13px] font-medium">
        {([['new', `${t.fNew}${counts.new ? ` · ${counts.new}` : ''}`], ['all', t.fAll], ['replied', t.fReplied]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`h-9 rounded-lg ${filter === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>{l}</button>
        ))}
      </div>
      {!list.length && (
        <div className={`${card} p-8 text-center`}>
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 grid place-items-center text-slate-400 mb-3">{Icon.inbox}</div>
          <p className="text-[14px] text-slate-500">{filter === 'new' ? t.emptyNew : t.emptyAll}</p>
        </div>
      )}
      {list.map(m => {
        const who = m.name || m.email || m.phone
        const digits = m.phone ? waDigits(normalizePhone(m.phone, country) || '') : null
        const greet = t.greet(m.name.split(' ')[0] || '')
        const isOpen = openId === m.id || m.status === 'new'
        return (
          <article key={m.id} className={`${card} overflow-hidden ${m.status === 'new' ? 'ring-1 ring-teal-500/30' : ''}`}>
            <button className="w-full text-left p-4 flex gap-3" onClick={() => open(m)}>
              <div className={`shrink-0 w-11 h-11 rounded-full grid place-items-center font-semibold ${m.status === 'new' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{(who || '?').trim().charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className={`truncate ${m.status === 'new' ? 'font-semibold' : 'font-medium'}`}>{who}</div>
                  <div className="shrink-0 text-[12px] text-slate-400">{when(m.created_at, t, lang)}</div>
                </div>
                {m.extra && (m.extra.checkin || m.extra.checkout || m.extra.guests) && (
                  <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-teal-800 bg-teal-50 rounded-full px-2 py-0.5">{Icon.cal}{[m.extra.checkin, m.extra.checkout].filter(Boolean).join(' → ')}{m.extra.guests ? ` · ${m.extra.guests} ${t.guests}` : ''}</div>
                )}
                <p className={`mt-1 text-[14px] text-slate-600 whitespace-pre-wrap ${isOpen ? '' : 'line-clamp-2'}`}>{m.message}</p>
                {m.status === 'replied' && m.replied_via && <div className="mt-1.5 text-[12px] text-emerald-700 flex items-center gap-1">{Icon.check}{t.repliedBy} {t.via[m.replied_via]}</div>}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 grid grid-cols-4 gap-2">
                {m.phone ? <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`} onClick={() => patch(m.id, 'replied', 'phone')} className="h-12 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center text-[11px] gap-0.5">{Icon.phone}{t.call}</a> : <span />}
                {digits ? <a href={`https://wa.me/${digits}?text=${encodeURIComponent(greet)}`} target="_blank" rel="noreferrer" onClick={() => patch(m.id, 'replied', 'whatsapp')} className="h-12 rounded-xl bg-[#25D366] text-white flex flex-col items-center justify-center text-[11px] gap-0.5">{Icon.wa}{t.whatsapp}</a> : <span />}
                {m.email ? <a href={`mailto:${m.email}?subject=${encodeURIComponent(t.mailSubject)}&body=${encodeURIComponent(`${greet}\n\n`)}`} onClick={() => patch(m.id, 'replied', 'email')} className="h-12 rounded-xl bg-sky-600 text-white flex flex-col items-center justify-center text-[11px] gap-0.5">{Icon.mail}{t.mail}</a> : <span />}
                <button onClick={() => patch(m.id, m.status === 'replied' ? 'read' : 'replied')} className={`h-12 rounded-xl border flex flex-col items-center justify-center text-[11px] gap-0.5 ${m.status === 'replied' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-slate-200 text-slate-600'}`}>{Icon.check}{t.done}</button>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function SiteEditor({ me, t, setMe }: { me: Me; t: typeof T.ro; setMe: (m: Me) => void }) {
  const [sec, setSec] = useState<'prices' | 'offers' | 'gallery' | 'contact'>('prices')
  const [data, setData] = useState<Content>(me.content)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const savedRef = useRef(me.content)
  const update = (fn: (c: Content) => Content) => { setData(c => fn(c)); setDirty(true); setMsg('') }

  async function save() {
    setBusy('save'); setMsg('')
    const r = await call<{ content: Content }>('/api/client/content', 'PUT', { content: data })
    setBusy('')
    if (r.ok) { setData(r.data.content); savedRef.current = r.data.content; setDirty(false); setMsg(t.saved); setMe({ ...me, content: r.data.content }) }
    else setMsg(t.error)
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setBusy('upload')
    const { upload } = await import('@vercel/blob/client')
    const added: { src: string; alt: string }[] = []
    for (const f of Array.from(files).slice(0, 30)) {
      try {
        const b = await upload(`cms/${me.business.id}/${Date.now()}.jpg`, await shrinkImage(f), { access: 'public', handleUploadUrl: '/api/client/upload', contentType: 'image/jpeg' })
        added.push({ src: b.url, alt: '' })
      } catch { /* o poză stricată nu oprește restul */ }
    }
    setBusy('')
    if (added.length) update(c => ({ ...c, gallery: [...c.gallery, ...added] }))
  }

  const small = 'h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-600 grid place-items-center'
  const sections = [['prices', t.prices], ['offers', t.offers], ['gallery', t.gallery], ['contact', t.contact]] as const
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
        {sections.map(([k, l]) => (
          <button key={k} onClick={() => setSec(k)} className={`h-9 px-4 rounded-full text-[13px] font-medium whitespace-nowrap border ${sec === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>{l}</button>
        ))}
      </div>

      {sec === 'prices' && <>
        {data.prices.map((p, i) => (
          <div key={i} className={`${card} p-3 space-y-2`}>
            <input className={input} placeholder={t.name} value={p.name} onChange={e => update(c => ({ ...c, prices: c.prices.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
            <div className="flex gap-2">
              <input className={input} placeholder={t.price} value={p.price} onChange={e => update(c => ({ ...c, prices: c.prices.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) }))} />
              <div className="flex flex-col gap-1"><button className={small} onClick={() => update(c => ({ ...c, prices: move(c.prices, i, -1) }))}>{Icon.up}</button><button className={small} onClick={() => update(c => ({ ...c, prices: move(c.prices, i, 1) }))}>{Icon.down}</button></div>
            </div>
            <div className="flex gap-2">
              <input className={input} placeholder={t.note} value={p.note} onChange={e => update(c => ({ ...c, prices: c.prices.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) }))} />
              <button className={`${small} h-12 w-12 text-rose-600`} aria-label={t.remove} onClick={() => update(c => ({ ...c, prices: c.prices.filter((_, j) => j !== i) }))}>{Icon.trash}</button>
            </div>
          </div>
        ))}
        <button className="w-full h-12 rounded-2xl border-2 border-dashed border-slate-300 text-slate-600 font-medium flex items-center justify-center gap-2" onClick={() => update(c => ({ ...c, prices: [...c.prices, { name: '', price: '', note: '' }] }))}>{Icon.plus}{t.addPrice}</button>
      </>}

      {sec === 'offers' && <>
        <p className="text-[13px] text-slate-500 px-1">{t.offersHint}</p>
        {data.offers.map((o, i) => (
          <div key={i} className={`${card} p-3 space-y-2 ${o.active ? '' : 'opacity-70'}`}>
            <input className={input} placeholder={t.offerTitle} value={o.title} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} />
            <textarea className={`${input} h-24 py-3`} placeholder={t.offerText} value={o.text} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] text-slate-500">{t.from}<input type="date" className={input} value={o.from} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) }))} /></label>
              <label className="text-[12px] text-slate-500">{t.to}<input type="date" className={input} value={o.to} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) }))} /></label>
            </div>
            <div className="flex items-center gap-2">
              <label className="mr-auto flex items-center gap-2.5 text-[14px] text-slate-700">
                <span className={`relative w-11 h-6 rounded-full transition ${o.active ? 'bg-teal-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${o.active ? 'left-[22px]' : 'left-0.5'}`} /></span>
                <input type="checkbox" className="sr-only" checked={o.active} onChange={e => update(c => ({ ...c, offers: c.offers.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)) }))} />{t.active}
              </label>
              <button className={small} onClick={() => update(c => ({ ...c, offers: move(c.offers, i, -1) }))}>{Icon.up}</button>
              <button className={small} onClick={() => update(c => ({ ...c, offers: move(c.offers, i, 1) }))}>{Icon.down}</button>
              <button className={`${small} text-rose-600`} aria-label={t.remove} onClick={() => update(c => ({ ...c, offers: c.offers.filter((_, j) => j !== i) }))}>{Icon.trash}</button>
            </div>
          </div>
        ))}
        <button className="w-full h-12 rounded-2xl border-2 border-dashed border-slate-300 text-slate-600 font-medium flex items-center justify-center gap-2" onClick={() => update(c => ({ ...c, offers: [...c.offers, { title: '', text: '', from: '', to: '', active: true }] }))}>{Icon.plus}{t.addOffer}</button>
      </>}

      {sec === 'gallery' && <>
        <p className="text-[13px] text-slate-500 px-1">{t.galleryHint}</p>
        <div className="grid grid-cols-3 gap-2">
          {data.gallery.map((g, i) => (
            <div key={g.src} className="relative">
              <img src={g.src} alt="" className="w-full aspect-square object-cover rounded-xl border border-slate-200" />
              <div className="absolute inset-x-1 bottom-1 flex justify-between">
                <button className="h-7 w-7 rounded-lg bg-white/95 grid place-items-center -rotate-90" onClick={() => update(c => ({ ...c, gallery: move(c.gallery, i, -1) }))}>{Icon.up}</button>
                <button className="h-7 w-7 rounded-lg bg-white/95 text-rose-600 grid place-items-center" aria-label={t.remove} onClick={() => update(c => ({ ...c, gallery: c.gallery.filter((_, j) => j !== i) }))}>{Icon.trash}</button>
                <button className="h-7 w-7 rounded-lg bg-white/95 grid place-items-center rotate-90" onClick={() => update(c => ({ ...c, gallery: move(c.gallery, i, 1) }))}>{Icon.up}</button>
              </div>
            </div>
          ))}
          <label className="aspect-square rounded-xl border-2 border-dashed border-slate-300 text-slate-500 flex flex-col items-center justify-center gap-1 text-[12px] cursor-pointer">
            {busy === 'upload' ? <span className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" /> : Icon.plus}
            {busy === 'upload' ? t.uploading : t.addPhotos}
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy === 'upload'} onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      </>}

      {sec === 'contact' && (
        <div className={`${card} p-4 space-y-3`}>
          {([['phone', t.phone, 'tel'], ['email', t.contactEmail, 'email'], ['address', t.address, 'text']] as const).map(([k, l, type]) => (
            <label key={k} className="block text-[13px] font-medium text-slate-600">{l}<input type={type} className={`${input} mt-1.5`} value={data.contact[k]} onChange={e => update(c => ({ ...c, contact: { ...c.contact, [k]: e.target.value } }))} /></label>
          ))}
          <label className="block text-[13px] font-medium text-slate-600">{t.hours}<textarea className={`${input} mt-1.5 h-24 py-3`} value={data.contact.hours} onChange={e => update(c => ({ ...c, contact: { ...c.contact, hours: e.target.value } }))} /></label>
        </div>
      )}

      {(dirty || msg) && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 px-4 pb-3">
          <div className="max-w-2xl mx-auto rounded-2xl bg-slate-900 text-white shadow-xl p-2.5 pl-4 flex items-center gap-3">
            <span className="flex-1 text-[13px]">{msg || t.unsaved}</span>
            {dirty && <button className="h-10 px-5 rounded-xl bg-teal-500 text-slate-950 font-semibold disabled:opacity-60" disabled={busy === 'save' || busy === 'upload'} onClick={save}>{busy === 'save' ? t.saving : t.save}</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function MailNotif({ me, t, reload }: { me: Me; t: typeof T.ro; reload: () => Promise<void> }) {
  const [step, setStep] = useState<'view' | 'edit' | 'code'>(me.notify.pending ? 'code' : me.notify.email ? 'view' : 'edit')
  const [email, setEmail] = useState(me.notify.pending || me.notify.email || me.account.email)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const errText = (s: number, e?: string) => s === 429 ? t.waitCode : s === 410 ? t.expiredCode : s === 401 ? t.wrongCode : e === 'email' ? t.mailBad : t.error
  async function send() {
    setBusy(true); setMsg('')
    const r = await call<{ error?: string }>('/api/client/notify-email', 'POST', { email })
    setBusy(false)
    if (r.ok) { setStep('code'); setCode('') } else setMsg(errText(r.status, r.data.error))
  }
  async function confirm() {
    setBusy(true); setMsg('')
    const r = await call<{ error?: string }>('/api/client/notify-email/confirm', 'POST', { code })
    setBusy(false)
    if (r.ok) { setStep('view'); await reload() } else setMsg(errText(r.status, r.data.error))
  }
  async function stop() { await call('/api/client/notify-email', 'DELETE'); setStep('edit'); await reload() }
  if (!me.notify.available) return <p className="text-[13px] text-slate-500">{t.mailSoon}</p>
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-slate-500">{t.mailNotifSub}</p>
      {step === 'view' && me.notify.email && <>
        <p className="text-[14px] text-emerald-700 flex items-center gap-1.5">{Icon.check}{t.mailOn} <b className="break-all">{me.notify.email}</b></p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setEmail(me.notify.email || ''); setStep('edit') }} className="h-10 px-4 rounded-xl border border-slate-200 text-[14px] font-medium">{t.change}</button>
          <button onClick={stop} className="h-10 px-4 rounded-xl text-rose-600 text-[14px]">{t.stopMail}</button>
        </div>
      </>}
      {step === 'edit' && <>
        <input className={input} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={t.mailAddr} value={email} onChange={e => setEmail(e.target.value)} />
        <button onClick={send} disabled={busy || !email.trim()} className="h-11 px-4 rounded-xl bg-slate-900 text-white font-medium disabled:opacity-50">{busy ? '…' : t.sendCode}</button>
      </>}
      {step === 'code' && <>
        <p className="text-[13px] text-slate-700">{t.codeSentTo} <b className="break-all">{email}</b></p>
        <input className={`${input} text-center text-2xl tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
        <div className="flex flex-wrap gap-2">
          <button onClick={confirm} disabled={busy || code.length !== 6} className="h-11 px-4 rounded-xl bg-teal-600 text-white font-medium disabled:opacity-50">{busy ? '…' : t.confirm}</button>
          <button onClick={send} disabled={busy} className="h-11 px-3 rounded-xl border border-slate-200 text-[14px]">{t.resend}</button>
          <button onClick={() => setStep('edit')} className="h-11 px-3 rounded-xl text-slate-500 text-[14px]">{t.change}</button>
        </div>
        <p className="text-[12px] text-slate-400">{t.checkSpam}</p>
      </>}
      {msg && <p className="text-[13px] text-rose-600">{msg}</p>}
    </div>
  )
}

function Account({ me, t, reload }: { me: Me; t: typeof T.ro; reload: () => Promise<void> }) {
  const { standalone: installed } = useInstall()
  const [perm, setPerm] = useState<string>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '' })
  const [pwMsg, setPwMsg] = useState('')
  const ios = useMemo(() => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent), [])
  const pushSupported = typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator && 'Notification' in window

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPerm(Notification.permission)
    navigator.serviceWorker?.ready.then(r => r.pushManager.getSubscription()).then(s => setSubscribed(!!s)).catch(() => {})
  }, [])

  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible' || typeof Notification === 'undefined') return
      setPerm(prev => {
        const now = Notification.permission
        if (prev !== 'granted' && now === 'granted') setTimeout(() => { navigator.serviceWorker?.ready.then(r => r.pushManager.getSubscription()).then(sub => { if (!sub) toggleNotif() }).catch(() => {}) }, 0)
        return now
      })
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function toggleNotif() {
    const reg = await navigator.serviceWorker.register('/client-sw.js', { scope: '/client' })
    await navigator.serviceWorker.ready
    if (subscribed) {
      const s = await reg.pushManager.getSubscription()
      if (s) { await call('/api/client/push', 'DELETE', { endpoint: s.endpoint }); await s.unsubscribe() }
      setSubscribed(false); return
    }
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p !== 'granted') return
    const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(me.vapidPublicKey) })
    await call('/api/client/push', 'POST', { subscription: s.toJSON() })
    setSubscribed(true)
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setPwMsg('')
    const r = await call('/api/client/password', 'POST', pw)
    setPwMsg(r.ok ? t.pwSaved : r.status === 401 ? t.wrong : t.newPw)
    if (r.ok) setPw({ current: '', next: '' })
  }
  async function logout() { await call('/api/client/logout', 'POST'); location.reload() }

  const row = 'p-4 border-t border-slate-100 first:border-t-0'
  return (
    <div className="space-y-3">
      <section className={card}>
        <div className={row}><div className="text-[12px] text-slate-500">{t.signedAs}</div><div className="font-medium">{me.account.email}</div></div>
      </section>

      <section className={card}>
        <div className={row}>
          <div className="font-semibold mb-1">{t.notif}</div>
          {!pushSupported ? <p className="text-[13px] text-slate-500">{ios ? t.notifIos : t.notifUnsupported}</p>
            : perm === 'denied' ? <>
                <p className="text-[13px] text-rose-600 mb-2">{t.notifBlocked}</p>
                <ol className="space-y-1.5 text-[13px] text-slate-700">{(installed ? t.notifUnblockInstalled : t.notifUnblock).map((x, i) => <li key={i} className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] grid place-items-center">{i + 1}</span>{x}</li>)}</ol>
                <p className="text-[12px] text-slate-500 mt-2">{installed ? t.notifAuto : t.notifUnblockApp}</p>
                <button onClick={() => { setPerm(Notification.permission); if (Notification.permission !== 'denied') toggleNotif() }} className="mt-2 h-10 px-4 rounded-xl bg-slate-900 text-white font-medium">{t.notifOn}</button>
              </>
            : <>
                {subscribed && <p className="text-[13px] text-emerald-700 mb-2">{t.notifActive}</p>}
                <button onClick={toggleNotif} className={`h-11 px-4 rounded-xl font-medium ${subscribed ? 'border border-slate-200 text-slate-700' : 'bg-slate-900 text-white'}`}>{subscribed ? t.notifOff : t.notifOn}</button>
              </>}
        </div>
        <div className={row}>
          <div className="font-semibold mb-1">{t.mailNotif}</div>
          <MailNotif me={me} t={t} reload={reload} />
        </div>
        <div className={row}>
          <div className="font-semibold mb-1">{t.install}</div>
          <InstallCard t={t} />
        </div>
      </section>

      <form className={`${card} p-4 space-y-3`} onSubmit={changePw}>
        <div className="font-semibold">{t.changePw}</div>
        <input className={input} type="password" autoComplete="current-password" placeholder={t.currentPw} value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} required />
        <input className={input} type="password" autoComplete="new-password" placeholder={t.newPw} value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} minLength={8} required />
        {pwMsg && <p className="text-[13px] text-slate-600">{pwMsg}</p>}
        <button className="h-11 px-4 rounded-xl border border-slate-200 font-medium">{t.changePw}</button>
      </form>

      <button onClick={logout} className="w-full h-12 rounded-2xl bg-white border border-slate-200 text-rose-600 font-medium">{t.logout}</button>
    </div>
  )
}
