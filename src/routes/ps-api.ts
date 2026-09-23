// Patient Series Open API v1 — 커넥트 공급자
// GET /api/v1/signals — 발송·열람 집계(비식별). 인증: Bearer {PS_SERVICE_KEY} + X-PS-Hospital-Id
import { Hono } from 'hono'
import { checkSolapiCredentials, alimtalkReady } from '../lib/solapi'
import { timingSafeEqualStr, randomToken } from '../lib/util'
import { guidanceOf, publicGuidance, digest } from '../lib/guidance'
import { purgeOldPhones } from './api'
import { propagateLibrary, LIBRARY_KEY_PREFIX, type LibraryItem } from '../lib/material-library'

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

// 운영: 영상 라이브러리 동기화(tools/drive_library_sync.py 가 호출). 인증: Bearer PS_SERVICE_KEY, 병원 헤더 불필요.
// body { items: LibraryItem[], remove_missing?: boolean } → library_materials upsert 후 전 병원 자료함에 반영.
psApi.post('/ops/library-sync', async (c) => {
  const key = c.env.PS_SERVICE_KEY
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!key || !token || !timingSafeEqualStr(token, key)) return err(c, 401, 'unauthorized', '유효하지 않은 서비스 키')
  const body = (await c.req.json().catch(() => null)) as { items?: any[]; remove_missing?: boolean } | null
  if (!body || !Array.isArray(body.items)) return err(c, 400, 'invalid_body', 'items 배열이 필요합니다')
  const items: LibraryItem[] = []
  for (const x of body.items) {
    const keyOk = typeof x?.key === 'string' && x.key.startsWith(LIBRARY_KEY_PREFIX) && /^[A-Z]{3}-\d{3}$/.test(String(x.topic_id || ''))
    const kindOk = ['explain', 'disease', 'notice'].includes(x?.kind)
    const title = String(x?.title || '').trim().slice(0, 80)
    let images: any[] = []
    try { images = JSON.parse(String(x?.images_json || '[]')) } catch { images = [] }
    const imagesOk = Array.isArray(images) && images.length <= 6 && images.every(im => typeof im?.key === 'string' && /^library\/[A-Z]{3}-\d{3}\/[0-9a-f]{8,16}\.(mp4|jpg)$/.test(im.key) && (!im.poster_key || /^library\/[A-Z]{3}-\d{3}\/[0-9a-f]{8,16}\.jpg$/.test(im.poster_key)))
    if (!keyOk || !kindOk || !title || !imagesOk || typeof x?.rev !== 'string' || !x.rev) return err(c, 400, 'invalid_item', `잘못된 항목: ${String(x?.key || '?')}`)
    items.push({ key: x.key, topic_id: x.topic_id, kind: x.kind, category: x.category ? String(x.category).slice(0, 30) : null, title, body: String(x.body || '').slice(0, 4000), images_json: JSON.stringify(images), rev: String(x.rev).slice(0, 40), source: x.source ? String(x.source).slice(0, 300) : null, sort: Number.isInteger(x.sort) ? x.sort : 0, active: x.active === 0 ? 0 : 1, specialty: x.specialty ? String(x.specialty).trim().slice(0, 30) : '치과' })
  }
  const stmts = items.map(i => c.env.DB.prepare(`INSERT INTO library_materials (key, topic_id, kind, category, title, body, images_json, rev, source, sort, active, specialty, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET topic_id=excluded.topic_id, kind=excluded.kind, category=excluded.category, title=excluded.title, body=excluded.body, images_json=excluded.images_json, rev=excluded.rev, source=excluded.source, sort=excluded.sort, active=excluded.active, specialty=excluded.specialty, updated_at=datetime('now')`)
    .bind(i.key, i.topic_id, i.kind, i.category, i.title, i.body, i.images_json, i.rev, i.source, i.sort, i.active, i.specialty))
  for (let k = 0; k < stmts.length; k += 50) await c.env.DB.batch(stmts.slice(k, k + 50))
  let removed = 0
  if (body.remove_missing) {
    const keep = items.map(i => i.key)
    const r = await c.env.DB.prepare(`UPDATE library_materials SET active = 0, updated_at = datetime('now') WHERE active = 1${keep.length ? ` AND key NOT IN (${keep.map(() => '?').join(',')})` : ''}`).bind(...keep).run()
    removed = Number(r.meta.changes || 0)
  }
  const propagated = await propagateLibrary(c.env)
  return c.json({ ok: true, upserted: items.length, removed, propagated })
})

// 운영: 파일 반입함. 브라우저 세션에서 가져온 자료를 R2 inbox/ 에 넣는다(Bearer PS_SERVICE_KEY). 운영자가 wrangler 로 꺼내 쓴다.
psApi.post('/ops/inbox', async (c) => {
  const key = c.env.PS_SERVICE_KEY
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!key || !token || !timingSafeEqualStr(token, key)) return err(c, 401, 'unauthorized', '유효하지 않은 서비스 키')
  const name = (c.req.query('name') || '').replace(/[^A-Za-z0-9._\-가-힣ㆍ() ]/g, '_').slice(0, 120)
  if (!name) return err(c, 400, 'invalid_name', 'name 이 필요합니다')
  const body = await c.req.arrayBuffer()
  if (!body.byteLength || body.byteLength > 60 * 1024 * 1024) return err(c, 400, 'invalid_size', '1B~60MB')
  const r2key = `inbox/${Date.now()}-${name}`
  await (c.env as any).MEDIA.put(r2key, body, { httpMetadata: { contentType: c.req.header('Content-Type') || 'application/octet-stream' } })
  return c.json({ ok: true, key: r2key, bytes: body.byteLength })
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

// 【2026-09-21】GET /api/v1/funnel-stats?from=YYYY-MM-DD&to=YYYY-MM-DD (KST 날짜) — PFM 퍼널 6단계(설명) 보조 지표.
// 비식별 집계만: 발송·열람·친구추가 수. QR 카드 링크(label 'QR…')는 발송이 아니므로 제외.
psApi.get('/funnel-stats', async (c) => {
  const hid = c.get('hid')
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  const from = String(c.req.query('from') || ''), to = String(c.req.query('to') || '')
  if (!ok(from) || !ok(to) || from > to) return err(c, 400, 'invalid_range', 'from/to 는 YYYY-MM-DD (from ≤ to)')
  const lo = `${from} 00:00:00`, hi = `${to} 23:59:59`   // KST → UTC 저장값 비교: -9시간
  const row = await c.env.DB.prepare(`
    SELECT COUNT(*) AS sent,
           SUM(CASE WHEN first_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
           SUM(CASE WHEN channel = 'alimtalk' THEN 1 ELSE 0 END) AS alimtalk
    FROM dispatches
    WHERE hospital_id = ? AND status IN ('sent','accepted','delivered','link')
      AND (label IS NULL OR label NOT LIKE 'QR%')
      AND created_at >= datetime(?, '-9 hours') AND created_at <= datetime(?, '-9 hours')`).bind(hid, lo, hi).first<any>().catch(() => null)
  const fr = await c.env.DB.prepare(`
    SELECT COUNT(*) AS n FROM views v JOIN dispatches d ON d.id = v.dispatch_id
    WHERE d.hospital_id = ? AND v.material_index = -1
      AND v.at >= datetime(?, '-9 hours') AND v.at <= datetime(?, '-9 hours')`).bind(hid, lo, hi).first<any>().catch(() => null)
  const sent = Number(row?.sent || 0), opened = Number(row?.opened || 0)
  return c.json({
    service: 'connector', from, to,
    sent, opened, open_rate: sent ? Math.round((opened / sent) * 1000) / 10 : null,
    alimtalk: Number(row?.alimtalk || 0), friend_clicks: Number(fr?.n || 0),
    as_of: new Date().toISOString(),
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
