import Anthropic from '@anthropic-ai/sdk'

// Mesaj clar în română pentru erorile Anthropic afișate în UI, în loc de JSON-ul brut.
// keySource spune de unde a venit cheia: env (Vercel) are prioritate față de Setări.
export function friendlyAnthropicError(err: unknown, keySource: 'env' | 'settings'): string {
  const where = keySource === 'env'
    ? 'variabila ANTHROPIC_API_KEY din Vercel (Settings → Environment Variables), apoi Redeploy'
    : 'cheia din pagina Setări a aplicației'
  if (err instanceof Anthropic.AuthenticationError) {
    return `Cheia Anthropic e invalidă sau a fost revocată. Creează una nouă pe console.anthropic.com → API Keys și pune-o în ${where}.`
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return `Cheia Anthropic nu are acces la acest model sau organizația e blocată. Verifică pe console.anthropic.com (${where}).`
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Prea multe cereri către Anthropic acum. Așteaptă un minut și încearcă din nou.'
  }
  if (err instanceof Anthropic.APIError) {
    return `Eroare Anthropic ${err.status ?? ''}: ${err.message}`.trim()
  }
  return err instanceof Error ? err.message : String(err)
}
