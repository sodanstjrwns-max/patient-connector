// 진료 분류 프리셋(자료 편집 화면의 선택지). 예시 문안·목업은 없음 — 설명자료는 Patient Connect 영상 라이브러리(library_materials, 구글 드라이브 동기화)에서 온다.
const treatmentCategories = ['임플란트', '치아교정', '보철치료', '충치치료', '신경치료', '잇몸치료', '사랑니·발치', '소아치과', '예방·검진', '턱관절치료']
export const materialCategories: Record<string, string[]> = {
  explain: treatmentCategories,
  disease: ['충치', '잇몸질환', '치수·치근단 질환', '치아균열·파절', '부정교합', '사랑니·매복치', '치아상실', '턱관절질환', '치아마모·시린이', '구강점막질환'],
  cost: treatmentCategories,
  before_after: ['임플란트', '치아교정', '보철치료', '충치치료', '잇몸치료', '심미치료'],
}
export const LIBRARY_KEY_PREFIX = 'drive:'
export const libraryNotice = 'Patient Connect가 모든 병원에 기본으로 제공하는 영상 자료입니다. 이 병원 자료함에서 숨기거나 다시 보이게 할 수 있습니다. 제목·본문·영상을 직접 수정하면 이후 자동 갱신에서 제외됩니다.'

import { fetchHospitalProfile } from './hub-profile'

export type LibraryItem = { key: string; topic_id: string; kind: 'explain' | 'disease' | 'notice'; category: string | null; title: string; body: string; images_json: string; rev: string; source?: string | null; sort: number; active: number; specialty: string }
type LibraryRow = LibraryItem & { updated_at: string }
type HospitalCopy = { id: number; hospital_id: number; example_key: string; library_rev: string | null; library_locked: number; active: number }
type LibraryEnv = { DB: D1Database; HUB_API_KEY?: string }
const MISMATCH = 'specialty-mismatch' // 진료과가 달라 내려둔 사본 표시(병원이 직접 숨긴 것과 구분)

/** 진료과 매칭. 라이브러리 자료의 specialty('치과' 등)와 병원 진료과 문자열('치과'·'한의원'·'한의과'…)을 비교. 병원 진료과를 모르면 통과. */
const SPECIALTY_KEYWORDS: Record<string, string[]> = { '치과': ['치과', '치의'], '한의원': ['한의'], '피부과': ['피부'], '성형외과': ['성형'], '안과': ['안과'], '정형외과': ['정형'], '내과': ['내과'], '이비인후과': ['이비인후'], '산부인과': ['산부인과', '여성'], '소아청소년과': ['소아'] }
export function specialtyMatches(itemSpecialty: string | null | undefined, clinicType: string | null | undefined): boolean {
  const want = (itemSpecialty || '').trim()
  const have = (clinicType || '').trim()
  if (!want || !have) return true
  const keys = SPECIALTY_KEYWORDS[want] || [want]
  return keys.some(k => have.includes(k))
}

/** 병원 진료과: hospitals.clinic_type 사본이 없으면 허브 프로필에서 받아 저장. */
export async function ensureClinicType(env: LibraryEnv, hospitalId: number, psHospitalId: string, current: string | null, hospitalName?: string | null): Promise<string | null> {
  if (current) return current
  const profile = await fetchHospitalProfile(env, psHospitalId)
  let ct = profile?.basic?.clinic_type ? String(profile.basic.clinic_type).trim().slice(0, 60) : null
  // 허브에 진료과가 없으면 병원 이름에서 추정('OO치과' → 치과). 허브가 채워지면 SSO 로그인 때 덮어쓴다.
  if (!ct && hospitalName) ct = Object.keys(SPECIALTY_KEYWORDS).find(k => SPECIALTY_KEYWORDS[k].some(w => hospitalName.includes(w))) || null
  if (ct) await env.DB.prepare('UPDATE hospitals SET clinic_type = ? WHERE id = ?').bind(ct, hospitalId).run().catch(() => undefined)
  return ct
}

/** 라이브러리 → 병원 자료함 반영. 없는 자료는 추가, 병원이 손대지 않은 사본(library_locked=0)은 최신 rev 로 갱신, 라이브러리에서 빠진 자료는 비활성.
 *  병원이 숨긴 자료(active=0)는 그대로 둔다 — 보이기/숨기기는 병원의 선택이며 동기화가 되돌리지 않는다.
 *
 *  【2026-09-26】병원 500곳(여유 1,000곳) 대비
 *  - 사본 찾기를 배열 find(병원×자료×전체 사본 = 1,000×300×300,000 비교) → Map 조회로. 이전엔 병원 수백 곳이면 CPU 30초를 넘는다.
 *  - 전 병원 반영(hospitalId 없음)은 병원 id 순으로 나눠 한다: 한 호출에 병원 최대 100곳·쓰기 문장 약 800개·15초.
 *    남으면 next_cursor(마지막으로 끝낸 병원 id)를 돌려준다 → /api/v1/ops/library-propagate?cursor= 로 이어 부른다.
 *    한 병원의 문장은 한 호출 안에서 다 쓴다(병원 단위로 끊음). 재실행해도 결과가 같다(ON CONFLICT·rev 비교).
 *  - 병원 1곳 반영(hospitalId 지정, 로그인·[라이브러리 다시 가져오기])은 이전과 같다. */
export async function propagateLibrary(env: LibraryEnv, hospitalId?: number, opts: { afterId?: number; maxStatements?: number; maxMs?: number; maxHospitals?: number } = {}) {
  const db = env.DB
  const started = Date.now()
  const bulk = !hospitalId
  const afterId = Math.max(0, Math.floor(Number(opts.afterId) || 0))
  const maxStatements = opts.maxStatements ?? 800
  const maxMs = opts.maxMs ?? 15000
  const maxHospitals = opts.maxHospitals ?? 100
  const lib = (await db.prepare('SELECT * FROM library_materials ORDER BY sort, key').all<LibraryRow>()).results || []
  const hospitals = (await (hospitalId
    ? db.prepare('SELECT id, ps_hospital_id, name, clinic_type FROM hospitals WHERE id = ?').bind(hospitalId)
    : db.prepare('SELECT id, ps_hospital_id, name, clinic_type FROM hospitals WHERE id > ? ORDER BY id LIMIT ?').bind(afterId, maxHospitals)
  ).all<{ id: number; ps_hospital_id: string; name: string; clinic_type: string | null }>()).results || []
  const lastId = hospitals.length ? hospitals[hospitals.length - 1].id : afterId
  const copies = hospitals.length ? ((await (hospitalId
    ? db.prepare(`SELECT id, hospital_id, example_key, library_rev, library_locked, active FROM materials WHERE example_key LIKE '${LIBRARY_KEY_PREFIX}%' AND hospital_id = ?`).bind(hospitalId)
    : db.prepare(`SELECT id, hospital_id, example_key, library_rev, library_locked, active FROM materials WHERE hospital_id > ? AND hospital_id <= ? AND example_key LIKE '${LIBRARY_KEY_PREFIX}%'`).bind(afterId, lastId)
  ).all<HospitalCopy>()).results || []) : []
  const copyMap = new Map<string, HospitalCopy>()
  for (const cp of copies) copyMap.set(cp.hospital_id + '\u0000' + cp.example_key, cp)
  const stmts: D1PreparedStatement[] = []
  const counts = { inserted: 0, updated: 0, deactivated: 0, locked: 0, specialty_skipped: 0, unknown_specialty: 0 }
  let processed = 0
  let nextCursor: number | null = null
  for (const h of hospitals) {
    // 예산: 병원 하나가 최대 lib.length 문장을 만든다 — 다음 병원까지 넣으면 넘칠 것 같으면 여기서 끊는다(최소 1곳은 처리)
    if (bulk && processed > 0 && (stmts.length + lib.length > maxStatements || Date.now() - started > maxMs)) { nextCursor = hospitals[processed - 1].id; break }
    const clinicType = await ensureClinicType(env, h.id, h.ps_hospital_id, h.clinic_type, h.name)
    if (!clinicType) counts.unknown_specialty++
    for (const item of lib) {
      const copy = copyMap.get(h.id + '\u0000' + item.key)
      const fits = specialtyMatches(item.specialty, clinicType)
      if (!fits) {
        // 진료과가 다른 자료: 넣지 않고, 이미 들어간 미수정 사본은 내려둔다(병원이 숨긴 것과 구분해 표시)
        counts.specialty_skipped++
        if (copy && !copy.library_locked && copy.active) stmts.push(db.prepare("UPDATE materials SET active = 0, library_rev = ?, updated_at = datetime('now') WHERE id = ?").bind(MISMATCH, copy.id))
        continue
      }
      if (!copy) {
        if (!item.active) continue
        counts.inserted++
        stmts.push(db.prepare(`INSERT INTO materials (hospital_id, kind, category, title, body, images_json, cost_json, guidance_json, sort, example_key, library_rev)
          VALUES (?, ?, ?, ?, ?, ?, '[]', '{}', (SELECT COALESCE(MAX(sort), 0) + 1 FROM materials WHERE hospital_id = ?), ?, ?)
          ON CONFLICT(hospital_id, example_key) DO NOTHING`).bind(h.id, item.kind, item.category, item.title, item.body, item.images_json, h.id, item.key, item.rev))
        continue
      }
      if (copy.library_locked) { counts.locked++; continue }
      if (!item.active) {
        if (copy.active) { counts.deactivated++; stmts.push(db.prepare("UPDATE materials SET active = 0, updated_at = datetime('now') WHERE id = ?").bind(copy.id)) }
        continue
      }
      if (copy.library_rev !== item.rev) {
        counts.updated++
        const restore = copy.library_rev === MISMATCH // 진료과 때문에 내려둔 사본은 다시 올린다(병원이 숨긴 것은 그대로)
        stmts.push(db.prepare(`UPDATE materials SET kind = ?, category = ?, title = ?, body = ?, images_json = ?, library_rev = ?${restore ? ', active = 1' : ''}, updated_at = datetime('now') WHERE id = ? AND library_locked = 0`).bind(item.kind, item.category, item.title, item.body, item.images_json, item.rev, copy.id))
      }
    }
    processed++
  }
  // 한 페이지(maxHospitals)를 다 채웠으면 뒤에 병원이 더 있을 수 있다
  if (bulk && nextCursor === null && hospitals.length === maxHospitals) nextCursor = lastId
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
  return { ...counts, hospitals: processed, library: lib.filter(x => x.active).length, statements: stmts.length, next_cursor: nextCursor }
}
