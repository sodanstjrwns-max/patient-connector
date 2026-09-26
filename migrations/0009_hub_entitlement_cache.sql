-- 허브 올패스 권한 캐시 (30분) — 2026-09-26 허브 올패스 권한연동 규약 v1
-- hub.patientfunnel.kr /api/v1/entitlements 에서 고른 이 서비스(connector)의 유효 권한을 병원별로 캐시.
-- ent_json = 'null' 은 "유효 권한 없음 / 허브 미등록(404)". fetched_at = epoch ms (hub_profile_cache 와 같은 방식).
CREATE TABLE IF NOT EXISTS hub_entitlement_cache (
  ps_hospital_id TEXT PRIMARY KEY,
  ent_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
