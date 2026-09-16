export type Guidance = {
  included: string; extra: string; alternatives: string; basis_date: string; valid_until: string; variability: string;
  external_allowed: boolean; consent_ref: string; deidentified: boolean; treatment: string; period: string; individual_notice: string;
}
const text = (v: unknown, max = 1000) => typeof v === 'string' ? v.trim().slice(0, max) : ''
export function guidanceOf(v: any): Guidance {
  v = v && typeof v === 'object' ? v : {}
  return { included: text(v.included), extra: text(v.extra), alternatives: text(v.alternatives), basis_date: text(v.basis_date, 10), valid_until: text(v.valid_until, 10), variability: text(v.variability), external_allowed: v.external_allowed === true, consent_ref: text(v.consent_ref, 200), deidentified: v.deidentified === true, treatment: text(v.treatment), period: text(v.period, 100), individual_notice: text(v.individual_notice) }
}
export function publicGuidance(g: Guidance) {
  const { consent_ref, deidentified, external_allowed, ...patient } = g
  return patient
}
export function shareIssue(m: { kind: string; title: string; guidance: Guidance; images: any[] }): string | null {
  const g = m.guidance
  if (m.kind === 'before_after' && (!g.external_allowed || !g.consent_ref || !g.deidentified || !g.treatment || !g.period || !g.individual_notice || m.images.length !== 2)) return `${m.title}: 외부 전송 동의 범위·비식별 확인·치료 내용·기간·개인차 안내 및 전후 이미지 2장을 확인하세요.`
  if (m.kind === 'cost') {
    const date = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s
    const today = new Date().toISOString().slice(0,10)
    if (!g.included || !g.extra || !g.variability || !date(g.basis_date) || !date(g.valid_until) || g.basis_date > today || g.valid_until < today || g.valid_until < g.basis_date) return `${m.title}: 포함 범위·추가 비용 조건·변동 가능성·기준일 및 유효기간을 확인하세요.`
  }
  return null
}
export function safeLink(value: unknown, chat = false): string | null {
  if (!value) return null
  try {
    const u = new URL(String(value))
    if (u.protocol !== 'https:' || u.username || u.password || u.href.length > 500 || (chat && u.hostname !== 'pf.kakao.com')) throw new Error()
    return u.href
  } catch { throw new Error(chat ? '카카오 상담 주소는 https://pf.kakao.com/... 형식으로 입력하세요.' : '예약 주소는 HTTPS 주소로 입력하세요.') }
}
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2,'0')).join('')
}
