-- 병원 브랜드(안내장·설명 화면 상단): 로고(R2 키), 대표색, 한 줄 소개. 기존 행은 NULL → 기본 스타일.
ALTER TABLE hospitals ADD COLUMN logo_key TEXT;
ALTER TABLE hospitals ADD COLUMN primary_color TEXT;
ALTER TABLE hospitals ADD COLUMN tagline TEXT;
