# 덴탈커넥트(dentalconnet.com) 자료 반입 도구 — 2026-09-25 서울비디치과 1회 실행본

병원이 쓰던 덴탈커넥트의 비용안내·케이스(비포애프터)를 페이션트 커넥트 자료함으로 옮길 때 쓴 스크립트 모음. 병원별로 데이터(가격표 내용·카테고리명)는 다시 채워야 한다.

| 파일 | 역할 |
|---|---|
| `dl.sh` | `urls.txt`(Firebase Storage 토큰 URL 목록) → `orig/NN.ext` 다운로드. URL은 Chrome 확장에서 케이스 drawPage 드롭다운을 순회하며 `read_network_requests`로 수집했다(Firestore 토큰을 읽지 않고도 됨). |
| `split.py` | 합성 이미지(전/후 2단·3단·상하·2×2·행 스트립)를 격자 탐지로 `split/NN_before.jpg`, `NN_after.jpg`로 분리. 16:9 표준 템플릿은 좌표 고정값 사용. |
| `upscale.sh` | 폭 900px 미만은 Real-ESRGAN(ncnn-vulkan, x4plus) 4배 업스케일 → `final/`. 바이너리는 `tools/realesrgan-ncnn-vulkan` + `-m tools/models` (저장소에 포함하지 않음). |
| `cost.mjs` | 비용·안내 카드 HTML→PNG 렌더(playwright, 1600×900 @2x). 데이터는 파일 안 `PAGES`. 브랜드색 `#6b4226` 계열. |
| `manifest.py` | 자료 목록(`CARDS`, `CASE_NAMES`) → `upload/insert.sql`(D1 materials INSERT, id 명시) + `upload/puts.tsv`(R2 key/파일). `python3 manifest.py <시작 id> <시작 sort>` |
| `put.sh` | `puts.tsv` n번째 줄을 `wrangler r2 object put`으로 올림. `seq 1 N | xargs -P 4 -I{} ./put.sh {}` (xargs는 탭을 뭉개므로 줄 번호로 넘긴다). |
| `bd-cost-transcript-2026-09-25.md` | 서울비디치과 비용안내 원본 28장 전사(화면 판독). |

주의: 비포애프터는 `external_allowed=false, consent_ref=''`로 넣었다. 환자 안내장 외부 전송(카톡)은 병원이 사진 동의 범위를 확인해 자료 편집에서 체크해야 열린다. 원내 설명은 바로 가능.
