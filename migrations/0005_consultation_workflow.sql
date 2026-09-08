-- Consultation workspace: additive, existing consultations remain readable.
ALTER TABLE consult_sessions ADD COLUMN internal_note TEXT NOT NULL DEFAULT '';
ALTER TABLE consult_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'saved';
ALTER TABLE consult_sessions ADD COLUMN client_key TEXT;
ALTER TABLE consult_sessions ADD COLUMN last_write_key TEXT;
ALTER TABLE consult_sessions ADD COLUMN share_snapshot TEXT;
CREATE UNIQUE INDEX idx_sessions_client_key ON consult_sessions(clinic_id, client_key) WHERE client_key IS NOT NULL;
CREATE TABLE consult_sets (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 clinic_id INTEGER NOT NULL REFERENCES clinics(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 items TEXT NOT NULL DEFAULT '[]',
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sets_clinic ON consult_sets(clinic_id, updated_at);
CREATE TABLE patient_feedback (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 session_id INTEGER NOT NULL REFERENCES consult_sessions(id),
 clinic_id INTEGER NOT NULL REFERENCES clinics(id),
 visitor_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('understood','question','schedule')),
 message TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 resolved_at TEXT,
 resolved_by INTEGER,
 UNIQUE(session_id, visitor_key, kind)
);
CREATE INDEX idx_feedback_clinic ON patient_feedback(clinic_id,status,updated_at);
ALTER TABLE assets ADD COLUMN staff_note TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN source_note TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN usage_rights TEXT NOT NULL DEFAULT 'unconfirmed';
ALTER TABLE assets ADD COLUMN review_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE assets ADD COLUMN reviewed_at TEXT;
ALTER TABLE assets ADD COLUMN reviewed_by INTEGER;
ALTER TABLE assets ADD COLUMN updated_at TEXT;
UPDATE assets SET updated_at=created_at;
