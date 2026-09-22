// 앱 API — 허브 SSO 세션 기반. /api/* 에 마운트.
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { signSession, verifySession, sessionCookie, clearCookie, getSessionToken } from '../lib/auth'
import { verifyHubSsoToken } from '../lib/hub-sso'
import { normalizePhone, phoneHash, encPhone, randomToken, maskPhone } from '../lib/util'
import { sendAlimtalk, alimtalkReady } from '../lib/solapi'
import { materialCategories, libraryNotice, propagateLibrary, LIBRARY_KEY_PREFIX } from '../lib/material-library'
import annotations from './annotations'
import { guidanceOf, publicGuidance, shareIssue, safeLink, digest } from '../lib/guidance'
import { formKeyFor, fetchFormCheckins } from '../lib/form-checkins'
import { deliveryStatus } from '../lib/solapi'

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
  FORM_API_URL?: string
  FORM_INTEGRATION_KEYS?: string   // 【2026-09-19】JSON {ps_hospital_id: pfk_…} — 폼 오늘 접수 목록
}
type Vars = { hid: number }
const HUB_ORIGIN = 'https://hub.patientfunnel.kr'
const HUB_SSO_SERVICE = 'connector'
// Keep notice for existing precautions; disease is a first-class material type.
const KINDS = new Set(['explain', 'disease', 'cost', 'before_after', 'notice'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' }
const MAX_VIDEO_BYTES = 25 * 1024 * 1024

const api = new Hono<{ Bindings: Bindings; Variables: Vars }>()

function baseUrl(c: any): string {
  return (c.env.APP_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '')
}
function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback } catch { return fallback }
}
type ImageRef = { key: string; caption?: string; media_type?: 'image' | 'video'; poster_key?: string; duration_seconds?: number }
type CostItem = { name: string; price: number; qty?: number; note?: string }
type MaterialRow = { id: number; hospital_id: number; kind: string; category: string | null; title: string; body: string | null; images_json: string; cost_json: string; sort: number; active: number; updated_at: string; example_key?: string | null; guidance_json?: string }
function materialOut(m: MaterialRow) {
  return { id: m.id, kind: m.kind, category: m.category, title: m.title, body: m.body || '', images: parseJson<ImageRef[]>(m.images_json, []), cost: parseJson<CostItem[]>(m.cost_json, []), sort: m.sort, active: !!m.active, updated_at: m.updated_at, is_example: !!m.example_key, guidance: guidanceOf(parseJson(m.guidance_json, {})) }
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

/** 개인정보처리방침 약속: 수신번호 원문은 발송 후 7일 내 파기. 앱 사용 시마다 지연 실행 + ps-monitor 일일 호출(ps-api /ops/purge). */
export async function purgeOldPhones(db: D1Database): Promise<number> {
  const r = await db.prepare(`UPDATE dispatches SET phone_enc = NULL WHERE phone_enc IS NOT NULL AND created_at < datetime('now', '-7 days')`).run()
  return Number(r.meta.changes || 0)
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
      // 새 병원은 Patient Connect 영상 라이브러리를 바로 자료함에 넣어 시작한다
      await propagateLibrary(c.env.DB, h.id).catch(() => undefined)
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
  const d = (await c.env.DB.prepare(`SELECT d.*, h.name AS h_name, h.phone AS h_phone, h.address AS h_address, h.chat_url, h.booking_url, h.logo_key, h.primary_color, h.tagline FROM dispatches d JOIN hospitals h ON h.id = d.hospital_id WHERE d.token = ?`).bind(token).first()) as any
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
    hospital: { name: d.h_name, phone: d.h_phone, address: d.h_address, chat_url: d.chat_url, booking_url: d.booking_url, logo_key: d.logo_key, primary_color: d.primary_color, tagline: d.tagline },
    materials: parseJson<any[]>(d.materials_json, []),
    sent_at: d.sent_at || d.created_at, expires_at: d.expires_at, token: d.token,
    // 【2026-09-19】QR·링크로 연 안내장은 환자가 직접 번호를 넣어 카카오톡으로 받아둘 수 있다 (본인 요청 발송)
    self_send: d.channel === 'link' && alimtalkReady(c.env),
  })
})
// 환자 자가 요청 발송: QR/링크 안내장 → 같은 자료를 본인 번호로 알림톡. 병원 개입 없음, 원본 토큰당 하루 30건, 같은 번호는 하루 1번.
api.post('/g/:token/send-self', async (c) => {
  const src = await loadDispatchByToken(c, c.req.param('token'))
  if (!src) return c.json({ ok: false, error: '안내장을 찾을 수 없습니다' }, 404)
  if (new Date(String(src.expires_at).replace(' ', 'T') + 'Z').getTime() < Date.now()) return c.json({ ok: false, error: '열람 기간이 지난 안내장입니다' }, 410)
  if (src.channel !== 'link') return c.json({ ok: false, error: '이미 카카오톡으로 받으신 안내장입니다' }, 400)
  if (!alimtalkReady(c.env)) return c.json({ ok: false, error: '지금은 카카오톡 발송이 준비되지 않았습니다. 병원에 말씀해 주세요' }, 503)
  const b = await c.req.json().catch(() => ({} as any))
  const phone = normalizePhone(String(b?.phone || ''))
  if (!phone) return c.json({ ok: false, error: '휴대전화번호를 확인해 주세요 (010으로 시작)' }, 400)
  const hid = src.hospital_id
  const pHash = await phoneHash(phone, hid)
  if (await c.env.DB.prepare('SELECT 1 FROM optouts WHERE hospital_id = ? AND phone_hash = ?').bind(hid, pHash).first()) return c.json({ ok: false, error: '이 병원의 카카오톡 안내를 수신거부한 번호입니다' }, 409)
  const cnt = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM dispatches WHERE source_token = ? AND created_at >= datetime('now','-1 day')`).bind(src.token).first<any>()
  if (Number(cnt?.n || 0) >= 30) return c.json({ ok: false, error: '오늘 요청이 많아 잠시 받을 수 없습니다. 병원에 말씀해 주세요' }, 429)
  const dup = await c.env.DB.prepare(`SELECT status FROM dispatches WHERE source_token = ? AND phone_hash = ? AND created_at >= datetime('now','-1 day') ORDER BY id DESC LIMIT 1`).bind(src.token, pHash).first<any>()
  if (dup && ['accepted', 'sent', 'delivered'].includes(String(dup.status))) return c.json({ ok: true, status: 'already', message: '이미 이 번호로 보내드렸습니다. 카카오톡을 확인해 주세요' })
  if (!c.env.PHONE_ENC_KEY) return c.json({ ok: false, error: '서버 설정 오류' }, 500)
  const h = await c.env.DB.prepare('SELECT name, link_days FROM hospitals WHERE id = ?').bind(hid).first<any>()
  const days = Math.max(7, Math.min(180, Number(h?.link_days) || 30))
  const token = randomToken(16)
  const requestKey = 'self-' + randomToken(12)
  await c.env.DB.prepare(`INSERT INTO dispatches (hospital_id, token, label, phone_enc, phone_hash, phone_last4, materials_json, channel, status, expires_at, request_key, request_hash, source_token) VALUES (?,?,?,?,?,?,?,'alimtalk','created', datetime('now', '+${days} days'),?,?,?)`)
    .bind(hid, token, `환자 요청 · ${String(src.label || 'QR').slice(0, 30)}`, await encPhone(phone, c.env.PHONE_ENC_KEY), pHash, phone.slice(-4), src.materials_json, requestKey, await digest({ self: true, source: src.token, phone: pHash }), src.token).run()
  const url = `${baseUrl(c)}/g/${token}`
  const res = await sendAlimtalk(c.env, phone, { '#{병원명}': h?.name || src.h_name, '#{안내장링크}': url.replace(/^https?:\/\//, '') })
  if (res.ok) {
    await c.env.DB.prepare(`UPDATE dispatches SET status = 'accepted', solapi_group_id = ?, sent_at = datetime('now') WHERE token = ?`).bind(res.groupId || null, token).run()
    return c.json({ ok: true, status: 'accepted', message: '카카오톡으로 보냈습니다. 잠시 후 확인해 주세요' })
  }
  await c.env.DB.prepare(`UPDATE dispatches SET status = ?, error = ?, solapi_group_id = ? WHERE token = ?`).bind(res.uncertain ? 'unknown' : 'failed', String(res.error || '발송 실패').slice(0, 200), res.groupId || null, token).run()
  return c.json({ ok: false, error: res.uncertain ? '발송 결과를 확인하지 못했습니다. 잠시 후 카카오톡을 확인해 주세요' : '카카오톡 발송에 실패했습니다. 병원에 말씀해 주세요' }, 502)
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
  c.header('Cache-Control', 'private, no-store')
  const origin = c.req.header('Origin')
  if (!['GET','HEAD'].includes(c.req.method) && ((origin && origin !== new URL(c.req.url).origin) || c.req.header('Sec-Fetch-Site') === 'cross-site')) return c.json({ error: '다른 사이트의 요청은 허용하지 않습니다' }, 403)
  await next()
})

api.get('/me', async (c) => {
  await purgeOldPhones(c.env.DB).catch(() => undefined)
  const h = await c.env.DB.prepare('SELECT id, ps_hospital_id, name, phone, address, link_days, chat_url, booking_url, logo_key, primary_color, tagline FROM hospitals WHERE id = ?').bind(c.get('hid')).first<any>()
  if (!h) { c.header('Set-Cookie', clearCookie()); return c.json({ error: 'no_hospital', auth_required: true }, 401) }
  return c.json({ hospital: h, alimtalk_ready: alimtalkReady(c.env), base_url: baseUrl(c) })
})
api.put('/settings', async (c) => {
  const b = await c.req.json().catch(() => ({} as any))
  const phone = b.phone ? String(b.phone).slice(0, 30) : null
  const address = b.address ? String(b.address).slice(0, 120) : null
  const linkDays = Math.max(7, Math.min(180, Math.round(Number(b.link_days) || 30)))
  let chat, booking
  try { chat = safeLink(b.chat_url, true); booking = safeLink(b.booking_url) } catch (e: any) { return c.json({ error: e.message }, 400) }
  const color = typeof b.primary_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.primary_color.trim()) ? b.primary_color.trim().toLowerCase() : null
  const tagline = b.tagline ? String(b.tagline).trim().slice(0, 60) : null
  await c.env.DB.prepare('UPDATE hospitals SET phone = ?, address = ?, link_days = ?, chat_url = ?, booking_url = ?, primary_color = ?, tagline = ? WHERE id = ?').bind(phone, address, linkDays, chat, booking, color, tagline, c.get('hid')).run()
  return c.json({ ok: true })
})
// 병원 로고 (multipart file) → R2 h{hid}/brand/logo-*.ext. 안내장 토큰으로도 열람 가능(index.tsx /a/* 게이트).
const LOGO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
api.post('/settings/logo', async (c) => {
  const hid = c.get('hid')
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return c.json({ error: '파일이 없습니다' }, 400)
  const ext = LOGO_TYPES[file.type]
  if (!ext) return c.json({ error: '로고는 PNG·JPG·WebP 로 올려주세요 (배경 투명 PNG 권장)' }, 400)
  if (file.size > 2 * 1024 * 1024) return c.json({ error: '로고는 2MB 이하로 올려주세요' }, 400)
  const key = `h${hid}/brand/logo-${randomToken(6)}.${ext}`
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
  await c.env.DB.prepare('UPDATE hospitals SET logo_key = ? WHERE id = ?').bind(key, hid).run()
  return c.json({ logo_key: key })
})
api.delete('/settings/logo', async (c) => {
  await c.env.DB.prepare('UPDATE hospitals SET logo_key = NULL WHERE id = ?').bind(c.get('hid')).run()
  return c.json({ ok: true })
})

// Annotation routes inherit the clinic session middleware above.
api.route('/materials', annotations)

api.post('/annotation-sessions', async c => {
  const b = await c.req.json().catch(() => ({} as any)), scope = randomToken(16), hid = c.get('hid')
  const ids: number[] = Array.isArray(b.material_ids) ? [...new Set<number>(b.material_ids.map(Number).filter(Number.isInteger))].slice(0,40) : []
  if (b.copy_shared === true && ids.length) {
    await c.env.DB.prepare(`INSERT INTO scoped_annotations (hospital_id,scope,material_id,media_key,strokes_json,image_key,video_time,version,write_key)
      SELECT a.hospital_id,?,a.material_id,a.media_key,a.strokes_json,a.image_key,a.video_time,1,?
      FROM material_annotations a JOIN materials m ON m.id=a.material_id AND m.hospital_id=a.hospital_id
      WHERE a.hospital_id=? AND m.active=1 AND m.id IN (${ids.map(()=>'?').join(',')})`)
      .bind(scope, randomToken(16), hid, ...ids).run()
  }
  return c.json({ scope })
})
api.get('/material-sets', async c => {
  const rows = await c.env.DB.prepare('SELECT id,name,ids_json FROM material_sets WHERE hospital_id=? ORDER BY id').bind(c.get('hid')).all<any>()
  return c.json({ sets: rows.results.map(r => ({ id:r.id, name:r.name, material_ids:parseJson(r.ids_json,[]) })) })
})
api.post('/material-sets', async c => {
  const b = await c.req.json().catch(() => ({} as any)), name = String(b.name || '').trim().slice(0,60)
  const ids = Array.isArray(b.material_ids) ? [...new Set<number>(b.material_ids.map(Number).filter(Number.isInteger))] : []
  if (!name || !ids.length || ids.length > 40) return c.json({error:'묶음 이름과 자료 1~40개를 확인하세요.'},400)
  const own = await c.env.DB.prepare(`SELECT id FROM materials WHERE hospital_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(c.get('hid'),...ids).all()
  if (own.results.length !== ids.length) return c.json({error:'삭제되었거나 접근할 수 없는 자료가 있습니다.'},400)
  await c.env.DB.prepare('INSERT INTO material_sets (hospital_id,name,ids_json) VALUES (?,?,?) ON CONFLICT(hospital_id,name) DO UPDATE SET ids_json=excluded.ids_json').bind(c.get('hid'),name,JSON.stringify(ids)).run()
  return c.json({ok:true})
})
api.delete('/material-sets/:id', async c => {
  await c.env.DB.prepare('DELETE FROM material_sets WHERE hospital_id=? AND id=?').bind(c.get('hid'),c.req.param('id')).run()
  return c.json({ok:true})
})

// ─── 자료함 ───
api.get('/material-library', async (c) => {
  const hid = c.get('hid')
  const lib = await c.env.DB.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM library_materials WHERE active = 1').first<{ n: number; at: string | null }>()
  const mine = await c.env.DB.prepare(`SELECT SUM(active) AS active_n, SUM(library_locked) AS locked_n, COUNT(*) AS n FROM materials WHERE hospital_id = ? AND example_key LIKE '${LIBRARY_KEY_PREFIX}%'`).bind(hid).first<{ active_n: number; locked_n: number; n: number }>()
  return c.json({ categories: materialCategories, library_notice: libraryNotice, library_count: Number(lib?.n || 0), library_updated_at: lib?.at || null, imported_count: Number(mine?.active_n || 0), locked_count: Number(mine?.locked_n || 0) })
})
// 라이브러리 다시 가져오기 — 빠진 자료 추가, 병원이 손대지 않은 사본은 최신으로(삭제한 것도 복구). 수정한 사본은 그대로.
api.post('/materials/library-sync', async (c) => {
  const origin = c.req.header('Origin')
  if ((origin && origin !== new URL(c.req.url).origin) || c.req.header('Sec-Fetch-Site') === 'cross-site') return c.json({ error: '다른 사이트의 요청은 허용하지 않습니다' }, 403)
  const hid = c.get('hid')
  const hospital = await c.env.DB.prepare('SELECT id FROM hospitals WHERE id = ?').bind(hid).first()
  if (!hospital) return c.json({ error: 'no_hospital' }, 401)
  return c.json(await propagateLibrary(c.env.DB, hid))
})
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
    guidance: b.guidance === undefined ? null : JSON.stringify(guidanceOf(b.guidance)),
  }
}
api.post('/materials', async (c) => {
  const m = await readMaterialBody(c)
  if (!m) return c.json({ error: '제목을 입력하세요' }, 400)
  const hid = c.get('hid')
  const mx = await c.env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM materials WHERE hospital_id = ?').bind(hid).first<{ s: number }>()
  const r = await c.env.DB.prepare(`INSERT INTO materials (hospital_id, kind, category, title, body, cost_json, sort, guidance_json) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(hid, m.kind, m.category, m.title, m.body, m.cost, Number(mx?.s || 0) + 1, m.guidance || '{}').run()
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?').bind(r.meta.last_row_id).first<MaterialRow>()
  return c.json({ material: materialOut(row!) })
})
api.put('/materials/:id', async (c) => {
  const m = await readMaterialBody(c)
  if (!m) return c.json({ error: '제목을 입력하세요' }, 400)
  const r = await c.env.DB.prepare(`UPDATE materials SET kind=?, category=?, title=?, body=?, cost_json=?, guidance_json=COALESCE(?,guidance_json), library_locked=1, updated_at=datetime('now') WHERE id = ? AND hospital_id = ?`)
    .bind(m.kind, m.category, m.title, m.body, m.cost, m.guidance, c.req.param('id'), c.get('hid')).run()
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404)
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?').bind(c.req.param('id')).first<MaterialRow>()
  return c.json({ material: materialOut(row!) })
})
api.delete('/materials/:id', async (c) => {
  await c.env.DB.prepare(`UPDATE materials SET active = 0, updated_at=datetime('now') WHERE id = ? AND hospital_id = ?`).bind(c.req.param('id'), c.get('hid')).run()
  return c.json({ ok: true })
})
// 보이기/숨기기 — 병원별 선택. 라이브러리 기본 자료도 이 병원 자료함에서만 숨겨지며, 동기화가 되돌리지 않는다.
api.post('/materials/:id/visibility', async (c) => {
  const b = await c.req.json().catch(() => ({} as any))
  const visible = b.visible === true
  const r = await c.env.DB.prepare(`UPDATE materials SET active = ?, updated_at=datetime('now') WHERE id = ? AND hospital_id = ?`).bind(visible ? 1 : 0, c.req.param('id'), c.get('hid')).run()
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404)
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?').bind(c.req.param('id')).first<MaterialRow>()
  return c.json({ material: materialOut(row!) })
})
api.post('/materials/reorder', async (c) => {
  const b = await c.req.json().catch(() => ({} as any))
  const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isInteger) : []
  if (!ids.length) return c.json({ ok: true })
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare('UPDATE materials SET sort = ? WHERE id = ? AND hospital_id = ?').bind(i + 1, id, c.get('hid'))))
  return c.json({ ok: true })
})
// Backward-compatible endpoint for image/video uploads. Before/after remains image-only.
api.use('/materials/:id/images', bodyLimit({ maxSize: 26 * 1024 * 1024, onError: c => c.json({ error: '이미지는 5MB, 영상은 25MB 이하로 올려주세요' }, 413) }))
api.post('/materials/:id/images', async (c) => {
  const hid = c.get('hid')
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ? AND hospital_id = ?').bind(c.req.param('id'), hid).first<MaterialRow>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return c.json({ error: '파일이 없습니다' }, 400)
  const ext = IMAGE_TYPES[file.type]
  if (!ext) return c.json({ error: 'JPG·PNG·WebP 이미지 또는 MP4·WebM 영상만 올릴 수 있습니다' }, 400)
  const video = file.type.startsWith('video/')
  if (video && row.kind === 'before_after') return c.json({ error: '비포애프터에는 치료 전·후 이미지를 올려주세요' }, 400)
  if (!file.size || file.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) return c.json({ error: '이미지는 5MB, 영상은 25MB 이하의 파일을 올려주세요' }, 400)
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  const ascii = (a: number, b: number) => String.fromCharCode(...head.slice(a, b))
  const valid = ext === 'png' ? head[0] === 137 && ascii(1, 4) === 'PNG' : ext === 'jpg' ? head[0] === 255 && head[1] === 216 && head[2] === 255 : ext === 'webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' : ext === 'mp4' ? ascii(4, 8) === 'ftyp' : head[0] === 26 && head[1] === 69 && head[2] === 223 && head[3] === 163
  if (!valid) return c.json({ error: '파일 내용과 형식이 일치하지 않습니다' }, 400)
  const images = parseJson<ImageRef[]>(row.images_json, [])
  const posterFor = String(form?.get('poster_for') || '')
  if (posterFor) {
    const target = images.find(im => im.key === posterFor && (im.media_type === 'video' || /\.(mp4|webm)$/.test(im.key)))
    if (!target) return c.json({ error: '이 자료의 영상을 찾을 수 없습니다' }, 404)
    if (video) return c.json({ error: '썸네일은 이미지로 올려주세요' }, 400)
    const posterKey = `h${hid}/m${row.id}/${randomToken(8)}.${ext}`
    await c.env.MEDIA.put(posterKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
    target.poster_key = posterKey
    const duration = Number(form?.get('duration_seconds'))
    if (Number.isFinite(duration) && duration > 0 && duration <= 86400) target.duration_seconds = duration
    const saved = await c.env.DB.prepare("UPDATE materials SET images_json = ?, library_locked = 1, updated_at = datetime('now') WHERE id = ? AND images_json = ?").bind(JSON.stringify(images), row.id, row.images_json).run()
    if (!saved.meta.changes) return c.json({ error: '자료가 변경되었습니다. 새로고침 후 다시 시도해 주세요' }, 409)
    return c.json({ images })
  }
  const poster = form?.get('poster')
  if (poster instanceof File) {
    const bytes = new Uint8Array(await poster.slice(0, 3).arrayBuffer())
    if (!video || poster.type !== 'image/jpeg' || !poster.size || poster.size > 512 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return c.json({ error: '영상 썸네일은 512KB 이하의 JPG 이미지로 올려주세요' }, 400)
  }
  const limit = row.kind === 'before_after' ? 2 : 6
  if (images.length >= limit) return c.json({ error: `이 자료에는 이미지를 ${limit}장까지 넣을 수 있습니다` }, 400)
  const key = `h${hid}/m${row.id}/${randomToken(8)}.${ext}`
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
  const caption = String(form?.get('caption') || '').slice(0, 60)
  let posterKey: string | undefined
  if (video && poster instanceof File) {
    posterKey = `h${hid}/m${row.id}/${randomToken(8)}.jpg`
    await c.env.MEDIA.put(posterKey, await poster.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg' } })
  }
  const duration = Number(form?.get('duration_seconds'))
  images.push({ key, ...(caption ? { caption } : {}), media_type: video ? 'video' : 'image', ...(posterKey ? { poster_key: posterKey } : {}), ...(video && Number.isFinite(duration) && duration > 0 && duration <= 86400 ? { duration_seconds: duration } : {}) })
  await c.env.DB.prepare(`UPDATE materials SET images_json = ?, guidance_json = json_set(guidance_json, '$.external_allowed', json('false'), '$.deidentified', json('false')), library_locked=1, updated_at=datetime('now') WHERE id = ?`).bind(JSON.stringify(images), row.id).run()
  return c.json({ images })
})
api.delete('/materials/:id/images', async (c) => {
  const hid = c.get('hid')
  const key = c.req.query('key') || ''
  const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ? AND hospital_id = ?').bind(c.req.param('id'), hid).first<MaterialRow>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  const existing = parseJson<ImageRef[]>(row.images_json, [])
  if (!key || !existing.some(i => i.key === key)) return c.json({error:'이미지를 찾을 수 없습니다.'},404)
  const images = existing.filter((i) => i.key !== key)
  await c.env.DB.prepare(`UPDATE materials SET images_json = ?, guidance_json = json_set(guidance_json, '$.external_allowed', json('false'), '$.deidentified', json('false')), library_locked=1, updated_at=datetime('now') WHERE id = ?`).bind(JSON.stringify(images), row.id).run()
  // 발송된 안내장 스냅샷이 같은 키를 참조할 수 있으므로 R2 객체는 지우지 않는다(보관).
  return c.json({ images })
})

// ─── 【2026-09-19】오늘 접수 환자 (Patient Form 신환+재진 체크인) — 이름·구분·시각·마지막 4자리만 내린다. 전체 번호는 발송 시 서버가 checkin_id 로 다시 조회.
async function formKeyForHid(c: any, hid: number): Promise<string | null> {
  const h = await (c.env.DB as D1Database).prepare('SELECT ps_hospital_id FROM hospitals WHERE id = ?').bind(hid).first<any>()
  return formKeyFor(c.env, h?.ps_hospital_id)
}
api.get('/checkins', async (c) => {
  const key = await formKeyForHid(c, c.get('hid'))
  if (!key) return c.json({ enabled: false, items: [] })
  const r = await fetchFormCheckins(c.env, key, { q: c.req.query('q') || undefined })
  if (!r.ok) return c.json({ error: r.error }, 502)
  return c.json({ enabled: true, date: r.date, items: r.items.map((i) => { const d = String(i.phone || '').replace(/[^0-9]/g, ''); return { id: i.id, kind: i.visitKind, name: i.patientName, last4: d.length >= 4 ? d.slice(-4) : null, has_phone: d.length >= 10, checked_in_at: i.checkedInAt, dept: i.dept || [] } }) })
})

// ─── 발송(안내장) ───
api.use('/dispatches*', bodyLimit({maxSize:65536,onError:c=>c.json({error:'발송 요청이 너무 큽니다.'},413)}))
api.on('POST', ['/dispatches', '/dispatches/preview'], async (c) => {
  const hid = c.get('hid')
  const b = await c.req.json().catch(() => ({} as any))
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({error:'올바른 요청이 필요합니다.'},400)
  const preview = c.req.path.endsWith('/preview')
  const requestKey = b.request_key
  if (!preview && (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey))) return c.json({error:'발송 요청 키가 필요합니다.'},400)
  const requestHash = await digest({material_ids:b.material_ids,phone:b.phone || '',checkin_id:b.checkin_id || '',label:b.label || '',channel:b.channel,include_annotations:b.include_annotations === true,annotation_scope:b.annotation_scope || '',preview_hash:b.preview_hash})
  if (!preview) {
    const prior = await c.env.DB.prepare('SELECT * FROM dispatches WHERE hospital_id=? AND request_key=?').bind(hid,requestKey).first<any>()
    if (prior) {
      if (prior.request_hash !== requestHash) return c.json({error:'같은 요청 키로 다른 내용을 보낼 수 없습니다.'},409)
      return c.json({id:prior.id,token:prior.token,url:`${baseUrl(c)}/g/${prior.token}`,status:prior.status,error:prior.error,replayed:true})
    }
  }
  const ids: number[] = Array.isArray(b.material_ids) ? [...new Set<number>(b.material_ids.map(Number).filter(Number.isInteger))] : []
  if (ids.length > 40) return c.json({error:'안내장에는 최대 40개 자료를 담을 수 있습니다.'},400)
  if (!ids.length) return c.json({ error: '보낼 자료를 하나 이상 고르세요' }, 400)
  const channel = b.channel === 'link' ? 'link' : 'alimtalk'
  const label = b.label ? String(b.label).slice(0, 40) : null
  const h = await c.env.DB.prepare('SELECT * FROM hospitals WHERE id = ?').bind(hid).first<any>()
  if (!h) return c.json({ error: 'no_hospital' }, 401)

  const placeholders = ids.map(() => '?').join(',')
  const rows = await c.env.DB.prepare(`SELECT * FROM materials WHERE hospital_id = ? AND active = 1 AND id IN (${placeholders})`).bind(hid, ...ids).all<MaterialRow>()
  const byId = new Map((rows.results || []).map((m) => [m.id, m]))
  if (byId.size !== ids.length) return c.json({error:'삭제되었거나 접근할 수 없는 자료가 있습니다. 목록을 다시 확인하세요.'},409)
  for (const row of rows.results) { const issue = shareIssue(materialOut(row)); if (issue) return c.json({error:issue},400) }
  const scope = b.annotation_scope || ''
  if (scope && (typeof scope !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(scope))) return c.json({error:'설명 세션을 확인하세요.'},400)
  const savedNotes = b.include_annotations === true
    ? (await c.env.DB.prepare(`SELECT material_id, media_key, image_key, video_time FROM ${scope ? 'scoped_annotations' : 'material_annotations'} WHERE hospital_id = ? AND material_id IN (${placeholders}) AND image_key IS NOT NULL ${scope ? 'AND scope=?' : ''} ORDER BY material_id, media_key`).bind(hid, ...ids, ...(scope ? [scope] : [])).all<{material_id: number; media_key: string; image_key: string; video_time: number | null}>()).results
    : []
  const snapshot = ids.filter((id) => byId.has(id)).map((id) => {
    const m = materialOut(byId.get(id)!)
    const notes = savedNotes.filter(a => a.material_id === m.id && m.images.some(im => im.key === a.media_key)).map(a => ({ media_key: a.media_key, image_key: a.image_key, video_time: a.video_time }))
    return { id: m.id, kind: m.kind, category: m.category, title: m.title, body: m.body, images: m.images, cost: m.cost, is_example: m.is_example, annotations: notes, guidance: publicGuidance(m.guidance) }
  })
  if (!snapshot.length) return c.json({ error: '보낼 자료가 없습니다' }, 400)

  let phone: string | null = null, pHash: string | null = null, pEnc: string | null = null, last4: string | null = null
  if (channel === 'alimtalk') {
    let rawPhone = String(b.phone || '')
    if (b.checkin_id && /^(new|returning):\d+$/.test(String(b.checkin_id))) {
      // 오늘 접수 목록에서 고른 환자: 번호는 서버가 폼에서 다시 읽는다 (브라우저에 전체 번호 없음)
      const key = await formKeyForHid(c, hid)
      if (!key) return c.json({ error: '폼 접수 연결이 없습니다' }, 400)
      const r = await fetchFormCheckins(c.env, key, { limit: 200 })
      const it = r.items.find((x) => x.id === String(b.checkin_id))
      if (!r.ok || !it) return c.json({ error: '오늘 접수 목록에서 환자를 찾지 못했습니다. 목록을 새로고침하세요' }, 404)
      rawPhone = String(it.phone || '')
    }
    phone = normalizePhone(rawPhone)
    if (!phone) return c.json({ error: '휴대전화번호를 확인하세요 (010으로 시작, 숫자만)' }, 400)
    pHash = await phoneHash(phone, hid)
    const opt = await c.env.DB.prepare('SELECT 1 FROM optouts WHERE hospital_id = ? AND phone_hash = ?').bind(hid, pHash).first()
    if (opt) return c.json({ error: '이 번호는 수신거부한 번호입니다. 링크 직접 전달만 가능합니다', blocked: true }, 409)
    if (!c.env.PHONE_ENC_KEY) return c.json({ error: '서버 설정 오류(PHONE_ENC_KEY)' }, 500)
    pEnc = await encPhone(phone, c.env.PHONE_ENC_KEY)
    last4 = phone.slice(-4)
  }
  const hospital = {name:h.name,phone:h.phone,address:h.address,chat_url:h.chat_url,booking_url:h.booking_url,logo_key:h.logo_key||null,primary_color:h.primary_color||null,tagline:h.tagline||null}
  const previewHash = await digest({snapshot,hospital,days:h.link_days,phone:phone || '',label,channel})
  if (preview) return c.json({materials:snapshot,hospital,preview_hash:previewHash,sent_at:new Date().toISOString(),expires_at:new Date(Date.now()+(Number(h.link_days)||30)*86400000).toISOString()})
  if (b.preview_hash !== previewHash || b.confirmed !== true) return c.json({error:'자료 또는 필기가 변경되었거나 최종 확인이 없습니다. 미리보기를 다시 확인하세요.'},409)
  const token = randomToken(16)
  const days = Math.max(7, Math.min(180, Number(h.link_days) || 30))
  const r = await c.env.DB.prepare(`INSERT INTO dispatches (hospital_id, token, label, phone_enc, phone_hash, phone_last4, materials_json, channel, status, expires_at, request_key, request_hash) VALUES (?,?,?,?,?,?,?,?,?, datetime('now', '+${days} days'),?,?) ON CONFLICT(hospital_id,request_key) DO NOTHING`)
    .bind(hid, token, label, pEnc, pHash, last4, JSON.stringify(snapshot), channel, channel === 'link' ? 'link' : 'created', requestKey, requestHash).run()
  if (!r.meta.changes) {
    const prior = await c.env.DB.prepare('SELECT * FROM dispatches WHERE hospital_id=? AND request_key=?').bind(hid,requestKey).first<any>()
    if (prior?.request_hash !== requestHash) return c.json({error:'발송 요청 키 충돌'},409)
    return c.json({id:prior.id,token:prior.token,url:`${baseUrl(c)}/g/${prior.token}`,status:prior.status,error:prior.error,replayed:true})
  }
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
    await c.env.DB.prepare(`UPDATE dispatches SET status = 'accepted', solapi_group_id = ?, sent_at = datetime('now') WHERE id = ?`).bind(res.groupId || null, id).run()
    return c.json({ id, token, url, status: 'accepted' })
  }
  const status = res.uncertain ? 'unknown' : 'failed'
  await c.env.DB.prepare(`UPDATE dispatches SET status = ?, error = ?, solapi_group_id = ? WHERE id = ?`).bind(status, String(res.error || '발송 실패').slice(0, 200), res.groupId || null, id).run()
  return c.json({ id, token, url, status, error: res.error })
})
// ─── 【2026-09-19】체어사이드 QR ───
// 공유 가능한 자료만 스냅샷(부적합 자료는 건너뛰고 제목을 돌려준다). scope 가 있으면 그 설명 세션의 필기를 포함.
async function linkSnapshot(c: any, hid: number, idsIn: unknown, scope: string): Promise<{ snapshot: any[]; skipped: string[]; error?: string }> {
  const ids: number[] = Array.isArray(idsIn) ? [...new Set<number>((idsIn as any[]).map(Number).filter(Number.isInteger))].slice(0, 40) : []
  if (!ids.length) return { snapshot: [], skipped: [], error: '자료를 하나 이상 고르세요' }
  const placeholders = ids.map(() => '?').join(',')
  const rows = await (c.env.DB as D1Database).prepare(`SELECT * FROM materials WHERE hospital_id = ? AND active = 1 AND id IN (${placeholders})`).bind(hid, ...ids).all<MaterialRow>()
  const byId = new Map<number, MaterialRow>((rows.results || []).map((m) => [m.id, m]))
  const notes: any[] = scope ? ((await (c.env.DB as D1Database).prepare(`SELECT material_id, media_key, image_key, video_time FROM scoped_annotations WHERE hospital_id = ? AND material_id IN (${placeholders}) AND image_key IS NOT NULL AND scope = ? ORDER BY material_id, media_key`).bind(hid, ...ids, scope).all<any>()).results || []) : []
  const skipped: string[] = []
  const snapshot = ids.filter((id) => byId.has(id)).map((id) => materialOut(byId.get(id)!)).filter((m) => { const issue = shareIssue(m); if (issue) skipped.push(m.title); return !issue }).map((m) => {
    const ann = notes.filter((a: any) => a.material_id === m.id && m.images.some((im) => im.key === a.media_key)).map((a: any) => ({ media_key: a.media_key, image_key: a.image_key, video_time: a.video_time }))
    return { id: m.id, kind: m.kind, category: m.category, title: m.title, body: m.body, images: m.images, cost: m.cost, is_example: m.is_example, annotations: ann, guidance: publicGuidance(m.guidance) }
  })
  return { snapshot, skipped }
}
// 설명 화면 QR: 지금 보여주는 자료 묶음을 링크 안내장으로 만들어 QR 로 띄운다. 같은 자료·같은 세션·같은 날이면 같은 링크 재사용.
api.post('/dispatches/qr', async (c) => {
  const hid = c.get('hid')
  const b = await c.req.json().catch(() => ({} as any))
  const scope = typeof b?.scope === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(b.scope) ? b.scope : ''
  const { snapshot, skipped, error } = await linkSnapshot(c, hid, b?.material_ids, scope)
  if (error) return c.json({ error }, 400)
  if (!snapshot.length) return c.json({ error: '공유 조건을 갖춘 자료가 없습니다 (비용·비포애프터는 안내 조건을 채워야 합니다)' }, 400)
  const h = await c.env.DB.prepare('SELECT link_days FROM hospitals WHERE id = ?').bind(hid).first<any>()
  const days = Math.max(7, Math.min(180, Number(h?.link_days) || 30))
  const dayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const requestKey = 'qr-' + (await digest({ ids: snapshot.map((m) => m.id), notes: snapshot.map((m) => m.annotations.map((a: any) => a.image_key)), scope, day: dayKst })).slice(0, 40)
  const prior = await c.env.DB.prepare('SELECT token, expires_at FROM dispatches WHERE hospital_id = ? AND request_key = ?').bind(hid, requestKey).first<any>()
  if (prior && new Date(String(prior.expires_at).replace(' ', 'T') + 'Z').getTime() > Date.now() + 86400000) return c.json({ token: prior.token, url: `${baseUrl(c)}/g/${prior.token}`, expires_at: prior.expires_at, skipped, reused: true })
  const token = randomToken(16)
  await c.env.DB.prepare(`INSERT INTO dispatches (hospital_id, token, label, materials_json, channel, status, sent_at, expires_at, request_key, request_hash) VALUES (?,?,?,?,'link','link',datetime('now'),datetime('now','+${days} days'),?,?) ON CONFLICT(hospital_id,request_key) DO UPDATE SET token = excluded.token, materials_json = excluded.materials_json, expires_at = excluded.expires_at, sent_at = datetime('now')`)
    .bind(hid, token, `QR 화면 · ${snapshot.length}개`, JSON.stringify(snapshot), requestKey, requestKey).run()
  const row = await c.env.DB.prepare('SELECT token, expires_at FROM dispatches WHERE hospital_id = ? AND request_key = ?').bind(hid, requestKey).first<any>()
  return c.json({ token: row.token, url: `${baseUrl(c)}/g/${row.token}`, expires_at: row.expires_at, skipped })
})
// 치료별 고정 QR 카드: 3년 유효 링크 안내장. 인쇄해 체어마다 둔다.
api.get('/qr-cards', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id, token, label, materials_json, open_count, created_at, expires_at, (SELECT COUNT(*) FROM dispatches s WHERE s.source_token = d.token) AS self_sends, (SELECT COUNT(*) FROM views v WHERE v.dispatch_id = d.id AND v.material_index = -1) AS friend_clicks FROM dispatches d WHERE hospital_id = ? AND label LIKE 'QR카드 · %' AND expires_at > datetime('now') ORDER BY id DESC LIMIT 100`).bind(c.get('hid')).all<any>()
  const base = baseUrl(c)
  return c.json({ cards: (rows.results || []).map((d) => ({ id: d.id, token: d.token, url: `${base}/g/${d.token}`, title: String(d.label).slice('QR카드 · '.length), titles: parseJson<any[]>(d.materials_json, []).map((m) => m.title), open_count: d.open_count, self_sends: Number(d.self_sends || 0), friend_clicks: Number(d.friend_clicks || 0), created_at: d.created_at, expires_at: d.expires_at })) })
})
api.post('/qr-cards', async (c) => {
  const hid = c.get('hid')
  const b = await c.req.json().catch(() => ({} as any))
  const title = String(b?.title || '').trim().slice(0, 30)
  if (!title) return c.json({ error: '카드 제목을 넣어 주세요' }, 400)
  const { snapshot, skipped, error } = await linkSnapshot(c, hid, b?.material_ids, '')
  if (error) return c.json({ error }, 400)
  if (!snapshot.length) return c.json({ error: '공유 조건을 갖춘 자료가 없습니다' }, 400)
  const token = randomToken(16)
  const requestKey = 'card-' + randomToken(12)
  await c.env.DB.prepare(`INSERT INTO dispatches (hospital_id, token, label, materials_json, channel, status, sent_at, expires_at, request_key, request_hash) VALUES (?,?,?,?,'link','link',datetime('now'),datetime('now','+1095 days'),?,?)`)
    .bind(hid, token, `QR카드 · ${title}`, JSON.stringify(snapshot), requestKey, requestKey).run()
  return c.json({ token, url: `${baseUrl(c)}/g/${token}`, title, skipped })
})
api.delete('/qr-cards/:id', async (c) => {
  await c.env.DB.prepare(`UPDATE dispatches SET expires_at = datetime('now','-1 minute') WHERE id = ? AND hospital_id = ? AND label LIKE 'QR카드 · %'`).bind(c.req.param('id'), c.get('hid')).run()
  return c.json({ ok: true })
})

// Status checks never resend. Ambiguous network failures remain unknown to prevent duplicates.
api.post('/dispatches/:id/status', async c => {
  const d = await c.env.DB.prepare('SELECT * FROM dispatches WHERE id=? AND hospital_id=?').bind(c.req.param('id'),c.get('hid')).first<any>()
  if (!d) return c.json({error:'안내장을 찾을 수 없습니다.'},404)
  if (d.solapi_group_id && ['sent','accepted','unknown','created','retrying'].includes(d.status)) {
    const result = await deliveryStatus(c.env,d.solapi_group_id)
    if (result.status) {
      await c.env.DB.prepare('UPDATE dispatches SET status=?,error=? WHERE id=? AND hospital_id=? AND status=?').bind(result.status,result.error || null,d.id,c.get('hid'),d.status).run()
      return c.json({status:result.status,error:result.error})
    }
    return c.json({status:d.status,error:result.error})
  }
  return c.json({status:d.status,error:d.error})
})
// One explicit retry of a verified failed delivery. Never retry an ambiguous result.
// Each confirmation is bound to the failed provider attempt; a claim prevents concurrent sends.
api.post('/dispatches/:id/resend', async (c) => {
  const hid = c.get('hid')
  const d = await c.env.DB.prepare('SELECT * FROM dispatches WHERE id = ? AND hospital_id = ?').bind(c.req.param('id'), hid).first<any>()
  if (!d) return c.json({ error: 'not_found' }, 404)
  if (d.channel !== 'alimtalk' || d.status !== 'failed') return c.json({ error: '확정 실패 건만 재발송할 수 있습니다. 발송내역에서 결과를 확인하세요.' }, 409)
  const created = Date.parse(d.created_at.replace(' ', 'T')+'Z'), expires = Date.parse(d.expires_at.replace(' ', 'T')+'Z')
  if (!d.phone_enc || !Number.isFinite(created) || created <= Date.now()-7*86400000 || !Number.isFinite(expires) || expires <= Date.now()) return c.json({error:'번호 보관기간 또는 안내장 유효기간이 지났습니다. 새 안내장을 확인해 주세요.'},400)
  if (!alimtalkReady(c.env) || !c.env.PHONE_ENC_KEY) return c.json({error:'알림톡 설정이 완료되지 않았습니다.'},503)
  // Old clients reported network ambiguity as failed. Require a provider-confirmed failure for them.
  if (!d.request_key && (!d.solapi_group_id || (await deliveryStatus(c.env,d.solapi_group_id)).status !== 'failed')) return c.json({error:'과거 발송의 실패 여부가 확정되지 않았습니다. SOLAPI 콘솔에서 확인하세요.'},409)
  const { decPhone } = await import('../lib/util')
  let phone: string
  try { phone = await decPhone(d.phone_enc,c.env.PHONE_ENC_KEY) } catch { return c.json({error:'수신번호를 복원하지 못했습니다.'},400) }
  if (await c.env.DB.prepare('SELECT 1 FROM optouts WHERE hospital_id=? AND phone_hash=?').bind(hid,await phoneHash(phone,hid)).first()) return c.json({error:'수신거부한 번호에는 재발송할 수 없습니다.'},409)
  const h = await c.env.DB.prepare('SELECT name,phone,address,chat_url,booking_url FROM hospitals WHERE id=?').bind(hid).first<any>()
  if (!h) return c.json({error:'no_hospital'},401)
  const snapshot = parseJson<any[]>(d.materials_json,[])
  if (!snapshot.length || snapshot.length>40) return c.json({error:'기존 안내장을 확인할 수 없습니다.'},409)
  for (const m of snapshot) {
    const live = await c.env.DB.prepare('SELECT * FROM materials WHERE id=? AND hospital_id=? AND active=1').bind(m.id,hid).first<MaterialRow>()
    if (!live) return c.json({error:'자료가 삭제되었습니다. 새 안내장을 준비해 주세요.'},409)
    const issue = shareIssue(materialOut(live))
    if (issue) return c.json({error:issue},409)
    // A previously issued cost/case snapshot may no longer meet the live terms/consent scope.
    if (['cost','before_after'].includes(m.kind) || ['cost','before_after'].includes(live.kind)) {
      const current = materialOut(live)
      if (m.kind!==current.kind || JSON.stringify(m.images)!==JSON.stringify(current.images) || JSON.stringify(m.cost)!==JSON.stringify(current.cost) || JSON.stringify(m.guidance)!==JSON.stringify(publicGuidance(current.guidance)) || m.body!==current.body || m.title!==current.title) return c.json({error:'비용·사례 자료가 변경되었습니다. 최신 자료로 새 안내장을 준비해 주세요.'},409)
    }
  }
  const hash = await digest({id:d.id,snapshot,hospital:h,phone_hash:await phoneHash(phone,hid),expires_at:d.expires_at,group_id:d.solapi_group_id,sent_at:d.sent_at,error:d.error})
  const b = await c.req.json().catch(()=>({} as any))
  if (b?.preview === true) return c.json({hospital:h,materials:snapshot,preview_hash:hash,sent_at:d.sent_at || d.created_at,expires_at:d.expires_at,phone:maskPhone(d.phone_last4)})
  if (b?.confirmed!==true || b?.preview_hash!==hash) return c.json({error:'재발송 미리보기와 수신 대상을 먼저 확인하세요.'},409)
  const claimed=await c.env.DB.prepare("UPDATE dispatches SET status='retrying',solapi_group_id=NULL,error=NULL WHERE id=? AND hospital_id=? AND status='failed' AND solapi_group_id IS ? AND sent_at IS ? AND phone_enc IS NOT NULL AND created_at>datetime('now','-7 days') AND expires_at>datetime('now')").bind(d.id,hid,d.solapi_group_id,d.sent_at).run()
  if (!claimed.meta.changes) return c.json({error:'이미 다른 화면에서 재발송을 시작했거나 보관기간이 지났습니다. 결과를 확인하세요.'},409)
  const url = `${baseUrl(c)}/g/${d.token}`
  const res=await sendAlimtalk(c.env,phone,{'#{병원명}':h.name,'#{안내장링크}':url.replace(/^https?:\/\//,'')})
  const status=res.ok?'accepted':res.uncertain?'unknown':'retry_failed'
  await c.env.DB.prepare("UPDATE dispatches SET status=?,error=?,solapi_group_id=?,sent_at=CASE WHEN ?='accepted' THEN datetime('now') ELSE sent_at END WHERE id=? AND hospital_id=? AND status='retrying'").bind(status,res.error || null,res.groupId || null,status,d.id,hid).run()
  return c.json({ok:res.ok,status,error:res.error,url})
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
  const q = async (days: number) => (await c.env.DB.prepare(`SELECT COUNT(*) AS sent, SUM(CASE WHEN first_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened FROM dispatches WHERE hospital_id = ? AND status IN ('sent','accepted','delivered','link') AND (label IS NULL OR label NOT LIKE 'QR%') AND created_at >= datetime('now', '-${days} days')`).bind(hid).first<any>()) || {}
  const s7 = await q(7), s30 = await q(30)
  return c.json({ d7: { sent: Number(s7.sent || 0), opened: Number(s7.opened || 0) }, d30: { sent: Number(s30.sent || 0), opened: Number(s30.opened || 0) } })
})

export default api
