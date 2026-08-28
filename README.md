# 페이션트 커넥트 (Patient Connect)

## 프로젝트 개요
- **이름**: 페이션트 커넥트
- **목표**: 치과가 환자에게 치료를 설명할 때 쓰는 상담 도구 + 모든 치과가 영원히 무료로 쓰는 공개 설명자료 라이브러리
- **대상**: 원장·상담실장(태블릿/데스크톱, 환자 옆에서 사용), 환자(공유 링크 열람), 운영자(공개 자료 관리)
- **디자인 컨셉**: 화이트라벨 — 로그인하면 병원 이름이 헤더에 크게 표시되어 "그 병원 전용 프로그램"처럼 보임. 상담 화면은 시네마 모드(다크), 라이브러리는 밝고 프리미엄.

## URL
- **개발 미리보기**: https://3000-inm1c6uo4zqtact2e0j9v-8f57ffe2.sandbox.novita.ai
- **데모 계정**: 병원 `demo@clinic.com` / `demo1234` · 운영자 `admin@patientconnect.kr` / `admin1234`

## 완료된 기능
1. **라이브러리 홈** (`/`) — 진료 탭 8종, 좌측 카테고리 7종, 카드 그리드(썸네일·배지·감수원장·공개/병원 라벨), 제목·태그 검색, 지연 로딩
2. **상담 화면** (`/consult/:id`) — 핵심 화면
   - 스테이지 6종: image(핀치줌), video(mp4/webm), compare(비포애프터 슬라이더+더블탭 토글), progression(1~4단계 슬라이더), cost(수가표+A4 출력), steps(치료 과정 순차 넘김), faq(카드)
   - 드로잉 레이어: 펜/형광펜/화살표/동그라미/텍스트/지우개/실행취소/전체 지우기, 색상 4종(빨강·파랑·노랑·흰색), pointer events(애플펜슬 압력 대응)
   - 그림은 슬라이드(자료×단계)별 유지, 세션 저장 시 PNG로 저장
   - 하단 필름스트립(같은 카테고리), 키보드 좌우/터치 이동
   - 우측 패널: 설명, 단계 목록, 주의사항 체크리스트, 수가표, 환자 표시명·메모
   - 상단: 상담 저장 / 환자에게 전송 / 전체화면
3. **환자 전송 페이지** (`/p/:token`) — 로그인 불필요, 병원 브랜드 히어로, 슬라이드+그린 그림 합성 표시, 주의사항 자동 첨부, 수가표, 병원 정보·전화·응급안내, 카카오톡 공유/링크 복사, 열람 기록
4. **비포·애프터 갤러리** (`/cases`) — 로그인 전용(의료광고 규정 준수, 공개 링크 제외), 마소너리 그리드, 호버/탭 전환, 진료 필터, 케이스 등록(치료기간·재료·원장·동의 여부)
5. **우리 병원 자료 관리** (`/manage`) — 드래그&드롭 다중 업로드(이미지·영상), 공개 자료 "복제해서 편집", 숨기기/삭제/편집(수가표 금액 편집 포함), 상담 이력(전송 링크·열람 여부·시각)
6. **운영자 콘솔** (`/admin`) — 가입 병원/세션/자료 통계, 자료별 사용·전송 횟수, 노출 순서 변경
7. **인증** — 병원 가입/로그인(30일 세션 쿠키), 공개 라이브러리는 비로그인 열람 가능
8. **PWA** — manifest + 서비스워커(정적 자원 캐시), 설치 가능
9. **시드 데이터** — 임플란트(과정 6단계·질환진행 4단계·주의사항 3·수가표·FAQ 3), 인비절라인(4단계·주의사항 3·수가표·FAQ 3), 라미네이트(4단계·주의사항 2·수가표·FAQ 2), 치주염 진행 4단계, 데모 케이스 3건. 실제 이미지 없는 항목은 `/ph` 동적 SVG 플레이스홀더.

## API 요약
| 경로 | 메서드 | 설명 | 인증 |
|---|---|---|---|
| `/api/auth/login·signup·logout·me` | POST/GET | 인증 | - |
| `/api/treatments` | GET | 진료 과목 | - |
| `/api/assets` | GET | 자료 목록(공개+내 병원), ?treatment=&category=&q= | 선택 |
| `/api/assets/:id` | GET/PUT/DELETE | 자료 상세(사용 횟수 집계)/수정/삭제 | GET 공개자료 무인증 |
| `/api/assets` | POST | 자료 생성(운영자는 is_public 가능) | 필요 |
| `/api/assets/:id/duplicate` | POST | 복제해서 편집 | 필요 |
| `/api/upload` | POST | R2 파일 업로드(100MB 제한) | 필요 |
| `/files/*` | GET | R2 파일 서빙 | - |
| `/api/cases` | GET/POST/DELETE | 비포애프터 케이스 | 필요 |
| `/api/sessions` | GET/POST | 상담 세션 목록/저장 | 필요 |
| `/api/sessions/:id/share` | POST | 공유 토큰 생성(전송 횟수 집계) | 필요 |
| `/api/share/:token` | GET | 환자 공개 데이터(compare 타입 제외, 열람 기록) | 불필요 |
| `/api/admin/stats` | GET | 운영 통계 | admin |
| `/ph` | GET | 플레이스홀더 SVG (?t=&s=&v=&dark=) | - |

## 데이터 아키텍처
- **저장소**: Cloudflare D1(SQLite) — clinics, users, auth_sessions, treatments, assets, cases, consult_sessions, share_views + 2단계 대비(journey_timelines, consent_records)
- **파일**: Cloudflare R2 — 업로드 이미지/영상 (`/files/*`로 서빙)
- **드로잉**: Canvas PNG dataURL을 consult_sessions.slides(JSON)에 저장

## 반드시 지킨 규칙
- 공개 라이브러리 비로그인 열람 가능 / 상담 저장·업로드·전송은 로그인 필요
- 모든 자료에 감수 원장 필드
- 비포·애프터는 로그인 병원 내부 전용, `/api/share`에서 compare 타입 필터링
- 무료 플랜 기본, 유료 안내 문구 없음
- 상담 화면 지연 로딩(lazy loading, 스켈레톤)

## 2단계 (DB·라우팅만 준비됨)
- 치료 여정 타임라인(`/journey`, journey_timelines 테이블), 진료 동의 서명(`/consent`, consent_records 테이블), 자료 공유 마켓(`/market`), 다국어

## 미구현 / 다음 단계 권장
- 카카오톡 공유는 시스템 공유 API 사용 중 → 카카오 SDK 키 연동 시 카톡 직접 공유 가능
- 수가표·steps 편집 UI 고도화(현재 prompt 기반 간이 편집)
- 관리자 공개 자료 등록 전용 폼(현재 API로 가능)
- 프로덕션 배포(Cloudflare Pages)

## 개발/실행
```bash
npm run build
npx wrangler d1 migrations apply webapp-production --local
npx wrangler d1 execute webapp-production --local --file=./seed.sql
npx wrangler d1 execute webapp-production --local --file=./seed_assets.sql
pm2 start ecosystem.config.cjs   # wrangler pages dev dist --d1 --r2 --local :3000
```

## 배포
- **플랫폼**: Cloudflare Pages (미배포, 샌드박스 개발 서버 운영 중)
- **기술 스택**: Hono + TypeScript + TailwindCSS(CDN) + D1 + R2 + PWA
- **최종 업데이트**: 2026-08-28
