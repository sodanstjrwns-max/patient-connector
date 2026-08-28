// 페이션트 커넥트 서비스워커 — v5 (네트워크 우선 + 브라우저 HTTP 캐시 우회, 구캐시 전부 삭제)
const CACHE = 'pc-v5'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  // 정적 자원: 네트워크 우선, 실패 시에만 캐시 (오프라인 대비)
  if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/ph')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
          return res
        })
        .catch(() => caches.match(e.request))
    )
  }
})
