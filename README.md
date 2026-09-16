# Patient Connect

환자 등록·환자별 대시보드 없이, 병원 자료함에서 이미지·영상을 함께 보고 필기한 뒤 선택 자료를 한 안내장으로 전달하는 Hono + Cloudflare Pages 앱입니다.

## 주소와 배포

- 운영: https://patient-connect.pages.dev
- 병원 콘솔: https://patient-connect.pages.dev/app (Patient Hub SSO)
- GitHub: https://github.com/sodanstjrwns-max/patient-connector
- 실제 GitHub 기준: `5abc7ad`. 변경 전 `origin/main`을 다시 fetch하여 원격 추가 변경이 없음을 확인했습니다. 로컬 개선은 GitHub에 아직 푸시하지 않았습니다.
- 기존 운영 배포: https://6fea281b.patient-connect.pages.dev (`4329ba6`, 2026-09-16).
- **상담 안전 업그레이드 운영 반영 완료 (2026-09-16)**: https://8e45c0c2.patient-connect.pages.dev, 소스 커밋 `e806091`, 자산 버전 `v20260916-safe-consult`. 마이그레이션 `0001`~`0004` 적용 완료.
- 배포 경로: 사용자 소유 Cloudflare Pages `patient-connect`, 브랜치 `main`. 기존 시크릿을 교체하지 않습니다.
- D1: `patient-connect-production`, binding `DB`, ID `a38fa276-fe4f-4397-b184-6c0180168064`.
- R2: `patient-connect-assets`, binding `MEDIA`.

## 사용 흐름

1. 자료함에서 진료설명·질환설명·비용설명·비포애프터를 찾거나 자주 쓰는 묶음을 선택합니다.
2. 썸네일 또는 설명하기 → 큰 화면을 엽니다.
3. **깨끗한 원본으로 새 설명 / 현재 설명 이어가기 / 기존 공용 필기를 복사해 새 설명** 중 하나를 선택합니다.
4. 이미지 또는 일시정지한 영상 장면에 펜·형광펜·지우개로 표시하고 저장합니다.
5. 설명 끝·보내기에서 순서를 확인합니다. 질환 → 치료 → 사례 → 비용 자동 정렬도 가능합니다.
6. 필요한 경우에만 **현재 설명의 필기 포함**을 체크합니다. 기본값은 원본만입니다.
7. 환자 화면과 같은 렌더러로 만든 최종 미리보기에서 자료·비용·필기·수신 대상·전송 권한을 확인합니다.
8. 확인란을 체크한 다음 안내장 링크를 만들거나, 설정이 완료된 경우 카카오 발송을 요청합니다.

## 구현된 기능

### 자료함·분류·묶음

- 전체 / 진료설명 / 질환설명 / 비용설명 / 비포애프터 4대 유형, 유형별 개수, 검색 및 치과 세부 분류 조합 필터.
- 기존 `notice`는 진료설명 필터에 포함하되 저장값과 기존 발송 스냅샷은 일괄 변경하지 않습니다.
- 진료 분류: 임플란트, 치아교정, 보철치료, 충치치료, 신경치료, 잇몸치료, 사랑니·발치, 소아치과, 예방·검진, 턱관절치료.
- 질환 분류: 충치, 잇몸질환, 치수·치근단 질환, 치아균열·파절, 부정교합, 사랑니·매복치, 치아상실, 턱관절질환, 치아마모·시린이, 구강점막질환.
- 사용자 분류 보존. 등록/수정기에서 유형별 드롭다운 및 직접 입력.
- 병원별 **자주 쓰는 설명 묶음**: 현재 선택과 순서 저장, 같은 이름 갱신, 적용, 삭제. 원본 자료 복제나 환자 개인화는 하지 않습니다. 삭제된 자료는 적용 시 제외하고 알립니다.
- 예시 8개: 진료설명 4개(임플란트·교정·보철·신경치료), 질환설명 4개(충치·잇몸질환·치수/치근단 질환·치아균열).
- 예시 추가는 병원별 명시적 확인 후 수행. `(hospital_id, example_key)` 고유 제약으로 중복·동시 추가를 방지합니다. 편집한 내용과 숨긴 예시는 덮어쓰지 않으며, 활성 예시의 빈 이미지에만 명시적으로 목업을 채웁니다.
- 2026-09-16 이전 작업에서 서울비디치과에 기존 2개를 보존하고 이미지 예시 8개를 등록했습니다. 이번 안전 업그레이드는 운영 자료를 추가·수정하지 않습니다.

### 이미지·영상·필기

- 이미지 중심 카드와 큰 설명 화면. 본문은 선택 입력·접힌 보충 설명. 기존 텍스트/비용표 호환.
- 이미지 JPG/PNG/WebP 5MB, 영상 MP4/WebM 25MB. 파일 시그니처·크기 검사. 비포애프터는 이미지 2장 전용.
- R2 실제 미디어는 소유 병원 세션 또는 유효한 안내장 스냅샷 토큰으로만 접근. `private, no-store`, 영상 Range 206/416 지원.
- 펜·형광펜·지우개·색상·굵기·되돌리기/다시하기·전체 지우기·PNG 다운로드·저장.
- 정규화 좌표로 원본 비율 유지, Pointer Events 마우스/터치/펜 지원. 원본 파일은 변경하지 않습니다.
- **필기는 설명 scope별로 분리**합니다. 새 설명은 별도 scope를 발급하며, 기존 공용 필기는 명시적으로 복사할 때만 들어갑니다. 복사 후 수정·삭제해도 원본 공용 필기와 다른 scope는 변하지 않습니다. 현재 scope와 선택 목록은 병원 ID별 sessionStorage에 참조만 저장하며 벡터·이미지는 D1/R2에 저장합니다. 환자 식별정보를 수집하는 CRM은 아닙니다.
- 기존 공용 `material_annotations` API는 호환용으로 유지. 새 콘솔은 `?scope=`를 사용해 `scoped_annotations`를 읽고 씁니다. scope를 알아도 다른 병원 권한을 우회할 수 없습니다.
- 영상당 현재 장면 하나의 필기를 저장. 다른 시점으로 바꾸면 교체 확인, 재생 중에는 어긋난 오버레이를 숨깁니다. 안내장에는 원본 영상과 시각이 표시된 필기 PNG를 함께 제공합니다.
- 저장 재시도는 동일 write_key로 처리하고 version 충돌 시 입력 보존. 자료 이동·닫기 전에 저장하며 실패하면 이동을 막습니다. 새로고침은 미저장 경고만 제공하며 완전한 오프라인 저장은 아닙니다.
- 필기 PNG는 불변 R2 키. 이미 발행한 안내장의 필기는 이후 수정·지우기로 바뀌지 않습니다.

### 비용·사례 전송 안전

- 비용 자료: 포함 범위, 별도 비용 조건, 대안별 차이(선택), 안내 기준일, 유효기간, 검사 후 변동 가능성. 환자에게 공용 안내이며 확정 견적이 아님을 표시합니다.
- 서버가 필수 비용 항목·실제 달력 날짜·기준일 및 유효기간을 확인합니다. 미입력/만료 자료는 병원 내 열람은 가능하지만 새 외부 발송은 막습니다.
- 비포애프터는 기본 **병원 내 설명용**. 외부 전송에는 동의 범위 기록, 비식별 확인, 전송 허용 체크, 치료 내용·기간·개인차 안내 및 이미지 2장이 필요합니다.
- 내부 동의 기록/확인 플래그는 환자 스냅샷에서 제외합니다. 실제 동의서 원문·환자 이름 대신 내부 문서 참조와 허용 범위를 기록하세요.
- 사진 추가/삭제 시 외부 전송 승인·비식별 확인을 해제합니다. 서버와 편집 화면 모두 재확인을 요구합니다.
- 시스템은 병원의 확인을 기록할 뿐 실제 동의서 진위, 자동 비식별화, 의료광고 법적 적합성을 보증하지 않습니다. 기존 환자 안내장까지 소급 차단하지 않습니다.

### 최종 미리보기·발송 상태

- `POST /api/dispatches/preview`는 현재 자료·해당 scope 필기·병원 연락정보·수신 대상/채널을 검증하고 미리보기와 SHA-256 digest를 반환합니다. 안내장/열람 기록을 만들거나 외부 발송하지 않습니다.
- 발행은 `confirmed=true`, `preview_hash`, `request_key` 필요. 미리보기 후 자료·필기·병원 정보가 달라지면 재확인하도록 409를 반환합니다. 삭제/타 병원 자료를 조용히 누락하여 보내지 않습니다. 최대 40개 자료.
- 병원+request_key 고유 제약과 요청 hash로 동시 클릭·응답 유실 재시도의 중복 발행을 막습니다. 동일 키로 다른 내용을 보내면 거절합니다. 미확정 네트워크 오류 시 UI는 같은 요청의 결과 확인만 허용합니다.
- SOLAPI 접수는 `accepted`, 명시적 전달 성공은 `delivered`, 확정 실패는 `failed`, 접수 여부를 알 수 없는 통신 장애는 `unknown`으로 구분합니다. 기존 `sent`도 전달 미확인으로 표시합니다.
- 발송내역의 **결과 확인**은 SOLAPI 그룹 조회만 수행하며 메시지를 다시 보내지 않습니다. SOLAPI 공식 Node SDK 6.0.1의 group endpoint 및 count.sentSuccess/sentFailed 필드를 참조했습니다.
- 자동 재발송은 하지 않습니다. 특히 unknown/created를 재발송하면 중복될 수 있으므로 SOLAPI 콘솔에서 확인해야 합니다. 실패 시 기존 안내장 링크 복사로 직접 전달할 수 있습니다. 동일 요청의 결과 재조회와 실제 새 발송은 구분됩니다.
- 통계는 링크 발행·카카오 접수 기준이며 실제 전달 완료율로 해석하면 안 됩니다.
- 설정에서 병원 전화, `https://pf.kakao.com/...` 상담 주소, HTTPS 예약 주소를 저장하면 안내장 하단에 표시합니다. 주소 미입력 시 해당 버튼은 숨깁니다. 카카오 발신 채널과 병원 상담 채널 링크는 별개입니다.

## 목업·출처

1200×750 PNG 8개를 `public/static/mockups/`에 포함. 모두 설명용 목업·실제 임상자료 아님·의료진 검토 전 표시입니다. 실제 환자 전후 사례나 임의 진료비를 만들지 않았습니다.

- 공개 갤러리: `/static/mockups/index.html`.
- 공개 필기 체험: `/static/mockups/annotate.html?file=implant` (서버 저장/환자 발송 없이 다운로드만).
- `/a/examples/<known-name>.png`는 정확한 목업 허용 목록만 공개 정적 파일로 연결합니다.
- 도식/한국어 레이아웃은 코드로 제작. 일부 참고 이미지는 image_search CC/PD 필터 결과를 사용했고 원본 `reference-*.jpg`를 보관합니다.
  - 모델 사진: https://sspark.genspark.ai/i/EyMYBryePyDzkrRt?width=2560 · 원본 안내 https://www.rawpixel.com/search/dental%20implant
  - 치아 구조: https://sspark.genspark.ai/i/e6J2600nB0KDEGhX?width=2560 · 원본 안내 https://www.rawpixel.com/search/dental%20design
- `npm run mockups:render`: Playwright + 로컬 Noto Sans CJK KR로 재생성. 유료 이미지 생성은 사용하지 않았습니다. 이미 발송된 목업 참조 보존을 위해 변경 시 새 파일명/버전 키 사용을 권장합니다.

## 주요 URI와 데이터

| URI | 용도 |
| --- | --- |
| `/app` | 병원 자료함·설명하기·보내기·발송내역·설정 |
| `/api/auth/hub`, `/api/auth/hub/callback` | Hub SSO 시작/콜백 |
| `/api/me`, `/api/settings` | 병원 정보 GET / 설정 PUT |
| `/api/materials`, `/api/materials/:id` | 자료 GET/POST, PUT/DELETE |
| `/api/materials/:id/images` | 미디어 POST / DELETE `?key=` |
| `/api/material-library`, `/api/materials/examples` | 분류 GET / 확인 후 예시 POST |
| `/api/material-sets`, `/api/material-sets/:id` | 묶음 GET/POST `{name, material_ids}` / DELETE |
| `/api/annotation-sessions` | POST `{copy_shared?, material_ids?}` → 새 scope |
| `/api/materials/:id/annotations?scope=` | 필기 GET/PUT, scope 없으면 기존 공용 자료 |
| `/api/dispatches/preview` | POST `{material_ids, channel, phone?, label?, include_annotations?, annotation_scope?}` |
| `/api/dispatches` | 미리보기 확인 후 POST / 발송내역 GET `?limit=` |
| `/api/dispatches/:id/status` | POST 전달 결과 조회, 재발송 없음 |
| `/g/:token`, `/api/g/:token` | 환자 안내장 / JSON |
| `/optout/:token` | 병원별 수신거부 |
| `/a/*` | 권한 검사된 미디어 |
| `/privacy`, `/terms`, `/legal-guide` | 정책과 병원 안내 문구 |

D1 테이블: hospitals, materials, dispatches, views, optouts, hub_profile_cache, material_annotations, scoped_annotations, material_sets.

- `materials.images_json`: `{key, caption?, media_type?}[]`, `cost_json`: 비용 항목 배열, `guidance_json`: 비용/사례 안내 및 내부 전송 확인.
- `dispatches.materials_json`: 발행 시점 불변 자료·필기·공개 안내 스냅샷. 현재 병원 연락처는 안내장 열람 시 조회합니다.
- `0002_material_examples.sql`, `0003_material_annotations.sql`, `0004_consultation_safety.sql` 운영 적용 완료. `0004`는 컬럼/테이블/고유 인덱스 추가만 하며 기존 자료·발송 스냅샷은 바꾸지 않습니다.
- 이번 배포 직전 운영에 있던 자료 18개·발송 이력 2건을 포함하여 hospitals/materials/dispatches/optouts/material_annotations의 기존 행·컬럼값 보존을 확인했습니다. 운영 테스트용 자료나 실제 메시지는 생성하지 않았습니다. D1/R2 바인딩과 기존 환경변수 이름도 보존했습니다.
- 운영 검증은 두 배포 URL의 HTML 버전·정적 파일 해시, 비로그인 API 401, Hub 인증 시작 302 및 D1 보존 확인입니다. 실제 사용자 SSO 로그인 완료 후 전체 클릭 테스트는 아닙니다. urllib 사이트 요청 403은 curl로 재확인해 정상 200/자산 해시 일치를 확인했습니다.
- SESSION_SECRET, PS_SSO_SECRET, PHONE_ENC_KEY, HUB_API_KEY, SOLAPI_API_KEY/SECRET 등은 서버 시크릿. 코드/프런트/Git에 비밀값을 넣지 않습니다.

## 개발·검증

```bash
cd /home/user/webapp
npm ci
npm run typecheck
npm run build
npx wrangler d1 migrations apply patient-connect-production --local --persist-to .wrangler/category-tests
# PM2로 wrangler pages dev dist --local --persist-to .wrangler/category-tests --ip 0.0.0.0 --port 3000 실행
npm run test:categories
npm run test:library
npm run test:media
npm run test:annotations
npm run test:safety
```

- 테스트는 localhost + 별도 `.wrangler/category-tests` D1/R2 + 합성 병원만 사용. Playwright Chromium, ffmpeg 필요.
- 기존 회귀 134개(분류30/카탈로그32/미디어32/필기40), 신규 안전 58개 통과. 안전 테스트는 scope 분리·사례/비용 정책·미리보기 변경 감지·동시 발행·UI 응답 유실·모바일·연락처·SOLAPI 모의 응답을 포함합니다.
- SOLAPI 검사는 stub Fetch만 사용합니다. 실제 Hub 사용자 로그인 완료나 실제 환자 메시지 전송 성공을 검증했다고 해석하지 마세요.
- 빌드 시 `emptyOutDir: true`. 실행 중 Wrangler watcher 경합을 피하려면 PM2 중지 → 포트 정리 → 빌드 → PM2 시작 → curl readiness 순서를 사용합니다.
- 테스트/운영 SQL 백업은 Git 제외 `.test-results/`. 운영 백업은 복원 무결성 검사를 수행하며 R2 전체 백업은 아닙니다.

## 아직 필요한 운영 준비·후속 과제

- SOLAPI 실제 키·발신 채널·승인 템플릿 설정 및 승인된 테스트 수신번호로 실발송/수신 검증. 이번 작업의 실제 메시지 발송은 0건.
- 병원의 실제 상담/예약 URL 입력, 의료진의 실제 비용·사례·동의 범위 검토. 시스템이 임의 금액이나 법적 승인을 대신 입력하지 않습니다.
- 실물 iPad/Apple Pencil/Safari, 압력 감응, 완전한 오프라인 저장은 별도 검증/개발 필요.
- 영상 하나에 여러 장면 동시 보관, scope 보관기간·미사용 R2 파일 정리 및 상담 간 저장 필기 탐색은 후속 과제입니다.
- 자동 발송 재시도/웹훅은 제공하지 않습니다. 결과 조회 후 명시적 운영 판단이 필요합니다.
- GitHub 푸시는 별도 승인 후 진행합니다. 새 운영 변경 전 반드시 실제 `origin`을 fetch하세요.
