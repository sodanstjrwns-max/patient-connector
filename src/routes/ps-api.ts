// Patient Series Open API v1 — 커넥트 공급자
// GET /api/v1/signals — 발송·열람 집계(비식별). 인증: Bearer {PS_SERVICE_KEY} + X-PS-Hospital-Id
import { Hono } from 'hono'
import { checkSolapiCredentials, alimtalkReady } from '../lib/solapi'
import { timingSafeEqualStr } from '../lib/util'
import { purgeOldPhones } from './api'

type Bindings = { DB: D1Database; PS_SERVICE_KEY?: string; PS_SSO_SECRET?: string } & Record<string, any>
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
  const purged = await purgeOldPhones(c.env.DB)
  return c.json({ ok: true, purged })
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
  const s7 = await q(`SELECT COUNT(*) AS sent, SUM(CASE WHEN first_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened FROM dispatches WHERE hospital_id = ? AND status IN ('sent','link') AND created_at >= datetime('now','-7 days')`, hid)
  const s30 = await q(`SELECT COUNT(*) AS sent, SUM(CASE WHEN first_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened FROM dispatches WHERE hospital_id = ? AND status IN ('sent','link') AND created_at >= datetime('now','-30 days')`, hid)
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

psApi.get('/ops/solapi-check', async (c) => {
  const r = await checkSolapiCredentials(c.env as any)
  return c.json({ ...r, alimtalkReady: alimtalkReady(c.env as any) })
})

export default psApi
