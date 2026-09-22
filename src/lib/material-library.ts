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

export type LibraryItem = { key: string; topic_id: string; kind: 'explain' | 'disease' | 'notice'; category: string | null; title: string; body: string; images_json: string; rev: string; source?: string | null; sort: number; active: number }
type LibraryRow = LibraryItem & { updated_at: string }
type HospitalCopy = { id: number; hospital_id: number; example_key: string; library_rev: string | null; library_locked: number; active: number }

/** 라이브러리 → 병원 자료함 반영. 없는 자료는 추가, 병원이 손대지 않은 사본(library_locked=0)은 최신 rev 로 갱신, 라이브러리에서 빠진 자료는 비활성.
 *  병원이 숨긴 자료(active=0)는 그대로 둔다 — 보이기/숨기기는 병원의 선택이며 동기화가 되돌리지 않는다. */
export async function propagateLibrary(db: D1Database, hospitalId?: number) {
  const lib = (await db.prepare('SELECT * FROM library_materials ORDER BY sort, key').all<LibraryRow>()).results || []
  const hospitals = hospitalId ? [{ id: hospitalId }] : ((await db.prepare('SELECT id FROM hospitals').all<{ id: number }>()).results || [])
  const copies = (await db.prepare(`SELECT id, hospital_id, example_key, library_rev, library_locked, active FROM materials WHERE example_key LIKE '${LIBRARY_KEY_PREFIX}%'${hospitalId ? ' AND hospital_id = ?' : ''}`).bind(...(hospitalId ? [hospitalId] : [])).all<HospitalCopy>()).results || []
  const stmts: D1PreparedStatement[] = []
  const counts = { inserted: 0, updated: 0, deactivated: 0, locked: 0 }
  for (const h of hospitals) {
    for (const item of lib) {
      const copy = copies.find(c => c.hospital_id === h.id && c.example_key === item.key)
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
        stmts.push(db.prepare("UPDATE materials SET kind = ?, category = ?, title = ?, body = ?, images_json = ?, library_rev = ?, updated_at = datetime('now') WHERE id = ? AND library_locked = 0").bind(item.kind, item.category, item.title, item.body, item.images_json, item.rev, copy.id))
      }
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
  return { ...counts, hospitals: hospitals.length, library: lib.filter(x => x.active).length }
}
