-- 데모 병원 + 계정
INSERT OR IGNORE INTO clinics (id, name, phone, address, emergency_info) VALUES
  (1, '서울비디치과', '02-1234-5678', '서울특별시 강남구', '응급 시 진료시간 내 02-1234-5678로 연락 주세요. 야간 응급은 가까운 대학병원 응급실을 이용하세요.');

-- 비밀번호: demo1234 (SHA-256 hex of 'demo1234' + salt 'pc_salt')
INSERT OR IGNORE INTO users (id, clinic_id, email, password_hash, name, role) VALUES
  (1, 1, 'demo@clinic.com', 'd8a4e8923c509a0dfc245a2bad42ae1a54641097eed83fc1491bd5be8c02bebd', '문석준', 'owner'),
  (2, NULL, 'admin@patientconnect.kr', '2a06bddddd0838ff9b99cd564c783f697e7fcc8292467900b4250a72fac27123', '운영자', 'admin');

-- 진료 과목
INSERT OR IGNORE INTO treatments (id, name, slug, sort_order) VALUES
  (1, '임플란트', 'implant', 1),
  (2, '인비절라인·교정', 'ortho', 2),
  (3, '라미네이트', 'laminate', 3),
  (4, '충치·신경치료', 'endo', 4),
  (5, '잇몸치료', 'perio', 5),
  (6, '소아치과', 'pedo', 6),
  (7, '검진·스케일링', 'checkup', 7);
