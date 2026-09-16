-- One current annotation per clinic/material/media; exported PNGs are immutable for sent guides.
CREATE TABLE material_annotations (
  hospital_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  media_key TEXT NOT NULL,
  strokes_json TEXT NOT NULL DEFAULT '[]',
  image_key TEXT,
  video_time REAL,
  version INTEGER NOT NULL DEFAULT 1,
  write_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (hospital_id, material_id, media_key),
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id),
  FOREIGN KEY (material_id) REFERENCES materials(id)
);
