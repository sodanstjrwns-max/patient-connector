import { Hono } from 'hono'
import { cors } from 'hono/cors'
import api, { type Bindings } from './routes/api'
import psApi from './routes/ps-api'
import { legalShell, privacyBody, termsBody, legalGuideBody, landingPage } from './pages/legal'
import { verifySession, getSessionToken } from './lib/auth'

const app = new Hono<{ Bindings: Bindings }>()

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.localhost')
}
// 시크릿 fail-closed 가드 (써모와 동일)
app.use('*', async (c, next) => {
  if (!c.env.SESSION_SECRET && !isLocalHost(new URL(c.req.url).hostname)) return c.text('Service misconfigured: SESSION_SECRET not set', 503)
  await next()
})

app.use('/api/*', cors())
app.route('/api/v1', psApi)
app.route('/api', api)

// ─── HTML 셸 ───
const ASSET_VER = 'v20260923d'
const shell = (title: string, script: string, opts: { bodyClass?: string; noindex?: boolean; desc?: string } = {}) => `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${title} — Patient Connect</title>
  <meta name="description" content="${opts.desc || '환자 설명자료를 보여주고 카카오톡으로 보내는 도구'}">
  ${opts.noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📨</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link href="/static/style.css?${ASSET_VER}" rel="stylesheet">
  <script>tailwind.config={theme:{extend:{fontFamily:{sans:['Pretendard','-apple-system','sans-serif']}}}}</script>
</head>
<body class="${opts.bodyClass || 'bg-slate-50'} font-sans text-slate-800">
  <div id="app"></div>
  ${script === 'app.js' ? `<script src="/static/annotations.js?${ASSET_VER}"></script><script src="/static/guide.js?${ASSET_VER}"></script>` : ''}
  ${script === 'app.js' || script === 'qrcards.js' ? `<script src="/static/qrcode.js?${ASSET_VER}"></script>` : ''}
  <script src="/static/${script}?${ASSET_VER}"></script>
</body>
</html>`

app.get('/', (c) => c.html(landingPage()))
app.get('/app', (c) => c.html(shell('병원 콘솔', 'app.js', { noindex: true })))
app.get('/app/qr-cards/print', (c) => c.html(shell('QR 카드 인쇄', 'qrcards.js', { bodyClass: 'bg-white', noindex: true })))
app.get('/g/:token', (c) => c.html(shell('진료 안내장', 'guide.js', { bodyClass: 'bg-white', noindex: true, desc: '병원에서 보내드린 진료 안내 자료입니다' })))
app.get('/optout/:token', (c) => c.html(shell('수신거부', 'guide.js', { bodyClass: 'bg-white', noindex: true })))
app.get('/privacy', (c) => c.html(legalShell('개인정보처리방침', privacyBody)))
app.get('/terms', (c) => c.html(legalShell('이용약관', termsBody)))
app.get('/legal-guide', (c) => c.html(legalShell('병원용 안내 문구', legalGuideBody)))

// ─── 이미지(R2) ── 병원 세션(자기 병원 키) 또는 유효한 안내장 토큰(스냅샷에 포함된 키)만 열람
app.get('/a/*', async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.slice(3))
  // 플랫폼 영상 라이브러리(library/…)는 로그인한 병원 누구나, 환자는 자기 안내장 스냅샷에 든 키만 볼 수 있다. 병원 업로드(h{id}/…)는 소유 병원만.
  const isLibrary = /^library\/[A-Z]{3}-\d{3}\/[0-9a-f]{8,16}\.(mp4|jpg)$/.test(key)
  if (!isLibrary && !/^h\d+\/(m\d+|brand)\/[0-9a-z-]+\.(jpg|png|webp|mp4|webm)$/.test(key)) return c.text('not found', 404)
  const isBrand = /^h\d+\/brand\//.test(key)
  let allowed = false
  const sid = await verifySession(getSessionToken(c.req.header('Cookie')), c.env.SESSION_SECRET)
  if (sid && (isLibrary || key.startsWith(`h${sid}/`))) allowed = true
  if (!allowed) {
    const t = c.req.query('t') || ''
    if (/^[0-9a-f]{32}$/.test(t)) {
      const d = await c.env.DB.prepare('SELECT hospital_id, materials_json, expires_at FROM dispatches WHERE token = ?').bind(t).first<{ hospital_id: number; materials_json: string; expires_at: string }>()
      if (d && new Date(d.expires_at.replace(' ', 'T') + 'Z').getTime() >= Date.now() && (d.materials_json.includes(`"${key}"`) || (isBrand && key.startsWith(`h${d.hospital_id}/brand/`)))) allowed = true
    }
  }
  if (!allowed) return c.text('forbidden', 403)
  const headers: Record<string, string> = { 'Cache-Control': isLibrary ? 'private, max-age=86400' : 'private, no-store', 'X-Robots-Tag': 'noindex', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' }
  const requested = c.req.header('Range')
  if (requested) {
    const meta = await c.env.MEDIA.head(key)
    if (!meta) return c.text('not found', 404)
    const match = /^bytes=(\d*)-(\d*)$/.exec(requested)
    let start = 0, end = meta.size - 1
    if (match && (match[1] || match[2])) {
      if (!match[1]) start = Math.max(0, meta.size - Number(match[2]))
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])) }
    } else start = meta.size
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= meta.size || end < start) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${meta.size}` } })
    const obj = await c.env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } })
    if (!obj) return c.text('not found', 404)
    return new Response(obj.body, { status: 206, headers: { ...headers, 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Range': `bytes ${start}-${end}/${meta.size}`, 'Content-Length': String(end - start + 1) } })
  }
  const obj = await c.env.MEDIA.get(key)
  if (!obj) return c.text('not found', 404)
  return new Response(obj.body, { headers: { ...headers, 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Length': String(obj.size) } })
})

export default app
