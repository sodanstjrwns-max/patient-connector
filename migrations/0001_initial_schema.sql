-- 페이션트 커넥트 초기 스키마

-- 병원
CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo_url TEXT,
  phone TEXT,
  address TEXT,
  emergency_info TEXT,
  plan TEXT DEFAULT 'free',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 사용자 (병원 계정 / 관리자)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner', -- owner / staff / admin
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

-- 세션 토큰
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 진료 과목
CREATE TABLE IF NOT EXISTS treatments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- 설명 자료
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,               -- NULL = 공개 라이브러리
  source_asset_id INTEGER,         -- 복제 원본
  treatment_id INTEGER,
  category TEXT NOT NULL,          -- process / progression / caution / cost / compare / faq / clinic
  type TEXT NOT NULL,              -- image / video / compare / progression / cost / steps / faq
  title TEXT NOT NULL,
  description TEXT,
  media_urls TEXT DEFAULT '[]',    -- JSON array
  payload TEXT DEFAULT '{}',       -- JSON (단계, 수가표 행, FAQ 등)
  reviewer_name TEXT,
  tags TEXT DEFAULT '[]',          -- JSON array
  is_public INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  send_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  FOREIGN KEY (treatment_id) REFERENCES treatments(id)
);

-- 비포·애프터 케이스 (원내 전용)
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL,
  treatment_id INTEGER,
  title TEXT,
  before_url TEXT NOT NULL,
  after_url TEXT NOT NULL,
  duration TEXT,
  material TEXT,
  doctor TEXT,
  consent INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

-- 상담 세션
CREATE TABLE IF NOT EXISTS consult_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL,
  user_id INTEGER,
  patient_label TEXT,
  slides TEXT DEFAULT '[]',        -- JSON [{asset_id, drawing_png, note}]
  schedule_note TEXT,
  share_token TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

-- 공유 링크 열람 기록
CREATE TABLE IF NOT EXISTS share_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES consult_sessions(id)
);

-- 2단계 대비: 치료 여정 타임라인 (라우팅/DB만 준비)
CREATE TABLE IF NOT EXISTS journey_timelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  treatment_id INTEGER,
  title TEXT,
  steps TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2단계 대비: 진료 동의 서명
CREATE TABLE IF NOT EXISTS consent_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  clinic_id INTEGER,
  signature_png TEXT,
  content TEXT,
  signed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_assets_clinic ON assets(clinic_id);
CREATE INDEX IF NOT EXISTS idx_assets_treatment ON assets(treatment_id);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON consult_sessions(share_token);
CREATE INDEX IF NOT EXISTS idx_sessions_clinic ON consult_sessions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_cases_clinic ON cases(clinic_id);
CREATE INDEX IF NOT EXISTS idx_auth_token ON auth_sessions(token);
