-- 【2026-09-26】병원 500곳(여유 1,000곳) 대비 인덱스 — 데이터 변경 없음.
-- 수신번호 원문 파기(ps-monitor 매일 /api/v1/ops/purge): phone_enc IS NOT NULL AND created_at < 7일 전.
-- 이전엔 dispatches 전체 스캔(EXPLAIN: SCAN dispatches) — 발송이 누적될수록(1,000곳 × 하루 수십 건) 매일 전 행을 읽는다.
-- 번호가 남은(최근 7일 + 미파기) 행만 담는 부분 인덱스라 작다.
CREATE INDEX IF NOT EXISTS idx_dispatches_phone_purge ON dispatches(created_at) WHERE phone_enc IS NOT NULL;
