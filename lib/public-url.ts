// Adresa publică a aplicației pentru clienți (ex. https://panou.glamx.ro), setată în Vercel ca PUBLIC_APP_URL.
// Fără ea se folosește adresa de pe care s-a făcut cererea (ex. outreach-pro-app.vercel.app).
export function publicOrigin(req: Request): string {
  const u = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^/\s]+$/i.test(u) ? u : new URL(req.url).origin
}

export function publicHost(): string | null {
  try { return process.env.PUBLIC_APP_URL ? new URL(process.env.PUBLIC_APP_URL).host : null } catch { return null }
}
