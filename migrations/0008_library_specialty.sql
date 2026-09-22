-- 진료과 매칭: 라이브러리 자료는 진료과(specialty)를 가지며, 병원의 진료과(허브 프로필 clinic_type 사본)와 맞는 자료만 자료함에 들어간다.
ALTER TABLE library_materials ADD COLUMN specialty TEXT NOT NULL DEFAULT '치과';
ALTER TABLE hospitals ADD COLUMN clinic_type TEXT;          -- 허브 프로필 basic.clinic_type 사본(SSO 로그인·동기화 때 갱신)
