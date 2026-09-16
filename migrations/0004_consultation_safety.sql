-- Additive only: original materials, annotations and dispatch snapshots remain intact.
ALTER TABLE materials ADD COLUMN guidance_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE hospitals ADD COLUMN chat_url TEXT;
ALTER TABLE hospitals ADD COLUMN booking_url TEXT;
ALTER TABLE dispatches ADD COLUMN request_key TEXT;
ALTER TABLE dispatches ADD COLUMN request_hash TEXT;
CREATE UNIQUE INDEX idx_dispatch_request ON dispatches(hospital_id, request_key);
CREATE TABLE scoped_annotations (
  hospital_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  material_id INTEGER NOT NULL,
  media_key TEXT NOT NULL,
  strokes_json TEXT NOT NULL DEFAULT '[]',
  image_key TEXT,
  video_time REAL,
  version INTEGER NOT NULL DEFAULT 1,
  write_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (hospital_id, scope, material_id, media_key),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id),
  FOREIGN KEY (material_id) REFERENCES materials(id)
);
CREATE TABLE material_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  ids_json TEXT NOT NULL,
  UNIQUE(hospital_id, name),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);
