// 허브(Patient Hub) 병원 프로필 조회 — 온보딩 프리필용
// - GET https://hub.patientfunnel.kr/api/v1/hospital-profile
//   헤더: Authorization: Bearer {HUB_API_KEY} + X-PS-Hospital-Id: {전역 병원 ID}
// - 30분 D1 캐시 (hub_profile_cache). 404(미등록 병원)도 정상 케이스로 캐시.
// - 어떤 실패에서도 null 반환 → 프리필 없이 기존 온보딩 흐름 유지.
// (patient-inside src/lib/hub-profile.ts 패턴 어댑트 — 형제 서비스 공통)

export interface HospitalProfile {
  basic?: {
    clinic_type?: string | null
    staff_count?: number | null
    chair_or_bed?: number | null
    region?: string | null
    opened_year?: number | null
    key_treatments?: string[]
  }
  mvv?: {
    status?: string | null
    mission?: string | null
    vision?: string | null
    core_values?: Array<{ value?: string; description?: string; behavior_example?: string } | string>
    slogan?: string | null
    confirmed_at?: string | null
  }
  scan_summary?: { report_id?: string; imported_at?: string; facts?: Array<{ key?: string; label?: string; value?: string }> } | null
  updated_at?: string
}

type HubEnv = { DB: D1Database; HUB_API_KEY?: string }

const CACHE_TTL_MS = 30 * 60 * 1000
const HUB_BASE_URL = 'https://hub.patientfunnel.kr'

export async function fetchHospitalProfile(env: HubEnv, psHospitalId: string): Promise<HospitalProfile | null> {
  if (!psHospitalId || !env.HUB_API_KEY) return null
  try {
    // 1) 캐시 조회 (payload NULL = 404 캐시)
    const cached = await env.DB.prepare(
      `SELECT payload, fetched_at FROM hub_profile_cache WHERE ps_hospital_id = ?`
    ).bind(psHospitalId).first<{ payload: string | null; fetched_at: number }>()
    if (cached && Date.now() - Number(cached.fetched_at) < CACHE_TTL_MS) {
      if (!cached.payload) return null
      try { return JSON.parse(cached.payload) as HospitalProfile } catch { return null }
    }

    // 2) 허브 호출
    const res = await fetch(`${HUB_BASE_URL}/api/v1/hospital-profile`, {
      headers: {
        Authorization: `Bearer ${env.HUB_API_KEY}`,
        'X-PS-Hospital-Id': psHospitalId
      }
    })
    if (res.status === 404) {
      // 등록 안 된 병원: 정상 케이스로 캐시해 30분간 재호출 방지
      await upsertCache(env, psHospitalId, null)
      return null
    }
    if (!res.ok) {
      // 일시 장애: 캐시를 덮어쓰지 않고, 만료된 캐시라도 있으면 그것을 사용 (기능 저하 최소화)
      if (cached?.payload) {
        try { return JSON.parse(cached.payload) as HospitalProfile } catch { return null }
      }
      return null
    }
    const data: any = await res.json()
    const profile = data?.hospital_profile
    if (!profile || typeof profile !== 'object') return null
    await upsertCache(env, psHospitalId, JSON.stringify(profile))
    return profile as HospitalProfile
  } catch {
    return null
  }
}

async function upsertCache(env: HubEnv, psHospitalId: string, payload: string | null) {
  try {
    await env.DB.prepare(
      `INSERT INTO hub_profile_cache (ps_hospital_id, payload, fetched_at) VALUES (?,?,?)
       ON CONFLICT(ps_hospital_id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
    ).bind(psHospitalId, payload, Date.now()).run()
  } catch {}
}
