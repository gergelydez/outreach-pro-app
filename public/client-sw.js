// Service worker pentru panoul clientului: notificări „mesaj nou” și instalare ca aplicație
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
// navigarea merge la rețea; fără internet, o pagină simplă (Chrome cere asta ca să instaleze aplicația „adevărată”, fără eticheta browserului)
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request).catch(() => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panoul meu</title><body style="font-family:system-ui;background:#f4f5f7;color:#0f172a;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:24px"><div><h1 style="font-size:20px">Fără conexiune la internet</h1><p style="color:#64748b">Reîncearcă după ce revine internetul.</p></div>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
})

self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (_) { d = { title: 'Mesaj nou', body: e.data ? e.data.text() : '' } }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'Mesaj nou de pe site', {
      body: d.body || '', icon: '/icons/client-192.png', badge: '/icons/client-badge.png', tag: 'site-message', renotify: true, data: { url: d.url || '/client' },
    })
    if (self.navigator && self.navigator.setAppBadge) { try { await self.navigator.setAppBadge() } catch (_) {} }
  })())
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/client'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = all.find(c => c.url.includes('/client'))
    if (open) { await open.focus(); open.postMessage({ type: 'refresh' }); return }
    await self.clients.openWindow(url)
  })())
})
