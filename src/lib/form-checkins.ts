// 【2026-09-19】Patient Form '오늘 접수 환자'(신환+재진) — 병원별 통합키는 secret FORM_INTEGRATION_KEYS(JSON {ps_hospital_id: pfk_…}). 서버 전용.
export type FormCheckin = { id: string; visitKind: 'new' | 'returning'; patientName: string; phone: string | null; birthDate: string | null; gender: string | null; dept: string[] | null; checkedInAt: string; stage: string }
export function formKeyFor(env: Record<string, any>, psHospitalId: string | null | undefined): string | null {
  if (!psHospitalId) return null
  try { const k = JSON.parse(String(env.FORM_INTEGRATION_KEYS || '{}'))?.[psHospitalId]; return typeof k === 'string' && k.startsWith('pfk_') ? k : null } catch { return null }
}
export async function fetchFormCheckins(env: Record<string, any>, key: string, opts: { date?: string; q?: string; limit?: number } = {}): Promise<{ ok: boolean; items: FormCheckin[]; date?: string; error?: string }> {
  const base = String(env.FORM_API_URL || 'https://form.patientfunnel.kr').replace(/\/$/, '')
  const u = new URL(`${base}/api/integration/checkins`)
  if (opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)) u.searchParams.set('date', opts.date)
  if (opts.q) u.searchParams.set('q', String(opts.q).slice(0, 80))
  u.searchParams.set('limit', String(Math.max(1, Math.min(200, opts.limit || 100))))
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) })
    const j: any = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, items: [], error: j?.error || `폼 응답 오류 (HTTP ${res.status})` }
    return { ok: true, items: Array.isArray(j.items) ? j.items : [], date: j.date }
  } catch { return { ok: false, items: [], error: '폼 서버에 연결하지 못했습니다' } }
}
