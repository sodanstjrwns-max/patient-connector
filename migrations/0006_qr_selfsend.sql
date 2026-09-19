-- 2026-09-19 체어사이드 QR: QR 안내장(link)에서 환자가 직접 번호를 넣어 카카오톡으로 받은 발송의 원본 토큰
ALTER TABLE dispatches ADD COLUMN source_token TEXT;
CREATE INDEX IF NOT EXISTS idx_dispatches_source ON dispatches(source_token);
