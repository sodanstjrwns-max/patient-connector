-- Additive upgrade; existing clinics, assets and consultations are preserved.
ALTER TABLE consult_sessions ADD COLUMN share_expires_at TEXT;
ALTER TABLE consult_sessions ADD COLUMN share_revoked_at TEXT;
ALTER TABLE consult_sessions ADD COLUMN share_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE consult_sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
-- Legacy clients could submit arbitrary slide fields. Only new server-generated snapshots are trusted.
UPDATE consult_sessions SET slides = COALESCE((SELECT json_group_array(json_remove(value, '$.asset', '$.drawing_url')) FROM json_each(consult_sessions.slides)), '[]') WHERE json_valid(slides);
-- Existing public links receive a finite transition window.
UPDATE consult_sessions SET share_expires_at = datetime('now', '+30 days') WHERE share_token IS NOT NULL;
CREATE TABLE IF NOT EXISTS auth_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  resets_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id),
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, asset_id)
);
CREATE TABLE IF NOT EXISTS uploads (
  key TEXT PRIMARY KEY,
  clinic_id INTEGER,
  user_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_views_session ON share_views(session_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_auth_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_uploads_clinic ON uploads(clinic_id);
CREATE INDEX IF NOT EXISTS idx_limits_reset ON auth_limits(resets_at);
