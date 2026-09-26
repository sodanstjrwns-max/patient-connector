// 【2026-09-26】페이션트 폼 병원별 연동 키(pfk_…) — 허브가 정본.
// GET https://hub.patientfunnel.kr/api/v1/form-keys (Bearer HUB_API_KEY) → { keys:{ps_hospital_id: pfk_…} }
// 10분 메모리 캐시. 허브 실패 시 마지막 값을 계속 쓰고 1분 뒤 재시도, 값이 없으면 환경변수 FORM_INTEGRATION_KEYS(이관 전 방식) 로 대신한다.
// 병원 추가·교체·폐기는 허브 운영 API(PUT/DELETE /api/admin/form-keys) 한 곳에서. 키는 서버에서만 쓰고 브라우저로 내리지 않는다.
const HUB_FORM_KEYS_URL = 'https://hub.patientfunnel.kr/api/v1/form-keys'
const TTL_MS = 10 * 60 * 1000
const RETRY_MS = 60 * 1000

type Memo = { at: number; ttl: number; map: Record<string, string> }
let memo: Memo | null = null
let inflight: Promise<void> | null = null

function envMap(env: any): Record<string, string> {
  try {
    const m = JSON.parse(String(env?.FORM_INTEGRATION_KEYS || '{}'))
    const out: Record<string, string> = {}
    if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) if (typeof v === 'string' && v.trim().startsWith('pfk_')) out[k] = v.trim()
    return out
  } catch { return {} }
}

async function refresh(env: any): Promise<void> {
  const apiKey = String(env?.HUB_API_KEY || '').trim()
  if (apiKey) {
    try {
      const r = await fetch(HUB_FORM_KEYS_URL, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(3000) })
      if (r.ok) {
        const j: any = await r.json().catch(() => null)
        if (j?.ok && j.keys && typeof j.keys === 'object') {
          const map: Record<string, string> = {}
          for (const [k, v] of Object.entries(j.keys)) if (typeof v === 'string' && v.startsWith('pfk_')) map[k] = v
          memo = { at: Date.now(), ttl: TTL_MS, map }
          return
        }
      }
    } catch { /* 아래 대체 경로 */ }
  }
  memo = { at: Date.now(), ttl: RETRY_MS, map: memo?.map && Object.keys(memo.map).length ? memo.map : envMap(env) }
}

/** 전체 맵 {ps_hospital_id: pfk_…} */
export async function formKeyMap(env: any): Promise<Record<string, string>> {
  if (!memo || Date.now() - memo.at > memo.ttl) {
    if (!inflight) inflight = refresh(env).finally(() => { inflight = null })
    await inflight
  }
  return memo?.map || {}
}

/** 병원 한 곳의 키 (없으면 null) */
export async function formKeyFor(env: any, psHospitalId: string | null | undefined): Promise<string | null> {
  if (!psHospitalId) return null
  return (await formKeyMap(env))[psHospitalId] || null
}
