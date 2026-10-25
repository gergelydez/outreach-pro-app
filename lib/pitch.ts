// Transformă problemele tehnice din audit în fraze pe care le înțelege
// proprietarul: ce vede un client/pacient când intră pe site. Folosite în
// mesajul de prim contact (șablon și AI) — formulate respectuos, fără exagerări.

export function pitchForIssue(issue: string): string | null {
  const i = issue.toLowerCase()
  const year = issue.match(/(?:19|20)\d{2}/)?.[0]
  const secs = issue.match(/(\d+(?:[.,]\d)?)s/)?.[1]
  if (/nu redirecționează/.test(i)) return 'adresa site-ului din Google deschide varianta fără HTTPS, așa că Chrome afișează „Nesigur” lângă adresă — mulți închid pagina când văd asta'
  if (/https|nesigur/.test(i)) return 'când cineva intră pe site, Chrome îi afișează „Nesigur” lângă adresă — mulți închid pagina când văd asta'
  if (/nu se încarcă|eroare \d{3}/.test(i)) return 'site-ul nu se deschide acum — cine vă caută pe Google dă de o pagină cu eroare'
  if (/construcție|parcat/.test(i)) return 'site-ul arată o pagină „în construcție”, așa că cine vă caută nu găsește informațiile de care are nevoie'
  if (/telefon \(pe mobil|adaptat pentru telefon/.test(i)) return 'pe telefon site-ul nu se adaptează: textul e mic și trebuie mărit cu degetele, iar majoritatea oamenilor caută de pe mobil'
  if (/neactualizat/.test(i) && year) return `în subsolul site-ului apare încă anul ${year}, ceea ce poate da impresia că nu mai e întreținut`
  if (/tehnologie depășită/.test(i)) return 'site-ul folosește tehnologie veche, care nu mai e întreținută și se vede tot mai prost pe telefoanele noi'
  if (/încarcă greu/.test(i)) return `se încarcă greu${secs ? ` (${secs} secunde)` : ''} — pe telefon mulți renunță după 3 secunde`
  if (/descrierea pentru google/.test(i)) return 'lipsește descrierea pentru Google, așa că în rezultatele căutării apare un text luat la întâmplare de pe pagină'
  if (/telefonul nu e clickabil/.test(i)) return 'numărul de telefon nu e clickabil pe mobil — cine vrea să vă sune trebuie să-l copieze manual'
  if (/nu are titlu/.test(i)) return 'pagina nu are titlu, așa că în Google și în tab-ul browserului nu apare numele vostru'
  return null
}

export function auditPitches(issues: string[] | undefined): string[] {
  return (issues || []).map(pitchForIssue).filter((p): p is string => !!p)
}
