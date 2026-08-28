// 페이션트 커넥트 서비스워커 — 정적 자원 캐시
const CACHE = 'pc-v1'
const STATIC = ['/static/styles.css', '/static/common.js', '/static/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  // 정적 자원·플레이스홀더는 캐시 우선
  if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/ph')) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy))
        return res
      }))
    )
  }
})
