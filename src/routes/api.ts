// 앱 API — 허브 SSO 세션 기반. /api/* 에 마운트.
import { Hono } from 'hono'
import { signSession, verifySession, sessionCookie, clearCookie, getSessionToken } from '../lib/auth'
import { verifyHubSsoToken } from '../lib/hub-sso'
import { normalizePhone, phoneHash, encPhone, randomToken, maskPhone } from '../lib/util'
import { sendAlimtalk, alimtalkReady } from '../lib/solapi'

export type Bindings = {
  DB: D1Database
  MEDIA: R2Bucket
  SESSION_SECRET?: string
  PS_SSO_SECRET?: string
  PHONE_ENC_KEY?: string
  HUB_API_KEY?: string
  APP_BASE_URL?: string
  SOLAPI_API_KEY?: string
  SOLAPI_API_SECRET?: string
  PLATFORM_FROM_NUMBER?: string
  PLATFORM_PF_ID?: string
  CONNECT_TEMPLATE_ID?: string
}
type Vars = { hid: number }
const HUB_ORIGIN = 'https://hub.patientfunnel.kr'
const HUB_SSO_SERVICE = 'connector'
const KINDS = new Set(['explain', 'before_after', 'cost', 'notice'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const api = new Hono<{ Bindings: Bindings; Variables: Vars }>()

function baseUrl(c: any): string {
  return (c.env.APP_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '')
}
function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback } catch { return fallback }
}
type ImageRef = { key: string; caption?: string }
type CostItem = { name: string; price: number; qty?: number; note?: string }
type MaterialRow = { id: number; hospital_id: number; kind: string; category: string | null; title: string; body: string | null; images_json: string; cost_json: string; sort: number; active: number; updated_at: string }
function materialOut(m: MaterialRow) {
  return { id: m.id, kind: m.kind, category: m.category, title: m.title, body: m.body || '', images: parseJson<ImageRef[]>(m.images_json, []), cost: parseJson<CostItem[]>(m.cost_json, []), sort: m.sort, active: !!m.active, updated_at: m.updated_at }
}
function sanitizeCost(input: unknown): CostItem[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, 40).map((x: any) => ({
    name: String(x?.name || '').slice(0, 60),
    price: Math.max(0, Math.min(999_999_999, Math.round(Number(x?.price) || 0))),
    qty: Math.max(1, Math.min(999, Math.round(Number(x?.qty) || 1))),
    note: x?.note ? String(x.note).slice(0, 120) : undefined,
  })).filter((x) => x.name)
}

// ─── 허브 SSO ───
api.get('/auth/hub', (c) => {
  const cb = `${baseUrl(c)}/api/auth/hub/callback`
  return c.redirect(`${HUB_ORIGIN}/sso/authorize?service=${HUB_SSO_SERVICE}&redirect_uri=${encodeURIComponent(cb)}`)
})
api.get('/auth/hub/callback', async (c) => {
  try {
    const secret = c.env.PS_SSO_SECRET
    const ssoToken = c.req.query('sso_token')
    if (!secret || !ssoToken) return c.redirect('/?error=hub_sso_failed')
    const claims = await verifyHubSsoToken(secret, ssoToken, HUB_SSO_SERVICE)
    if (!claims) return c.redirect('/?error=hub_sso_invalid')
    // 병원은 허브 전역 ID 기준으로 자동 생성 (온보딩 없음). 이름은 허브 정본을 따른다.
    let h = await c.env.DB.prepare('SELECT id, name FROM hospitals WHERE ps_hospital_id = ?').bind(claims.hid).first<{ id: number; name: string }>()
    if (!h) {
      const r = await c.env.DB.prepare('INSERT INTO hospitals (ps_hospital_id, name) VALUES (?, ?)').bind(claims.hid, claims.hname || '병원').run()
      h = { id: Number(r.meta.last_row_id), name: claims.hname || '병원' }
    } else if (claims.hname && claims.hname !== h.name) {
      await c.env.DB.prepare('UPDATE hospitals SET name = ? WHERE id = ?').bind(claims.hname, h.id).run()
    }
    const token = await signSession(h.id, c.env.SESSION_SECRET)
    c.header('Set-Cookie', sessionCookie(token))
    return c.redirect('/app')
  } catch (e) {
    console.error('Hub SSO callback error:', e)
    return c.redirect('/?error=hub_sso_failed')
  }
})
api.post('/auth/logout', (c) => { c.header('Set-Cookie', clearCookie()); return c.json({ ok: true }) })

// ─── 공개: 안내장·수신거부 (세션 불필요) ───
async function loadDispatchByToken(c: any, token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  const d = (await c.env.DB.prepare(`SELECT d.*, h.name AS h_name, h.phone AS h_phone, h.address AS h_address FROM dispatches d JOIN hospitals h ON h.id = d.hospital_id WHERE d.token = ?`).bind(token).first()) as any
  return d || null
}
api.get('/g/:token', async (c) => {
  const d = await loadDispatchByToken(c, c.req.param('token'))
  if (!d) return c.json({ error: 'not_found' }, 404)
  if (new Date(d.expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now()) return c.json({ error: 'expired', hospital: { name: d.h_name, phone: d.h_phone } }, 410)
  // 열람 기록 (첫 열람 시각·횟수)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE dispatches SET open_count = open_count + 1, first_opened_at = COALESCE(first_opened_at, datetime('now')) WHERE id = ?`).bind(d.id),
    c.env.DB.prepare(`INSERT INTO views (dispatch_id, material_index) VALUES (?, NULL)`).bind(d.id),
  ]).catch(() => undefined)
  return c.json({
    hospital: { name: d.h_name, phone: d.h_phone, address: d.h_address },
    materials: parseJson<any[]>(d.materials_json, []),
    sent_at: d.sent_at || d.created_at, expires_at: d.expires_at, token: d.token,
  })
})
api.post('/g/:token/view', async (c) => {
  const d = await loadDispatchByToken(c, c.req.param('token'))
  if (!d) return c.json({ ok: false }, 404)
  const body = await c.req.json().catch(() => ({} as any))
  const idx = Number.isInteger(body?.index) ? Number(body.index) : null
  await c.env.DB.prepare(`INSERT INTO views (dispatch_id, material_index) VALUES (?, ?)`).bind(d.id, idx).run().catch(() => undefined)
  return c.json({ ok: true })
})
api.post('/optout/:token', async (c) => {
  const d = await loadDispatchByToken(c, c.req.param('token'))
  if (!d) return c.json({ ok: false, error: '안내장을 찾을 수 없습니다' }, 404)
  if (!d.phone_hash) return c.json({ ok: true, note: '번호 정보가 없는 링크입니다' })
  await c.env.DB.prepare(`INSERT OR IGNORE INTO optouts (hospital_id, phone_hash) VALUES (?, ?)`).bind(d.hospital_id, d.phone_hash).run()
  return c.json({ ok: true })
})

// ─── 세션 보호 ───
api.use('/*', async (c, next) => {
  const p = new URL(c.req.url).pathname
  if (p.startsWith('/api/auth/') || p.startsWith('/api/g/') || p.startsWith('/api/optout/')) return next()
  const sid = await verifySession(getSessionToken(c.req.header('Cookie')), c.env.SESSION_SECRET)
  if (!sid) return c.json({ error: '로그인이 필요합니다', auth_required: true }, 401)
  c.set('hid', sid)
  await next()
})

api.get('/me', async (c) => {
  const h = await c.env.DB.prepare('SELECT id, ps_hospital_id, name, phone, address, link_days FROM hospitals WHERE id = ?').bind(c.get('hid')).first<any>()
  if (!h) { c.header('Set-Cookie', clearCookie()); return c.json({ error: 'no_hospital', auth_required: true }, 401) }
  return c.json({ hospital: h, alimtalk_ready: alimtalkReady(c.env), base_url: baseUrl(c) })
})
api.put('/settings', async (c) => {
  const b = await c.req.json().catch(() => ({} as any))
  const phone = b.phone ? String(b.phone).slice(0, 30) : null
  const address = b.address ? String(b.address).slice(0, 120) : null
  const linkDays = Math.max(7, Math.min(180, Math.round(Number(b.link_days) || 30)))
  await c.env.DB.prepare('UPDATE hospitals SET phone = ?, address = ?, link_days = ? WHERE id = ?').bind(phone, address, linkDays, c.get('hid')).run()
  return c.json({ ok: true })
})

// ─── 자료함 ───
api.get('/materials', async (c) => {
  const all = c.req.query('all') === '1'
  const rows = await c.env.DB.prepare(`SELECT * FROM materials WHERE hospital_id = ? ${all ? '' : 'AND active = 1'} ORDER BY sort ASC, id ASC`).bind(c.get('hid')).all<MaterialRow>()
  return c.json({ materials: (rows.results || []).map(materialOut) })
})
async function readMaterialBody(c: any) {
  const b = await c.req.json().catch(() => ({} as any))
  const kind = KINDS.has(b.kind) ? b.kind : 'explain'
  const title = String(b.title || '').trim().slice(0, 80)
  if (!title) return null
  return {
    kind, title,
    category: b.category ? String(b.category).trim().slice(0, 30) : null,
    body: b.body ? String(b.body).slice(0, 4000) : '',
    cost: JSON.stringify(sanitizeCost(b.cost)),
  }
}
api.post('/materials', async (c) => {
  const m = await readMaterialBody(c)
  if (!m) return c.json({ error: '제목을 입력하세요' }, 400)
  const hid = c.get('hid')
  const mx = await c.env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM materials WHERE hospital_id = ?').bind(hid).first<{ s: number }>()
  const r = await c.env.DB.prepare(`INSERT INTO materials (hospital_id, kind, category, title, body, cost_json, sort) VALUES (?,?,?,?,?,?,?)`)
    .bind(hid, m.kind, m.category, m.title, m.body, m.cost, Number(mx?.s || 0) + 1).run()
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?').bind(r.meta.last_row_id).first<MaterialRow>()
  return c.json({ material: materialOut(row!) })
})
api.put('/materials/:id', async (c) => {
  const m = await readMaterialBody(c)
  if (!m) return c.json({ error: '제목을 입력하세요' }, 400)
  const r = await c.env.DB.prepare(`UPDATE materials SET kind=?, category=?, title=?, body=?, cost_json=?, updated_at=datetime('now') WHERE id = ? AND hospital_id = ?`)
    .bind(m.kind, m.category, m.title, m.body, m.cost, c.req.param('id'), c.get('hid')).run()
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404)
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?').bind(c.req.param('id')).first<MaterialRow>()
  return c.json({ material: materialOut(row!) })
})
api.delete('/materials/:id', async (c) => {
  await c.env.DB.prepare(`UPDATE materials SET active = 0, updated_at=datetime('now') WHERE id = ? AND hospital_id = ?`).bind(c.req.param('id'), c.get('hid')).run()
  return c.json({ ok: true })
})
api.post('/materials/reorder', async (c) => {
  const b = await c.req.json().catch(() => ({} as any))
  const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isInteger) : []
  if (!ids.length) return c.json({ ok: true })
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare('UPDATE materials SET sort = ? WHERE id = ? AND hospital_id = ?').bind(i + 1, id, c.get('hid'))))
  return c.json({ ok: true })
})
// 이미지 업로드 (multipart: file, caption?) → R2. before_after 는 최대 2장(앞=before, 뒤=after), 그 외 6장.
api.post('/materials/:id/images', async (c) => {
  const hid = c.get('hid')
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ? AND hospital_id = ?').bind(c.req.param('id'), hid).first<MaterialRow>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return c.json({ error: '파일이 없습니다' }, 400)
  const ext = IMAGE_TYPES[file.type]
  if (!ext) return c.json({ error: 'JPG·PNG·WebP 만 올릴 수 있습니다' }, 400)
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: '이미지는 5MB 이하로 올려주세요' }, 400)
  const images = parseJson<ImageRef[]>(row.images_json, [])
  const limit = row.kind === 'before_after' ? 2 : 6
  if (images.length >= limit) return c.json({ error: `이 자료에는 이미지를 ${limit}장까지 넣을 수 있습니다` }, 400)
  const key = `h${hid}/m${row.id}/${randomToken(8)}.${ext}`
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
  const caption = String(form?.get('caption') || '').slice(0, 60)
  images.push(caption ? { key, caption } : { key })
  await c.env.DB.prepare(`UPDATE materials SET images_json = ?, updated_at=datetime('now') WHERE id = ?`).bind(JSON.stringify(images), row.id).run()
  return c.json({ images })
})
api.delete('/materials/:id/images', async (c) => {
  const hid = c.get('hid')
  const key = c.req.query('key') || ''
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ? AND hospital_id = ?').bind(c.req.param('id'), hid).first<MaterialRow>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  const images = parseJson<ImageRef[]>(row.images_json, []).filter((i) => i.key !== key)
  await c.env.DB.prepare(`UPDATE materials SET images_json = ?, updated_at=datetime('now') WHERE id = ?`).bind(JSON.stringify(images), row.id).run()
  // 발송된 안내장 스냅샷이 같은 키를 참조할 수 있으므로 R2 객체는 지우지 않는다(보관).
  return c.json({ images })
})

// ─── 발송(안내장) ───
api.post('/dispatches', async (c) => {
  const hid = c.get('hid')
  const b = await c.req.json().catch(() => ({} as any))
  const ids: number[] = Array.isArray(b.material_ids) ? b.material_ids.map(Number).filter(Number.isInteger) : []
  if (!ids.length) return c.json({ error: '보낼 자료를 하나 이상 고르세요' }, 400)
  const channel = b.channel === 'link' ? 'link' : 'alimtalk'
  const label = b.label ? String(b.label).slice(0, 40) : null
  const h = await c.env.DB.prepare('SELECT * FROM hospitals WHERE id = ?').bind(hid).first<any>()
  if (!h) return c.json({ error: 'no_hospital' }, 401)

  const placeholders = ids.map(() => '?').join(',')
  const rows = await c.env.DB.prepare(`SELECT * FROM materials WHERE hospital_id = ? AND active = 1 AND id IN (${placeholders})`).bind(hid, ...ids).all<MaterialRow>()
  const byId = new Map((rows.results || []).map((m) => [m.id, m]))
  const snapshot = ids.filter((id) => byId.has(id)).map((id) => { const m = materialOut(byId.get(id)!); return { id: m.id, kind: m.kind, category: m.category, title: m.title, body: m.body, images: m.images, cost: m.cost } })
  if (!snapshot.length) return c.json({ error: '보낼 자료가 없습니다' }, 400)

  let phone: string | null = null, pHash: string | null = null, pEnc: string | null = null, last4: string | null = null
  if (channel === 'alimtalk') {
    phone = normalizePhone(String(b.phone || ''))
    if (!phone) return c.json({ error: '휴대전화번호를 확인하세요 (010으로 시작, 숫자만)' }, 400)
    pHash = await phoneHash(phone, hid)
    const opt = await c.env.DB.prepare('SELECT 1 FROM optouts WHERE hospital_id = ? AND phone_hash = ?').bind(hid, pHash).first()
    if (opt) return c.json({ error: '이 번호는 수신거부한 번호입니다. 링크 직접 전달만 가능합니다', blocked: true }, 409)
    if (!c.env.PHONE_ENC_KEY) return c.json({ error: '서버 설정 오류(PHONE_ENC_KEY)' }, 500)
    pEnc = await encPhone(phone, c.env.PHONE_ENC_KEY)
    last4 = phone.slice(-4)
  }
  const token = randomToken(16)
  const days = Math.max(7, Math.min(180, Number(h.link_days) || 30))
  const r = await c.env.DB.prepare(`INSERT INTO dispatches (hospital_id, token, label, phone_enc, phone_hash, phone_last4, materials_json, channel, status, expires_at) VALUES (?,?,?,?,?,?,?,?,?, datetime('now', '+${days} days'))`)
    .bind(hid, token, label, pEnc, pHash, last4, JSON.stringify(snapshot), channel, channel === 'link' ? 'link' : 'created').run()
  const id = Number(r.meta.last_row_id)
  const url = `${baseUrl(c)}/g/${token}`

  if (channel === 'link') {
    await c.env.DB.prepare(`UPDATE dispatches SET sent_at = datetime('now') WHERE id = ?`).bind(id).run()
    return c.json({ id, token, url, status: 'link' })
  }
  if (!alimtalkReady(c.env)) {
    await c.env.DB.prepare(`UPDATE dispatches SET status = 'failed', error = ? WHERE id = ?`).bind('알림톡 채널 준비 중 — 링크 직접 전달을 이용하세요', id).run()
    return c.json({ id, token, url, status: 'failed', error: '알림톡 채널이 아직 준비 중입니다. 아래 링크를 직접 전달해 주세요.' })
  }
  const res = await sendAlimtalk(c.env, phone!, { '#{병원명}': h.name, '#{안내장링크}': url.replace(/^https?:\/\//, '') })
  if (res.ok) {
    await c.env.DB.prepare(`UPDATE dispatches SET status = 'sent', solapi_group_id = ?, sent_at = datetime('now') WHERE id = ?`).bind(res.groupId || null, id).run()
    return c.json({ id, token, url, status: 'sent' })
  }
  await c.env.DB.prepare(`UPDATE dispatches SET status = 'failed', error = ? WHERE id = ?`).bind(String(res.error || '발송 실패').slice(0, 200), id).run()
  return c.json({ id, token, url, status: 'failed', error: res.error })
})
api.get('/dispatches', async (c) => {
  const limit = Math.max(1, Math.min(200, Number(c.req.query('limit')) || 50))
  const rows = await c.env.DB.prepare(`SELECT id, token, label, phone_last4, materials_json, channel, status, error, sent_at, first_opened_at, open_count, expires_at, created_at FROM dispatches WHERE hospital_id = ? ORDER BY id DESC LIMIT ?`).bind(c.get('hid'), limit).all<any>()
  const base = baseUrl(c)
  return c.json({
    dispatches: (rows.results || []).map((d) => ({
      id: d.id, url: `${base}/g/${d.token}`, label: d.label, phone: maskPhone(d.phone_last4), channel: d.channel, status: d.status, error: d.error,
      titles: parseJson<any[]>(d.materials_json, []).map((m) => m.title), sent_at: d.sent_at, first_opened_at: d.first_opened_at, open_count: d.open_count, expires_at: d.expires_at, created_at: d.created_at,
    })),
  })
})
api.get('/stats', async (c) => {
  const hid = c.get('hid')
  const q = async (days: number) => (await c.env.DB.prepare(`SELECT COUNT(*) AS sent, SUM(CASE WHEN first_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened FROM dispatches WHERE hospital_id = ? AND status IN ('sent','link') AND created_at >= datetime('now', '-${days} days')`).bind(hid).first<any>()) || {}
  const s7 = await q(7), s30 = await q(30)
  return c.json({ d7: { sent: Number(s7.sent || 0), opened: Number(s7.opened || 0) }, d30: { sent: Number(s30.sent || 0), opened: Number(s30.opened || 0) } })
})

export default api
