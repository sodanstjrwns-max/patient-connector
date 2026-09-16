# Patient Connect

환자 등록 없이 병원의 자료를 함께 보고, 선택한 자료를 안내장 링크 또는 SOLAPI 알림톡으로 전달하는 Hono + Cloudflare Pages 앱입니다. 기준 GitHub: https://github.com/sodanstjrwns-max/patient-connector (가져온 기준 `5abc7ad`).

## 자료 유형 개편 — 2026-09-16

- 자료함: **전체 / 진료설명 / 질환설명 / 비용설명 / 비포애프터**, 유형별 개수 표시.
- `kind`: `explain`, `disease`, `cost`, `before_after`. 기존 `notice`도 서버에서 계속 지원합니다.
- 기존 설명은 진료설명으로 표시하고, 기존 주의사항은 진료설명 필터에 포함합니다. 원본 `notice` 값과 발송 스냅샷은 일괄 변경하지 않습니다.
- 제목으로 질환 여부를 추측해 자동 재분류하지 않습니다. 필요한 기존 자료만 편집 화면에서 질환설명으로 지정합니다.
- 임플란트·교정 등의 `category`는 별도 진료 항목 필터로 유지합니다. 유형 + 진료 항목 + 검색어를 함께 적용할 수 있습니다.
- 등록 시 현재 선택 유형/진료 항목이 기본값입니다. 편집·설명하기·보내기·환자 안내장에서도 새 이름을 표시합니다.
- 질환설명 저장을 API에서 허용하며 DB 스키마 변경은 필요하지 않습니다.
- 유형 추가 외 허브 SSO, SOLAPI, 수신거부, 병원별 데이터 권한 및 비용표·비포애프터 처리 흐름은 유지합니다.

## 치과 세부 분류와 예시자료

- 진료설명: 임플란트, 치아교정, 보철치료, 충치치료, 신경치료, 잇몸치료, 사랑니·발치, 소아치과, 예방·검진, 턱관절치료.
- 질환설명: 충치, 잇몸질환, 치수·치근단 질환, 치아균열·파절, 부정교합, 사랑니·매복치, 치아상실, 턱관절질환, 치아마모·시린이, 구강점막질환.
- 비용설명에는 일반 진료 분류, 비포애프터에는 해당 치료 분류를 제공합니다. 유형을 바꾸면 다른 유형의 필터를 초기화합니다.
- 자료가 0개인 분류도 표시하며, 병원이 저장한 사용자 분류는 삭제하지 않고 함께 표시합니다. 편집기에는 유형별 드롭다운과 직접 입력을 제공합니다.
- `src/lib/material-library.ts`가 분류·예시의 단일 원본입니다. 인증된 `GET /api/material-library`가 분류·예시 목록·현재 병원의 추가 개수를 제공합니다.
- **예시 8개**: 진료설명 4개(임플란트 과정, 치아교정 순서, 보철치료, 신경치료), 질환설명 4개(충치, 잇몸질환, 치수·치근단 질환, 치아균열).
- 자료함의 **예시자료 8개 넣기** → 목록/주의문 확인 → 확인 체크 → 추가 순서입니다. 조회만으로 데이터를 쓰거나 모든 병원에 일괄 배포하지 않습니다.
- 인증된 `POST /api/materials/examples`에 `{ "confirmed": true }`를 전달하면 현재 병원에만 예시를 삽입합니다. 요청에 임의의 hospital_id를 넣어도 반영하지 않습니다.
- `0002_material_examples.sql`은 materials.example_key와 병원+키 고유 인덱스를 추가합니다. D1 원자적 batch 및 충돌 시 무시로 동시 클릭·응답 유실 재시도 중복을 막습니다. 수정한 내용, 숨긴 예시, 기존 자료는 덮어쓰지 않습니다.
- 모든 예시는 **검토용 설명 초안**입니다. 실제 환자 사진, 임의 진료비, 의료진 검토 완료 주장을 넣지 않았습니다. 카드/편집기/발송 화면/환자 안내장에 예시 표시를 유지합니다. `is_example`은 서버가 provenance를 판단하고 발송 스냅샷에도 포함합니다.
- 예시 추가는 환자 전송이 아닙니다. 의료진이 병원 진료 기준과 실제 환자 상태에 맞게 검토한 후 사용해야 합니다.

## 운영 상태와 화면

- 운영 주소: https://patient-connect.pages.dev
- `/app`: 병원 콘솔(허브 SSO 로그인 필요), 자료함·설명하기·보내기·발송내역·설정.
- `/g/:token`: 환자 안내장. `/optout/:token`: 병원별 수신거부.
- `/privacy`, `/terms`, `/legal-guide`: 정책·병원 안내 문구.
- API: `/api/materials` GET/POST, `/api/materials/:id` PUT/DELETE, `/api/dispatches` GET/POST, `/api/g/:token` GET. 발송은 `channel=link|alimtalk`, 자료 유형은 `kind`, 진료 항목은 `category`입니다.
- **유형·세부 분류·예시 추가는 로컬 구현·검증 상태이며 운영 미배포, GitHub 미푸시입니다.** 운영에서는 코드 반영 전에 `0002_material_examples.sql`을 포함한 마이그레이션을 적용해야 합니다. 실제 알림톡을 발송하지 않았습니다. 알림톡 사용에는 유효한 키·채널·승인 템플릿 설정이 필요합니다.

## 데이터

D1 `patient-connect-production`: hospitals, materials, dispatches, views, optouts, hub_profile_cache. R2 `patient-connect-assets` (`MEDIA`): 병원 이미지. 발송 시 선택 자료 스냅샷을 `dispatches.materials_json`에 저장하므로 이후 자료 수정이 이미 보낸 안내장을 변경하지 않습니다.

SESSION_SECRET, PS_SSO_SECRET, PHONE_ENC_KEY, HUB_API_KEY, SOLAPI_API_KEY/SECRET 등의 실제 비밀값은 코드에 기록하지 않습니다. 로컬 검증은 별도 `.wrangler/category-tests` 상태와 합성 병원만 사용합니다. 외부 미리보기/운영의 시크릿 가드는 변경하지 않았습니다.

## 개발 및 검증

```bash
cd /home/user/webapp
npm ci
npm run typecheck
npm run build
npx wrangler d1 migrations apply patient-connect-production --local --persist-to .wrangler/category-tests
```

PM2로 `npx wrangler pages dev dist --local --persist-to .wrangler/category-tests --ip 0.0.0.0 --port 3000`을 실행한 뒤:

```bash
npx playwright install chromium
npm run test:categories
npm run test:library
```

검사는 `http://localhost:3000`에만 연결하며 공개 개발용 세션 서명키를 사용하는 로컬 환경을 전제로 합니다. 합성 병원 ID 900001/900002 및 900011/900012를 생성·정리합니다. 운영 자격증명이나 실제 허브/메시지 API를 호출하지 않습니다.

총 62개 API/브라우저 검사 통과: 기존 분류 검사 30개 및 세부 분류·예시 검사 32개. 신규 질환 유형 저장, 기존 주의사항 보존, 병원별 격리, 복합 필터, 등록·수정·재분류, 안내장 스냅샷 보존, 모바일 선택과 편집, 예시 확인·삽입·재시도·동시성·기존 내용 보존·예시 표시를 검증했습니다. 결과·스크린샷은 Git 제외 `.test-results/`에 보관합니다.

## 다음 단계

운영 반영 전 GitHub 변경을 다시 확인하고 합의된 기준에 변경을 반영해야 합니다. 실제 허브 SSO 및 SOLAPI 운영 발송 검증은 이번 로컬 검사에 포함하지 않았습니다. 기존 자료의 질환설명 재분류는 내용 확인 후 병원에서 선택적으로 수행합니다.
