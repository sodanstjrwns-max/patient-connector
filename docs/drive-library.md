# Patient Connect 영상 라이브러리 (구글 드라이브 동기화)

설명자료의 원천은 구글 드라이브 폴더 **치과 환자설명 영상 라이브러리 · 2026-09-18**(ID `1sGdOa_tWV8a-XJlIKAr1ovFyOHiGgKwq`)이다. 코드 안에 예시 문안·목업은 없다.

## 흐름
1. `tools/drive_library_sync.py` 가 로컬 Google Drive 마운트(`~/Library/CloudStorage/GoogleDrive-…/내 드라이브/치과 환자설명 영상 라이브러리 · 2026-09-18`)를 읽는다.
2. 주제 폴더(이름에 `ABC-123` ID)마다 **최종 HD mp4 1개**(`4K·미채택·초안·강조본·수술과정만·진행본·partial·WIP` 제외 후 최신), 미리보기 jpg(`미리보기|preview|썸네일|대표이미지`), `captions.srt`(없으면 `production-script.json`)를 고른다. 하위 폴더 `v2_…`·`최종 검토본…` 도 단위로 본다('최종'이 있으면 상위 단위는 버림).
3. 같은 ID의 단위가 여럿이면 기본은 **최신 단위 하나(replace)**. `tools/library-overrides.json` 의 `mode: append` 면 단위별 영상을 순서대로 모두 넣는다(CAR-001, PER-001).
4. 제목·분류는 `tools/library-catalog.csv`(제작 목록 시트 190편 사본)와 폴더의 `catalog-entry.json`, overrides 순으로 정한다. 본문은 자막 큐를 `- 제목: 내용` 줄로 바꾼 것 + 마무리 문장. 자막이 없는 주제는 overrides 에 본문을 직접 쓴다.
5. 영상·포스터를 R2 `library/{ID}/{sha12}.mp4|jpg` 로 올리고(내용 주소, 중복 업로드 없음) `POST /api/v1/ops/library-sync`(Bearer PS_SERVICE_KEY, User-Agent 필수 — python 기본 UA 는 Cloudflare 403) 로 `library_materials` 를 upsert 한다. 서버는 `propagateLibrary()` 로 전 병원 자료함에 반영한다.
6. 병원 자료함 사본은 `example_key = drive:{ID}`, `library_rev` 로 추적. 병원이 제목·본문·영상을 고치면 `library_locked = 1` 이 되어 자동 갱신에서 빠진다. 라이브러리에서 사라진 주제는 미수정 사본만 비활성. 콘솔의 **라이브러리 새로고침** 버튼은 같은 반영을 병원 하나에 대해 즉시 실행한다.

## 실행
- 계획만: `npm run library:plan` · 실제 반영: `npm run library:sync` · 전부 다시: `python3 tools/drive_library_sync.py --force`
- 자동: Claude 데스크톱 앱 예약작업 `connect-library-sync`(매일 09·13·17·21시)가 `tools/library-sync.sh` 를 실행하고 결과를 보고한다. launchd 는 `~/Library/CloudStorage` TCC 때문에 무인 접근이 막혀(PermissionError) 9/23 에 제거했다. 앱이 꺼져 있으면 다음 실행 때 돈다. 보고서 `~/pflive/patient-experience-2026/runtime/connect-library-sync-report.md`, 상태 `tools/library-state.json`(커밋).
- 새 주제 폴더가 올라오면 다음 실행에서 자동 추가된다. 판별이 이상하면 overrides 에 `title/kind/category/body/mode/skip` 을 넣는다. 진행본만 있는 주제는 `skip: true`(SUR-005).

## 진료과 매칭
- 라이브러리 자료마다 `specialty`(현재 폴더는 모두 `치과`)가 있고, 병원 진료과는 허브 프로필 `basic.clinic_type`('치과'·'한의원'·'한의과'…)을 `hospitals.clinic_type`에 복사해 쓴다(SSO 로그인마다 갱신, 없으면 동기화 때 조회).
- `specialtyMatches()`: 치과 자료는 진료과에 '치과'/'치의'가 들어간 병원에만 들어간다. 진료과를 모르는 병원은 통과(카운트 `unknown_specialty`). 진료과가 다른 병원의 기존 사본은 내려두되 `library_rev='specialty-mismatch'`로 표시해 병원이 직접 숨긴 것과 구분하고, 나중에 진료과가 맞으면 다시 올린다.

## 주의
- 드라이브 마운트의 한글 파일명은 NFD 로 올 수 있어 스크립트가 NFC 로 정규화해 매칭한다.
- 안내장 스냅샷은 R2 키를 그대로 담으므로 라이브러리 객체는 지우지 않는다(내용이 바뀌면 새 키가 생김).
- 환자용 `/a/library/...` 는 로그인 병원 또는 안내장 토큰(스냅샷에 든 키)만 열람 가능, 캐시 1일.
