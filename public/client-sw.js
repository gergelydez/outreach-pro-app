// Service worker pentru panoul clientului: notificări „mesaj nou” și instalare ca aplicație
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
// necesar ca aplicația să poată fi instalată; cererile merg normal la rețea
self.addEventListener('fetch', () => {})

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
