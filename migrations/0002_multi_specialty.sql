-- 전 진료과 확장 + 케이스 공개(데모) 허용
ALTER TABLE treatments ADD COLUMN specialty TEXT DEFAULT '치과';
ALTER TABLE clinics ADD COLUMN specialty TEXT DEFAULT '';
UPDATE treatments SET specialty = '치과';

-- cases.clinic_id를 nullable로 재구성 (NULL = 공용 데모 케이스)
CREATE TABLE cases_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  treatment_id INTEGER,
  title TEXT,
  before_url TEXT NOT NULL,
  after_url TEXT NOT NULL,
  duration TEXT,
  material TEXT,
  doctor TEXT,
  consent INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO cases_new SELECT * FROM cases;
DROP TABLE cases;
ALTER TABLE cases_new RENAME TO cases;
CREATE INDEX IF NOT EXISTS idx_cases_clinic ON cases(clinic_id);
