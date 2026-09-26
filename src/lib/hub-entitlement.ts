// 허브 올패스 권한 연동 (규약: pflive/허브_올패스_권한연동_규약_2026-09-26.md)
//
// GET https://hub.patientfunnel.kr/api/v1/entitlements
//   헤더: Authorization: Bearer {HUB_API_KEY} · X-PS-Hospital-Id: {ps_hospital_id}
//   응답: { allpass: {...}|null, services: { <slug>: {...} }, as_of }
//
// - 유효 권한 = services['connector'] 있으면 그것, 없으면 allpass.
//   status 가 active / cancel_at_period_end 이고 ends_at 이 미래일 때만 유효.
// - 올려주기만 한다. 유효 권한이 없거나 허브 호출이 실패하면 기존 동작 그대로.
//   (2026-09-26 현재 커넥터에는 유료 티어·체험·잠금 게이트가 없다 — 게이트가 생기면 이 함수로 합성한다.)
// - 병원별 30분 D1 캐시(hub_entitlement_cache, 0009). 허브 hub-events 'subscription_updated' 로 무효화.
// - 타임아웃 3초. 어떤 실패에서도 throw 하지 않는다.

export const HUB_ENTITLEMENT_SLUG = 'connector'
const HUB_ENTITLEMENTS_URL = 'https://hub.patientfunnel.kr/api/v1/entitlements'
const CACHE_TTL_MS = 30 * 60 * 1000
const FAILURE_RETRY_MS = 5 * 60 * 1000 // 허브 장애 시 매 요청마다 3초씩 기다리지 않도록 5분 뒤 재시도
const FETCH_TIMEOUT_MS = 3000

export type HubTier = 'S' | 'M' | 'L'
export interface HubEntitlement { tier: HubTier; source: string; ends_at: string }
interface CachedEntitlement extends HubEntitlement { status?: string }
type HubEnv = { DB: D1Database; HUB_API_KEY?: string }

function parseTime(raw: unknown): number {
  const s = String(raw ?? '').trim()
  if (!s) return NaN
  const iso = s.length <= 10 ? s + 'T23:59:59Z' : (s.includes('T') ? s : s.replace(' ', 'T')) + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')
  return new Date(iso).getTime()
}

function isValid(e: CachedEntitlement | null | undefined, now = Date.now()): e is CachedEntitlement {
  if (!e) return false
  if (e.tier !== 'S' && e.tier !== 'M' && e.tier !== 'L') return false
  const st = String(e.status ?? 'active')
  if (st !== 'active' && st !== 'cancel_at_period_end') return false
  const t = parseTime(e.ends_at)
  return Number.isFinite(t) && t > now
}

/** 허브 응답에서 이 서비스의 유효 권한을 고른다 (서비스 개별 > 올패스). */
export function pickEntitlement(data: any, slug: string = HUB_ENTITLEMENT_SLUG): CachedEntitlement | null {
  if (!data || typeof data !== 'object') return null
  const svc = data.services && typeof data.services === 'object' ? data.services[slug] : null
  const raw = svc || data.allpass || null
  if (!raw || typeof raw !== 'object') return null
  const e: CachedEntitlement = {
    tier: String(raw.tier || '').toUpperCase() as HubTier,
    source: String(raw.source || ''),
    ends_at: String(raw.ends_at || ''),
    status: String(raw.status || ''),
  }
  return isValid(e) ? e : null
}

function toPublic(e: CachedEntitlement | null): HubEntitlement | null {
  return isValid(e) ? { tier: e.tier, source: e.source, ends_at: e.ends_at } : null
}

async function writeCache(env: HubEnv, psId: string, ent: CachedEntitlement | null, fetchedAt = Date.now()) {
  try {
    await env.DB.prepare(
      `INSERT INTO hub_entitlement_cache (ps_hospital_id, ent_json, fetched_at) VALUES (?,?,?)
       ON CONFLICT(ps_hospital_id) DO UPDATE SET ent_json = excluded.ent_json, fetched_at = excluded.fetched_at`
    ).bind(psId, JSON.stringify(ent), fetchedAt).run()
  } catch {}
}

/** ps_hospital_id 의 유효 권한 {tier, source, ends_at}. 없거나 실패 시 null. */
export async function fetchHubEntitlement(env: HubEnv, psHospitalId: string | null | undefined): Promise<HubEntitlement | null> {
  const psId = String(psHospitalId || '').trim()
  if (!psId) return null

  let cached: CachedEntitlement | null = null
  let hasCache = false
  try {
    const row = await env.DB.prepare('SELECT ent_json, fetched_at FROM hub_entitlement_cache WHERE ps_hospital_id = ?')
      .bind(psId).first<{ ent_json: string; fetched_at: number }>()
    if (row) {
      try { cached = JSON.parse(row.ent_json); hasCache = true } catch {}
      if (hasCache && Date.now() - Number(row.fetched_at) < CACHE_TTL_MS) return toPublic(cached)
    }
  } catch { /* 테이블 미존재 등 — 캐시 없이 진행 */ }

  const apiKey = (env.HUB_API_KEY || '').trim()
  if (!apiKey) return toPublic(cached)

  const failed = async () => {
    await writeCache(env, psId, cached, Date.now() - (CACHE_TTL_MS - FAILURE_RETRY_MS))
    return toPublic(cached)
  }
  try {
    const res = await fetch(HUB_ENTITLEMENTS_URL, {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-PS-Hospital-Id': psId },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.status === 404) { await writeCache(env, psId, null); return null } // 허브 미등록 병원
    if (!res.ok) { console.warn('[HubEntitlement] hub returned', res.status, '— keeping current behavior'); return await failed() }
    const ent = pickEntitlement(await res.json())
    await writeCache(env, psId, ent)
    return toPublic(ent)
  } catch (e) {
    console.warn('[HubEntitlement] fetch failed (non-fatal):', e instanceof Error ? e.message : e)
    return await failed()
  }
}

/** 허브 이벤트(subscription_updated) 수신 시 그 병원 캐시 삭제. */
export async function invalidateHubEntitlement(db: D1Database, psHospitalId: string): Promise<void> {
  await db.prepare('DELETE FROM hub_entitlement_cache WHERE ps_hospital_id = ?').bind(psHospitalId).run().catch(() => undefined)
}
