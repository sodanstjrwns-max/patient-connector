-- Patient Connect — 초기 스키마 (2026-09-16)
-- 테넌트 = 병원(hospitals). 허브 SSO 로 자동 생성되며 ps_hospital_id 가 전역 병원 ID.

CREATE TABLE IF NOT EXISTS hospitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ps_hospital_id TEXT NOT NULL UNIQUE,          -- 허브 전역 병원 ID (SSO hid)
  name TEXT NOT NULL,                           -- 허브 병원명(정본). 발송 시 #{병원명}
  phone TEXT,                                   -- 환자 안내장에 표시할 병원 전화
  address TEXT,                                 -- 안내장 하단 표시
  link_days INTEGER NOT NULL DEFAULT 30,        -- 안내장 링크 유효기간(일)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 안내자료(설명·비포애프터·비용·주의사항). 병원이 직접 등록. 이미지는 R2 키 목록.
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                           -- explain | before_after | cost | notice
  category TEXT,                                -- 진료 분류 (임플란트·교정·보철 …) 자유 입력
  title TEXT NOT NULL,
  body TEXT,                                    -- 설명 본문(줄바꿈 유지, '- ' 로 시작하는 줄은 항목)
  images_json TEXT NOT NULL DEFAULT '[]',       -- [{key, caption}] · before_after 는 [before, after]
  cost_json TEXT NOT NULL DEFAULT '[]',         -- [{name, price, qty, note}]
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);
CREATE INDEX IF NOT EXISTS idx_materials_hospital ON materials(hospital_id, active, sort);

-- 발송(안내장). 자료 스냅샷을 복사해 두므로 이후 자료를 고쳐도 환자가 받은 안내장은 그대로.
CREATE TABLE IF NOT EXISTS dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,                   -- /g/:token (128bit hex)
  label TEXT,                                   -- 병원 내부 메모(예: 3시 임플란트 상담) — 환자에게 미표시
  phone_enc TEXT,                               -- AES-GCM 암호화 수신번호, 발송 후 7일 지나면 NULL
  phone_hash TEXT,                              -- 수신거부·중복 판정용 SHA-256(병원 솔트)
  materials_json TEXT NOT NULL,                 -- 자료 스냅샷 배열
  channel TEXT NOT NULL DEFAULT 'alimtalk',     -- alimtalk | link (링크 직접 전달)
  status TEXT NOT NULL DEFAULT 'created',       -- created | sent | failed | link | blocked | expired
  solapi_group_id TEXT,
  error TEXT,
  sent_at TEXT,
  first_opened_at TEXT,
  open_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);
CREATE INDEX IF NOT EXISTS idx_dispatches_hospital ON dispatches(hospital_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(status, sent_at);

-- 열람 이벤트(자료 단위). 개인 식별 없음 — dispatch 에만 연결.
CREATE TABLE IF NOT EXISTS views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_id INTEGER NOT NULL,
  material_index INTEGER,                       -- NULL = 안내장 열람, n = n번째 자료 펼침
  at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (dispatch_id) REFERENCES dispatches(id)
);
CREATE INDEX IF NOT EXISTS idx_views_dispatch ON views(dispatch_id, at);

-- 수신거부: 병원 단위, 번호 해시만 보관.
CREATE TABLE IF NOT EXISTS optouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id INTEGER NOT NULL,
  phone_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (hospital_id, phone_hash)
);

-- 허브 병원 프로필 캐시 (30분). payload NULL = 404 캐시.
CREATE TABLE IF NOT EXISTS hub_profile_cache (
  ps_hospital_id TEXT PRIMARY KEY,
  payload TEXT,
  fetched_at INTEGER NOT NULL
);

-- 발송내역 표시용 마지막 4자리 (원문은 phone_enc 에만, 7일 후 파기)
ALTER TABLE dispatches ADD COLUMN phone_last4 TEXT;
