-- Provenance and retry-safe example imports. Existing materials and dispatch snapshots are unchanged.
ALTER TABLE materials ADD COLUMN example_key TEXT;
CREATE UNIQUE INDEX idx_materials_hospital_example ON materials(hospital_id, example_key);
