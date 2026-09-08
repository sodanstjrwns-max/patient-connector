-- Publicly documented demo credentials must not retain authenticated sessions.
-- Account records and clinic data are intentionally preserved.
DELETE FROM auth_sessions WHERE user_id IN (
  SELECT id FROM users WHERE lower(email) IN ('demo@clinic.com', 'admin@patientconnect.kr')
);
