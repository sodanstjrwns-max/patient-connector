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
- 자료함의 **이미지 목업 8개 넣기** → 목록/주의문 확인 → 확인 체크 → 추가 순서입니다. 조회만으로 데이터를 쓰거나 모든 병원에 일괄 배포하지 않습니다.
- 인증된 `POST /api/materials/examples`에 `{ "confirmed": true }`를 전달하면 현재 병원에만 예시를 삽입합니다. 요청에 임의의 hospital_id를 넣어도 반영하지 않습니다.
- `0002_material_examples.sql`은 materials.example_key와 병원+키 고유 인덱스를 추가합니다. D1 원자적 batch 및 충돌 시 무시로 동시 클릭·응답 유실 재시도 중복을 막습니다. 수정한 내용, 숨긴 예시, 기존 자료는 덮어쓰지 않습니다.
- 모든 예시는 **검토용 설명 초안**입니다. 실제 환자 사진, 임의 진료비, 의료진 검토 완료 주장을 넣지 않았습니다. 카드/편집기/발송 화면/환자 안내장에 예시 표시를 유지합니다. `is_example`은 서버가 provenance를 판단하고 발송 스냅샷에도 포함합니다.
- 예시 추가는 환자 전송이 아닙니다. 의료진이 병원 진료 기준과 실제 환자 상태에 맞게 검토한 후 사용해야 합니다.

## 이미지·영상 중심 자료함

- 자료의 본체는 이미지/영상입니다. 카드에서 실제 미디어 썸네일을 표시하고 클릭하면 큰 설명 화면을 엽니다. 본문은 선택 입력이며, 미디어가 있으면 보충 설명으로 접어 둡니다. 기존 텍스트/비용표 자료는 호환성을 위해 유지합니다.
- 1200×750 PNG 이미지 목업 8개를 `public/static/mockups/`에 포함했습니다. 모든 이미지 안에 **설명용 목업·실제 임상자료 아님·의료진 검토 전**을 표시합니다.
- 로그인 없는 공개 목업 갤러리: `/static/mockups/index.html`. 운영 병원 데이터와 연결되지 않은 정적 미리보기입니다.
- 샌드박스 목업 URL: https://3000-inm1c6uo4zqtact2e0j9v-8f57ffe2.sandbox.novita.ai/static/mockups/index.html
- 자료함의 **이미지 목업 8개 넣기**로 예시를 추가합니다. 기존 텍스트 예시는 **기존 예시에 이미지 채우기**를 명시적으로 실행하면 이미지가 없는 활성 예시에만 파일을 연결합니다. 기존 본문·제목·업로드 미디어 및 삭제한 예시는 덮어쓰지 않습니다.
- 공개 목업은 `/a/examples/<known-name>.png`의 정확한 허용 목록으로 정적 파일에 연결합니다. 병원 업로드 자료는 이 예외에 포함하지 않으며 기존 병원/안내장 토큰 권한을 확인합니다.
- 업로드: JPG/PNG/WebP 이미지 5MB, MP4/WebM 영상 25MB. 기존 `/api/materials/:id/images` 엔드포인트 및 `images_json`을 유지하고 참조에 `media_type`을 기록합니다. 비포애프터는 이미지 2장 전용입니다.
- 파일 크기·MIME·시그니처를 검사합니다. 영상 Range 요청에는 206/Content-Range를 반환하고 잘못된 범위는 416으로 거절합니다. 비공개 업로드 응답은 `private, no-store`입니다.
- 설명 화면 및 환자 안내장에서 영상 재생을 지원합니다. 자동재생하지 않습니다. 실제 재생 회귀 검사는 ffmpeg로 생성한 무음 WebM 테스트 영상으로 수행했습니다.
- 빌드 플러그인의 `emptyOutDir: true`로 이전 저장소의 정적 파일이 dist에 잔존하지 않도록 했습니다. Wrangler 미리보기 실행 중 재빌드하면 파일 감시기가 잠깐 비어 있는 `_routes.json`을 읽을 수 있으므로, 미리보기를 중지 → 빌드 → PM2 재시작 순서로 진행합니다.

### 목업 출처·재생성

도식과 한국어 레이아웃은 코드로 제작한 단순화된 목업입니다. 일부 참고 사진/구조 그림은 image_search의 CC/PD 필터 결과 중 다음 두 이미지에서만 가져왔습니다. 원본 이미지도 `reference-*.jpg`로 보관합니다.

- 모델 사진: https://sspark.genspark.ai/i/EyMYBryePyDzkrRt?width=2560 · 원본 안내 https://www.rawpixel.com/search/dental%20implant
- 치아 구조 그림: https://sspark.genspark.ai/i/e6J2600nB0KDEGhX?width=2560 · 원본 안내 https://www.rawpixel.com/search/dental%20design
- 실제 환자 비포애프터, 임의의 치료 결과, 의료진 검토 완료 자료로 사용하지 않습니다. 보충 이미지의 출처를 해당 목업/갤러리에 표시했습니다.
- `npm run mockups:render`는 Playwright와 로컬 Noto Sans CJK KR 폰트로 8개 PNG를 재생성합니다. 유료 AI 이미지 생성 도구를 사용하지 않았습니다. 이미 발송된 안내장과의 호환을 위해 배포 후 이미지 내용을 바꿀 때는 새 파일명/버전 키를 사용하세요.

## 자료별 필기 및 영상 장면 캡처

- 큰 설명 화면의 이미지/영상마다 보기·스크롤(영상은 재생·이동), 펜, 형광펜, 지우개, 색상, 굵기, 실행취소/다시하기, 전체 지우기, PNG 내려받기, 필기 저장 도구를 제공합니다.
- 마우스·터치·펜의 Pointer Events 입력을 받으며 복수 손가락의 동시 획은 무시합니다. 필기 모드에서만 터치 스크롤을 막습니다. 압력 감응/실물 Apple Pencil·Safari 검증은 별도입니다.
- 원본 비율을 유지한 별도 캔버스에 정규화 좌표(0~1)로 그립니다. 원본 파일은 수정하지 않습니다. 여러 첨부 파일과 다른 자료의 필기는 분리합니다.
- 병원별·자료별·원본 미디어 키별로 현재 필기를 저장합니다. 개인 환자 기록이 아닌 병원 공용 자료 필기입니다. 다음 설명에 불필요한 필기가 남지 않았는지 확인하고 필요하면 지워주세요.
- 영상은 일시정지한 장면에 필기합니다. 재생 중 또는 다른 시점에서는 기존 필기 레이어를 숨깁니다. 현재 영상당 하나의 장면 필기를 저장하며, 다른 장면에 쓰려면 기존 필기 교체를 확인합니다. 이미 발송한 장면 캡처는 바뀌지 않습니다.
- 명시적 저장 및 설명 화면의 이전/다음 자료 이동·닫기 시 저장합니다. 실패/충돌하면 화면 이동을 멈추고 입력을 보존합니다. 탭 종료/새로고침은 미저장 경고만 제공하며 완전한 오프라인 영속 저장은 아닙니다.
- `GET/PUT /api/materials/:id/annotations`: 현재 병원 소유의 활성 자료와 연결된 미디어만 허용. PUT은 media_key, version, write_key, strokes, image_png, 영상일 때 video_time을 받습니다.
- `0003_material_annotations.sql`: material_annotations 테이블. 벡터 획과 버전은 D1, 원본/영상 프레임+필기를 합친 PNG는 R2에 별도 저장합니다. PNG 최대 2MB/1600px, 300획/12,000점, 벡터 JSON 250KB 상한을 검사합니다.
- write_key로 응답 유실 재시도를 처리하고 version으로 다른 탭의 덮어쓰기를 막습니다. 지우기도 버전을 올려 삭제된 필기의 잘못된 복원을 방지합니다.
- 설명 끝·보내기는 현재 설명한 자료 목록을 전송 화면으로 가져옵니다. 보내기의 **이 자료에 저장된 필기 포함**을 선택하면 `/api/dispatches`에 include_annotations=true를 보냅니다. 서버는 실제 저장된 필기만 스냅샷에 포함하고 클라이언트의 임의 파일 참조를 신뢰하지 않습니다. 미선택 시 원본만 발행합니다.
- 환자는 필기한 이미지와 원본 보기, 또는 원본 영상과 시각이 표시된 필기 캡처를 봅니다. 이미 보낸 PNG는 불변 키를 참조하므로 나중에 수정/지우기를 해도 유지됩니다. 미사용 R2 필기 파일의 보존·정리는 후속 과제입니다.
- **공개 필기 체험**: `/static/mockups/annotate.html?file=implant` (orthodontics/prosthetics/endodontics/caries/periodontal/pulp/cracked-tooth 선택 가능). 실제 필기 도구를 사용하지만 병원 서버 저장/환자 전송 없이 PNG 다운로드만 제공합니다.

## 운영 상태와 화면

- 운영 주소: https://patient-connect.pages.dev
- `/app`: 병원 콘솔(허브 SSO 로그인 필요), 자료함·설명하기·보내기·발송내역·설정.
- `/g/:token`: 환자 안내장. `/optout/:token`: 병원별 수신거부.
- `/privacy`, `/terms`, `/legal-guide`: 정책·병원 안내 문구.
- API: `/api/materials` GET/POST, `/api/materials/:id` PUT/DELETE, `/api/dispatches` GET/POST, `/api/g/:token` GET. 발송은 `channel=link|alimtalk`, 자료 유형은 `kind`, 진료 항목은 `category`입니다.
- **유형·세부 분류·예시 추가는 로컬 구현·검증 상태이며 운영 미배포, GitHub 미푸시입니다.** 운영에서는 코드 반영 전에 `0002_material_examples.sql`, `0003_material_annotations.sql`을 포함한 마이그레이션을 적용해야 합니다. 필기 기능도 현재 미리보기 검증 상태이며 운영 미배포입니다. 실제 알림톡을 발송하지 않았습니다. 알림톡 사용에는 유효한 키·채널·승인 템플릿 설정이 필요합니다.

## 데이터

D1 `patient-connect-production`: hospitals, materials, material_annotations, dispatches, views, optouts, hub_profile_cache. R2 `patient-connect-assets` (`MEDIA`): 병원 이미지/영상. 공개 목업만 배포 정적 파일로 제공하며 실제 업로드는 R2에 저장합니다. 발송 시 선택 자료 스냅샷을 `dispatches.materials_json`에 저장하므로 이후 자료 수정이 이미 보낸 안내장을 변경하지 않습니다.

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
npm run test:media # ffmpeg 필요, 무음 테스트 영상을 로컬 생성
npm run test:annotations
```

검사는 `http://localhost:3000`에만 연결하며 공개 개발용 세션 서명키를 사용하는 로컬 환경을 전제로 합니다. 합성 병원 ID 900001/900002, 900011/900012 및 900021/900041을 생성·정리합니다. 운영 자격증명이나 실제 허브/메시지 API를 호출하지 않습니다.

총 134개 API/브라우저 검사 통과: 기존 분류 30개, 세부 분류·예시 32개, 이미지·영상 32개, 필기 40개. 필기 검사에는 형광펜 투명도·지우개·전체 지우기 복구·자료/첨부별 분리·새로고침 복원·응답 유실·충돌·영상 시점 캡처·전송 분리·터치 입력이 포함됩니다. 미디어 검사는 목업 파일 8개 로딩, 기존 예시 업그레이드, 업로드 보존, 영상 권한·Range·재생, 환자 안내장 및 공개 갤러리를 포함합니다. 신규 질환 유형 저장, 기존 주의사항 보존, 병원별 격리, 복합 필터, 등록·수정·재분류, 안내장 스냅샷 보존, 모바일 선택과 편집, 예시 확인·삽입·재시도·동시성·기존 내용 보존·예시 표시를 검증했습니다. 결과·스크린샷은 Git 제외 `.test-results/`에 보관합니다.

## 다음 단계

운영 반영 전 GitHub 변경을 다시 확인하고 합의된 기준에 변경을 반영해야 합니다. 실제 허브 SSO 및 SOLAPI 운영 발송 검증은 이번 로컬 검사에 포함하지 않았습니다. 기존 자료의 질환설명 재분류는 내용 확인 후 병원에서 선택적으로 수행합니다.
