// Urcă o poză (deja micșorată în browser) prin aplicație; serverul o salvează în R2 / Blob
export async function uploadImage(path: string, file: Blob, endpoint: string): Promise<{ url: string }> {
  const sep = endpoint.includes('?') ? '&' : '?'
  const res = await fetch(`${endpoint}${sep}path=${encodeURIComponent(path)}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'image/jpeg' } })
  if (!res.ok) throw new Error(`upload ${res.status}`)
  return res.json()
}
