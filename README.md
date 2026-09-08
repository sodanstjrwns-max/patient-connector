# 페이션트 커넥트 · Care Workspace

병원의 설명자료, 상담 준비·판서, 환자 안내장, 열람 확인과 후속 응대를 연결하는 상담 도구입니다. 치과·피부미용·성형·정형재활·안과·한방 등 여러 진료 분야를 지원합니다.

## 현재 상태 — 2026-09-08

- 운영: https://patient-connect.pages.dev
- 상담 준비: https://patient-connect.pages.dev/prepare
- 후속 응대함: https://patient-connect.pages.dev/prepare?tab=followup
- 현재 배포: https://3b093dc6.patient-connect.pages.dev
- 배포 코드 커밋: `7d5c301`, 자산 버전: `flow-20260908-1`.
- 사용자 소유 Cloudflare 계정의 기존 Pages 프로젝트 `patient-connect`, 브랜치 `main`에 두 번째 업그레이드 배포 완료.
- D1 마이그레이션 `0001`~`0006` 적용 완료.
- 저장된 검증 결과: TypeScript 검사·빌드 성공, 로컬 자동 검사 **130개 통과**(기존 API 46 + 기존 브라우저 31 + 워크플로 API 31 + 워크플로 브라우저 22), 운영 워크플로 점검 **17개 통과**. 운영 임시 검증 레코드 제거 완료.
- 마무리 시 주요 운영 화면 3곳의 HTTP 200·현재 버전과 과거 배포 8개의 `/api/assets` HTTP 404를 다시 확인했습니다. 문서 갱신만으로 재배포하지 않았습니다.

## 디자인 및 주요 기능

포레스트 그린(`#285847`)과 따뜻한 종이색을 사용하는 반응형 Care Workspace 디자인입니다. 라이브러리, 상담 준비, 스튜디오, 관리, 환자 안내장을 연결했습니다. 모바일 사이드바/메모 드로어, 키보드 모달 포커스, 본문 건너뛰기, reduced-motion을 지원합니다.

### 설명자료와 병원 관리

- 공개 자료 및 병원 소유 자료, 진료과·치료·형식·검색 필터, 정렬, 카드/목록 보기, D1 즐겨찾기.
- 이미지·영상·치료 과정·질환 진행·수가표·FAQ·비교자료의 구조화된 편집기.
- 업로드, 공개 자료 복제, 수정, 숨김/복원, 삭제 및 운영자 관리.
- 병원 프로필·계정 비밀번호 변경, 병원별 데이터 통계.
- 동의 확인을 요구하는 케이스 등록, 병원별 접근 분리, 전후 비교 슬라이더.

### 상담 준비·세트·자동저장

- **열람과 선택을 분리**합니다. 자료를 열었다고 상담이나 환자 전송에 자동 포함하지 않습니다.
- 선택 자료 순서 변경(드래그 및 위/아래 버튼), 삭제, 단계별 전송 포함 체크.
- 병원별 상담 세트 저장·적용·이름/설명 변경·삭제. 세트에는 정렬된 자료/단계 ID만 저장하며 환자 정보·메모·판서를 복사하지 않습니다.
- 서버 자동저장, 최근 상담 이어하기, 현재 입력 저장 후 새 환자 시작.
- `client_key`/`write_key`로 응답 유실 후 재시도의 중복 저장을 방지하고 `version`으로 다른 탭 변경 덮어쓰기를 차단합니다.
- 연결 끊김 시 현재 페이지 메모리에 입력 유지, 재연결 저장 재시도, 충돌 시 다시 불러오기/별도 초안 보존. 오프라인 상태에서 탭을 닫으면 미저장 입력은 보장되지 않습니다.

### 상담 스튜디오

- 명시적으로 선택한 단계에 판서와 메모를 작성하고 선택 순서대로 설명합니다.
- 펜·형광펜·화살표·동그라미·텍스트·지우개·실행취소·다시 실행, 확대/이동·터치 핀치.
- `asset_id + sub_index`별 판서/메모, 고정 1200×800 좌표계와 3:2 화면. 판서는 R2 PNG로 저장합니다.
- 환자용 메모, 상담 전체 내부 메모, 단계별 내부 메모를 분리합니다. 직원용 설명 가이드는 내부 전용입니다.
- 비용표·FAQ·영상은 읽기/재생 전용이며 판서는 이미지 계열에서 지원합니다.
- 저장 상태·이탈 경고·버전 충돌 보호, 좌우 이동 및 Ctrl/Cmd+S/Z 단축키.

### 환자 안내·공유·후속 응대

- 전송 직전 서버 생성 미리보기에서 실제 선택 자료·판서·환자용 메모·주의사항·일정을 확인하고 승인 후 발행합니다.
- 발행 시 `share_snapshot`을 고정합니다. 이후 초안 자동저장이 이미 보낸 안내장을 바꾸지 않습니다. 변경 내용을 전송하려면 재확인 후 다시 발행합니다.
- 내부 메모, 전송 제외 자료, 선택하지 않은 형제 단계의 내용/미디어 URL은 서버 응답에서 제거합니다. 비교자료도 공유 API에서 제외합니다.
- 공유 기간 1/7/30/90일, 재발급 시 이전 링크 폐기, 즉시 공유 종료.
- 모바일 안내장, 병원 연락처·응급안내, 링크 복사·Web Share API.
- 열람 이벤트는 같은 브라우저 세션의 30분 내 반복 및 소유 병원의 미리보기를 제외합니다. 환자 신원이나 고유 환자 수 지표는 아닙니다.
- 환자의 이해 확인·추가 설명 필요·일정 문의와 최대 500자 메시지를 수집하고 병원별 후속 응대함에서 처리합니다.
- 피드백은 치료 동의·예약 확정·응급 대응 채널이 아닙니다. 토큰 링크 보유자는 열람할 수 있으며 환자 본인 인증은 미구현입니다.

### 임상 설명 초안·검토 관리

- 임플란트 3개, 근관치료 3개, 잇몸질환 4개: 총 10개의 한국어 FAQ 교육 초안을 추가했습니다.
- ADA MouthHealthy 관련 페이지를 참고한 초안으로 공식 번역이나 의료진 검토 완료 자료가 아닙니다.
- 모두 **숨김·미검토·사용권 미확인**으로 등록했습니다. 기존 공개 자료 40개는 유지하고 초안을 자동 공개하지 않았습니다.
- 출처 URL/메모, 사용권, 검토 상태·검토자·시각, 직원용 가이드를 관리합니다. 검토 완료에는 소유자/관리자의 명시적 확인과 사용권 확인이 필요하며 내용/출처 변경 시 기존 검토를 무효화합니다.
- 실제 임상 사진·영상의 신규 확보와 의료진의 실제 검토는 별도입니다. 기존 `/ph` 이미지는 설명용 예시입니다.

## 간단 사용법

1. `/login`에서 로그인하거나 병원 계정을 만듭니다.
2. 라이브러리에서 **상담에 담기**로 자료를 선택합니다.
3. `/prepare`에서 순서를 정리하거나 상담 세트를 적용하고 환자 표시명·일정·내부 메모를 입력합니다.
4. 스튜디오에서 선택 단계에 설명·판서·환자용/내부 메모를 작성하고 자동저장 상태를 확인합니다.
5. **환자에게 전송**으로 준비 화면에 돌아가 전송 대상과 안내장 미리보기를 확인·승인하고 링크를 발급합니다.
6. 후속 응대함에서 질문을 처리합니다. 최근 상담에서 이어가거나 **새 환자**로 이전 환자 문맥을 비웁니다.

## 화면 및 API

| 화면 | 용도 |
| --- | --- |
| `/`, `/?view=favorites` | 라이브러리·즐겨찾기 |
| `/prepare?session=:id` | 상담 준비·복원 |
| `/prepare?new=1` | 새 환자 준비 |
| `/prepare?tab=sets` | 병원 상담 세트 |
| `/prepare?tab=followup` | 후속 응대함 |
| `/prepare?session=:id&review=1` | 전송 전 확인 |
| `/consult/:assetId?session=:id` | 상담 스튜디오 |
| `/manage?tab=library` | 공개 자료 복제 |
| `/manage?tab=sessions` | 상담 이력·공유 관리 |
| `/manage?tab=settings` | 병원·계정 설정 |
| `/manage`, `/manage?new=1` | 자료 관리·새 자료 |
| `/cases`, `/admin` | 케이스·운영자 콘솔 |
| `/login?mode=signup`, `/p/:token` | 가입·환자 안내장 |
| `/journey`, `/consent`, `/market` | 준비 중 화면 |

| API | 메서드·역할 |
| --- | --- |
| `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/password` | POST 인증·계정 보안 |
| `/api/auth/me`, `/api/clinic` | GET 사용자, GET/PUT 병원 |
| `/api/treatments?specialty=` | GET 진료 항목 |
| `/api/assets`, `/api/assets/:id` | GET/POST 목록·생성, GET/PUT/DELETE 상세·수정·삭제 |
| `/api/assets/:id/duplicate`, `/api/assets/:id/favorite`, `/api/assets/:id/use` | POST 복제·즐겨찾기·사용 |
| `/api/upload`, `/files/*?share=` | POST multipart, GET 권한 확인 R2 |
| `/api/cases`, `/api/cases/:id` | GET/POST 목록·등록, DELETE 삭제 |
| `/api/sessions`, `/api/sessions/:id` | GET/POST 목록·저장, GET/DELETE 개별 상담 |
| `/api/sessions/:id/preview`, `/api/sessions/:id/share` | GET 미리보기, POST 발행·재발급, DELETE 회수 |
| `/api/sets`, `/api/sets/:id` | GET/POST 목록·생성, PUT/DELETE 수정·삭제 |
| `/api/share/:token`, `/api/share/:token/view` | GET 안내장, POST 열람 |
| `/api/share/:token/feedback` | POST 환자 피드백 |
| `/api/feedback`, `/api/feedback/:id` | GET 병원별 피드백, PUT 처리 상태 |
| `/api/dashboard`, `/api/admin/stats`, `/ph?t=&s=&v=` | GET 통계·설명용 SVG |

자료 목록 쿼리: `specialty`, `treatment`, `category`, `type`, `q`, `sort=recommended|new|popular`, `favorite=1`, `manage=1`. `manage=1`은 권한 있는 관리 화면에서 숨긴 자료까지 표시합니다.

## 구조·저장소·제한

- Hono + TypeScript, Vite Cloudflare Pages 빌드, 일반 JavaScript + 자체 CSS. Axios 자체 호스팅, Pretendard/Font Awesome CDN. Tailwind 런타임 미사용.
- D1 `webapp-production`: clinics, users, auth_sessions, treatments, assets, cases, consult_sessions, consult_sets, patient_feedback, share_views, favorites, uploads, auth_limits.
- 미사용 확장 테이블: journey_timelines, consent_records.
- R2 `webapp-bucket`: 업로드 및 단계별 판서 PNG. 런타임 파일시스템이나 메모리에 영속 저장하지 않습니다.
- 상담 slides: `{asset_id, sub_index, asset:서버스냅샷, note, internal_note, include_in_share, drawing_url, aspect}` 배열.
- 초안/발행: status, internal_note, client_key, last_write_key, version, share_snapshot, share_token, share_expires_at, share_revoked_at, share_count.
- 세트: 병원/사용자, 제목/설명, 정렬된 `{asset_id,sub_index}` 목록, 버전.
- 피드백: 상담/병원, 해시된 방문자 식별자, 종류(`understood|question|schedule`), 메시지, 상태(`open|resolved`), 처리자/시각. 상담+방문자+종류별 중복 갱신.
- 자료 검토: staff_note, source_url, source_note, usage_rights, review_status, reviewed_at, reviewed_by, updated_at.
- 파일당 10MB, 자료 미디어/단계 각 12개, 수가 항목 30개, 상담 40장, 판서 base64 입력 700KB 이하, 상담 JSON 900KB 이하.
- 자료 조회 최대 500개, 상담 이력 최대 200개. 대규모 페이지네이션은 후속 과제입니다.
- 환자 내용을 localStorage에 저장하지 않습니다. sessionStorage에는 사용자별 초안 ID와 익명 열람/피드백 식별자만 보관합니다.
- 기존 판서 PNG는 보존합니다. 과거 좌표 메타데이터가 없으면 정밀 정렬 보정에는 한계가 있습니다.

## 보안 및 계정

- 병원별 자료·상담·세트·피드백 권한 검사, 클라이언트 제공 자료 스냅샷 불신, 내부 메모 서버 필터링.
- 비공개 R2는 소유 병원/운영자 또는 정당한 자료 참조·유효한 공유에 포함된 파일만 허용. 메모 속 임의 URL은 파일 권한을 부여하지 않습니다.
- JPG/PNG/WebP/MP4/WebM 크기·MIME·시그니처 검사, HTML/SVG 업로드 차단, 권한 검사 후 byte-range 처리 및 잘못된 범위 416 응답.
- PBKDF2-SHA256, 무작위 salt, 100,000회 반복. 정상 레거시 비밀번호는 성공한 로그인 시 자동 전환합니다.
- `pc_session`: Secure 항상 설정, HttpOnly, SameSite=Lax, 30일. 로그아웃/비밀번호 변경 시 서버 세션 폐기.
- D1 요청 제한, Origin/Fetch Metadata·JSON 검증, CSP 등 보안 헤더, 이스케이프, 비공개 응답 `private, no-store`.
- 서비스워커는 성공한 같은 출처 `/static/` GET만 캐시합니다. 환자 데이터/API/R2는 캐시하지 않습니다.
- 공개된 과거 기본 비밀번호는 차단했습니다. 운영 계정 2개의 ID·이메일·데이터를 보존하고 강력한 새 비밀번호로 교체해 사용자 전용 파일로 전달했습니다. 두 번째 업그레이드에서 다시 변경하지 않았습니다.
- 새 비밀번호는 10~128자. 로컬 복구는 `PC_NEW_PASSWORD` 환경변수를 안전하게 설정한 뒤 `node scripts/reset-password.mjs --email=계정이메일 --local` 실행. 비밀번호를 출력하지 않으며 원격 실행은 금지됩니다.
- 의료광고·개인정보 요건 전체의 준수 또는 보안 인증을 보장하는 것은 아닙니다.

## 개발 및 테스트

작업 경로 `/home/user/webapp`, 브랜치 `main`. 로컬 D1/R2와 운영 데이터는 별개입니다.

```bash
cd /home/user/webapp
npm install
npm run db:migrate:local
fuser -k 3000/tcp 2>/dev/null || true
npm run build
pm2 start ecosystem.config.cjs
curl http://localhost:3000
# 최초 Chromium 설치
npx playwright install chromium
# 로컬 합성 QA 데이터 정리 후 전체 검증
node scripts/cleanup-test-data.mjs
npm run test:all
node scripts/cleanup-test-data.mjs
```

`test:all`은 타입 검사, 기존 API·브라우저, 워크플로 API·브라우저를 실행합니다. 테스트는 localhost/127.0.0.1 전용입니다. cleanup은 합성 QA 계정/관련 레코드 및 로컬 요청 제한 카운터를 정리하며 운영용이 아닙니다.

기존 DB에 시드를 반복 적용하지 마세요. 신규 설치 시에만 seed.sql, seed_assets.sql, seed_specialties.sql을 검토합니다. 공개 데모 비밀번호는 차단됩니다. `.test-results/`, `.env*`, `.dev.vars*`, `.wrangler`, 백업·로그는 Git에서 제외합니다. 검사 결과에는 임시 인증정보가 포함될 수 있으므로 공개하지 않습니다.

## 운영 배포·보존 기록

1. 사용자 승인에 따라 기존 BYOK Pages 프로젝트와 D1/R2를 유지했습니다. 변경 전 D1 SQL을 내보내 별도 SQLite 복원·무결성 검사 후 보관했습니다.
2. `0003`: 보안·공유 수명·버전·레거시 스냅샷 정리. 기존 공유에 전환 시점부터 30일 유효기간 부여. `0004`: 공개 데모 계정의 기존 세션 폐기(계정/데이터 유지).
3. `0005`: 초안·발행 스냅샷·세트·피드백·검토 관리. `0006`: 숨긴 교육 초안 10개.
4. 운영 최종 확인 수량: 병원 1, 사용자 2, 자료 50(노출 40·숨긴 초안 10), 케이스 7, 상담 1, 세트 0, 피드백 0. 기존 상담은 변경 전부터 자료가 없는 기록이며 삭제 대신 안내 문구로 표시합니다.
5. 로그인, 쿠키, 권한 분리, 업로드, 저장·복구·재시도, 전송 필터링, 발행 스냅샷, 피드백, 모바일 화면 등을 확인하고 임시 운영 데이터를 제거했습니다.
6. 최신 변경 전 DB 백업: `.test-results/release/patient-connect-before-flow-2026-09-08.tar.gz`. SQL과 계정 파일은 보호된 `.test-results/release/`에 두며 Git에 넣지 않습니다. 이 아카이브는 DB 백업이지 R2 전체 객체 백업이 아닙니다.
7. 구버전 API 노출을 막기 위해 과거 배포 8개를 삭제했습니다. 삭제 전 Git bundle·배포 메타데이터를 보관했고 전파 후 모두 404를 확인했습니다. 목록은 `.test-results/retired-deployments.json`입니다. 이전 배포는 현재 서비스 링크가 아닙니다.
8. 롤백은 계정 해시·DB 스키마·환자 발행 스냅샷 호환성을 함께 검토해야 합니다. 문서만 변경한 경우 운영 재배포는 불필요합니다.

## 미구현 범위 및 권장 다음 단계

- 10개 초안의 실제 의료진 검토와 임상 사진·영상의 저작권/환자 동의 확보 후 공개 여부 결정.
- iPad/Apple Pencil/Safari 실기기, 부하 테스트, 독립적인 보안·법무 검토.
- 이메일 인증/비밀번호 찾기, 다중 직원 초대·세분화된 역할, 환자 본인 확인.
- R2 미사용 파일 정리와 의료 데이터 보존·완전 삭제 정책. 상담/자료 삭제가 관련 R2 객체를 자동 영구 삭제하지는 않습니다.
- 대량 페이지네이션, 세부 통계·감사 로그, 카카오 SDK 직접 연동, 다국어, 치료 여정·전자 동의·마켓.
- 서버 자동저장은 구현했습니다. 완전한 오프라인 영속 저장, 의료정보 시스템 연동은 미구현입니다.
