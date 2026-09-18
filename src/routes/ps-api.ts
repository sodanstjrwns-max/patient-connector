// Patient Series Open API v1 — 커넥트 공급자
// GET /api/v1/signals — 발송·열람 집계(비식별). 인증: Bearer {PS_SERVICE_KEY} + X-PS-Hospital-Id
import { Hono } from 'hono'
import { checkSolapiCredentials, alimtalkReady } from '../lib/solapi'
import { timingSafeEqualStr, randomToken } from '../lib/util'
import { guidanceOf, publicGuidance, digest } from '../lib/guidance'
import { purgeOldPhones } from './api'

type Bindings = { DB: D1Database; PS_SERVICE_KEY?: string; PS_SSO_SECRET?: string; APP_BASE_URL?: string } & Record<string, any>
type Vars = { hid: number }
const psApi = new Hono<{ Bindings: Bindings; Variables: Vars }>()
const err = (c: any, status: number, code: string, message: string) => c.json({ error: { code, message } }, status)

// 허브 → 프로필 변경 push (캐시 무효화). 인증: Bearer PS_SSO_SECRET
psApi.post('/hub-events', async (c) => {
  const secret = (c.env.PS_SSO_SECRET || '').trim()
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!secret || !token || !timingSafeEqualStr(token, secret)) return err(c, 401, 'unauthorized', '유효하지 않은 인증입니다')
  const body = (await c.req.json().catch(() => null)) as { ps_hospital_id?: string } | null
  const psId = typeof body?.ps_hospital_id === 'string' ? body.ps_hospital_id.trim() : ''
  if (!psId) return err(c, 400, 'invalid_body', 'ps_hospital_id가 필요합니다')
  await c.env.DB.prepare('DELETE FROM hub_profile_cache WHERE ps_hospital_id = ?').bind(psId).run().catch(() => undefined)
  return c.json({ ok: true })
})

// 운영: 번호 원문 파기(7일 경과분). 인증: Bearer PS_SERVICE_KEY, 병원 헤더 불필요. ps-monitor 가 매일 호출.
psApi.post('/ops/purge', async (c) => {
  const key = c.env.PS_SERVICE_KEY
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!key || !token || !timingSafeEqualStr(token, key)) return err(c, 401, 'unauthorized', '유효하지 않은 서비스 키')
  try {
    const purged = await purgeOldPhones(c.env.DB)
    return c.json({ ok: true, purged })
  } catch { return err(c, 500, 'purge_failed', '번호 파기 작업에 실패했습니다. 다시 확인해 주세요.') }
})

psApi.use('/*', async (c, next) => {
  const key = c.env.PS_SERVICE_KEY
  if (!key) return err(c, 500, 'not_configured', 'PS_SERVICE_KEY가 설정되지 않았습니다')
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token || !timingSafeEqualStr(token, key)) return err(c, 401, 'unauthorized', '유효하지 않은 서비스 키')
  const globalId = c.req.header('X-PS-Hospital-Id') || ''
  if (!globalId) return err(c, 403, 'missing_hospital', 'X-PS-Hospital-Id 헤더가 필요합니다')
  const row = await c.env.DB.prepare('SELECT id FROM hospitals WHERE ps_hospital_id = ? LIMIT 1').bind(globalId).first<{ id: number }>()
  if (!row) return err(c, 404, 'unknown_hospital', '이 병원은 커넥트에 등록되지 않았습니다')
  c.set('hid', Number(row.id))
  await next()
})

psApi.get('/signals', async (c) => {
  const hid = c.get('hid')
  const q = async (sql: string, ...args: any[]) => (await c.env.DB.prepare(sql).bind(...args).first<any>()) || {}
  const s7 = await q(`SELECT COUNT(*) AS sent, SUM(CASE WHEN first_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened FROM dispatches WHERE hospital_id = ? AND status IN ('sent','accepted','delivered','link') AND created_at >= datetime('now','-7 days')`, hid)
  const s30 = await q(`SELECT COUNT(*) AS sent, SUM(CASE WHEN first_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened FROM dispatches WHERE hospital_id = ? AND status IN ('sent','accepted','delivered','link') AND created_at >= datetime('now','-30 days')`, hid)
  const m = await q(`SELECT COUNT(*) AS n FROM materials WHERE hospital_id = ? AND active = 1`, hid)
  const sent7 = Number(s7.sent || 0), opened7 = Number(s7.opened || 0)
  return c.json({
    service: 'connector',
    generated_at: new Date().toISOString(),
    signals: [
      { signal_id: `connect:sent_7d:${hid}`, key: 'sent_7d', label: '최근 7일 안내장 발송', value: sent7 },
      { signal_id: `connect:open_rate_7d:${hid}`, key: 'open_rate_7d', label: '최근 7일 열람률(%)', value: sent7 ? Math.round((opened7 / sent7) * 100) : 0 },
      { signal_id: `connect:sent_30d:${hid}`, key: 'sent_30d', label: '최근 30일 안내장 발송', value: Number(s30.sent || 0) },
      { signal_id: `connect:materials:${hid}`, key: 'materials', label: '등록 안내자료 수', value: Number(m.n || 0) },
    ],
  })
})

// POST /api/v1/topic-links — 리치 리포트 '자세히 보기' 연결. body {names:["임플란트","크라운"]}
// 이름과 분류·제목이 맞는 공개 가능 자료(설명·질환·주의사항)를 최대 4개 묶어 180일짜리 링크 안내장을 만들거나 재사용한다.
psApi.post('/topic-links', async (c) => {
  const hid = c.get('hid')
  const b = (await c.req.json().catch(() => ({}))) as { names?: unknown }
  const names = Array.isArray(b.names) ? [...new Set(b.names.map((n) => String(n || '').trim().slice(0, 40)).filter(Boolean))].slice(0, 12) : []
  if (!names.length) return c.json({ links: {} })
  const h = await c.env.DB.prepare('SELECT id, name, phone, address, chat_url, booking_url, logo_key, primary_color, tagline, link_days FROM hospitals WHERE id = ?').bind(hid).first<any>()
  if (!h) return err(c, 404, 'unknown_hospital', '병원 없음')
  const base = (c.env.APP_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '')
  const parse = (v: string | null, d: any) => { try { return v ? JSON.parse(v) : d } catch { return d } }
  const out: Record<string, { url: string; titles: string[] }> = {}
  for (const name of names) {
    const q = `%${name.replace(/\s+/g, '')}%`
    const rows = await c.env.DB.prepare(`SELECT * FROM materials WHERE hospital_id = ? AND active = 1 AND kind IN ('explain','disease','notice') AND (REPLACE(category,' ','') LIKE ? OR REPLACE(title,' ','') LIKE ?) ORDER BY CASE WHEN example_key IS NULL THEN 0 ELSE 1 END, kind = 'explain' DESC, sort ASC LIMIT 4`).bind(hid, q, q).all<any>()
    const mats = rows.results || []
    if (!mats.length) continue
    const ids = mats.map((m) => m.id)
    const snapshot = mats.map((m) => ({ id: m.id, kind: m.kind, category: m.category, title: m.title, body: m.body || '', images: parse(m.images_json, []), cost: parse(m.cost_json, []), is_example: !!m.example_key, annotations: [], guidance: publicGuidance(guidanceOf(parse(m.guidance_json, {}))) }))
    const requestKey = `topic-${(await digest(name)).slice(0, 24)}`
    const requestHash = await digest({ ids, name })
    const prior = await c.env.DB.prepare(`SELECT token, request_hash, expires_at FROM dispatches WHERE hospital_id = ? AND request_key = ?`).bind(hid, requestKey).first<any>()
    let token: string | null = null
    if (prior && prior.request_hash === requestHash && new Date(String(prior.expires_at).replace(' ', 'T') + 'Z').getTime() > Date.now() + 7 * 86400000) token = prior.token
    else {
      token = randomToken(16)
      if (prior) await c.env.DB.prepare('DELETE FROM dispatches WHERE hospital_id = ? AND request_key = ?').bind(hid, requestKey).run()
      await c.env.DB.prepare(`INSERT INTO dispatches (hospital_id, token, label, materials_json, channel, status, sent_at, expires_at, request_key, request_hash) VALUES (?,?,?,?,'link','link',datetime('now'),datetime('now','+180 days'),?,?)`)
        .bind(hid, token, `리치 연결 · ${name}`, JSON.stringify(snapshot), requestKey, requestHash).run()
    }
    out[name] = { url: `${base}/g/${token}`, titles: mats.map((m) => m.title) }
  }
  return c.json({ links: out })
})

psApi.get('/ops/solapi-check', async (c) => {
  const r = await checkSolapiCredentials(c.env as any)
  return c.json({ ...r, alimtalkReady: alimtalkReady(c.env as any) })
})

export default psApi
