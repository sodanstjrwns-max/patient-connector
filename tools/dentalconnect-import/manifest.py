"""업로드 매니페스트 → upload/insert.sql (D1) + upload/puts.tsv (R2 key\tfile\tctype)
hospital_id=1 서울비디치과불당본점. id는 MAX(id) 다음부터 명시 할당.
"""
import os, json, glob, random, string, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'upload'); os.makedirs(OUT, exist_ok=True)
START_ID = int(sys.argv[1]); START_SORT = int(sys.argv[2])
HID = 1
BASIS, VALID = '2026-09-25', '2026-12-31'
rnd = lambda: ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
q = lambda s: "'" + str(s).replace("'", "''") + "'"

COST_G = {'included': '표에 적힌 항목 기준 안내 금액입니다.', 'extra': '골이식·마취·검사 등 추가 처치는 진단 후 별도 안내됩니다.', 'alternatives': '재료·브랜드에 따라 금액이 달라집니다.', 'basis_date': BASIS, 'valid_until': VALID, 'variability': '정밀 검사(CT·엑스레이) 후 치료 범위에 따라 달라질 수 있습니다.'}
BA_G = lambda name: {'treatment': name, 'period': '개인별 상이', 'individual_notice': '치료 결과는 개인의 구강 상태에 따라 다를 수 있습니다.', 'deidentified': True, 'external_allowed': False, 'consent_ref': ''}

CARDS = [  # (kind, category, title, body, [page slugs])
 ('cost','임플란트','임플란트 비용 안내','- 스트라우만 BLX 1,600,000원 (세계 1위 스위스)\n- 오스템 SOI 1,000,000원 (국내 1위 최상위 라인)\n- 오스템 CA 800,000원 (국내 1위 기본형)\n- 골이식 단순 30만 / 복잡 50만 · 상악동 거상술 단순 50만 / 복잡 100만\n- 보증 1년 100% · 3년 80% · 5년 50% · 7년 30%\n- 프리미엄 시스템 9가지: 최고급 픽스처, 프리미엄 지르코니아, 7년 보증, 무통 수면마취, 3D CT 가이드, 전문의 협진, CNC 지대주, 원내 기공센터, 레진홀 무상 필링', ['implant-1','implant-2','implant-3']),
 ('cost','임플란트','임플란트·틀니 건강보험 본인부담금','- 만 65세 이상 건강보험 적용 시 단계별 본인부담금\n- 임플란트 합계 423,600원 / 금속상 완전틀니 477,000원 / 레진상 완전틀니 411,400원 / 부분틀니 500,500원\n- 임시틀니 추가 시 별도 (완전 92,800원 · 부분 24,570원+치아당 2,360원)\n- 절사 방식에 따라 500원 미만 차이 가능, 의료급여 1·2종 상이', ['insurance-implant-denture']),
 ('cost','임플란트','임플란트 할인 안내','- 다수치 할인: 4~6개 10% · 7~9개 15% · 10개 이상 20%\n- 소개 할인 10% · 당일완납 +5% · 인터뷰(3회) +5%\n- 최대 할인 1~3개 20% / 4~6개 30% / 7~9개 35% / 10개 이상 40%\n- 전체 비용 기준, 보험 진료비 별도', ['implant-discount']),
 ('cost','임플란트','임플란트 사후 유지관리 비용','- 본원 식립: 레진홀 충전·컨택 타이트닝 무상, 보철물 재제작 1년 무상 → 3년 12/10만 → 5년 30/25만 → 7년 42/35만 (어벗 포함/제외)\n- 타 병원 식립: 레진홀 충전 5만 · 보철물 재제작 60만(어벗 포함) / 50만(어벗 제외) · 컨택 타이트닝 진행 불가\n- 정기 검진 주기 준수 시 보증 유지', ['implant-care-1','implant-care-2']),
 ('cost','보철','어금니 보철 비용','- 지르코니아 크라운 550,000원 · 골드 크라운 950,000원\n- 세라믹 오버레이 800,000원 · 세라믹 인레이 350,000원 · 골드 인레이 480,000원\n- 지르코니아: Amann Girrbach 100% 토소 분말 블록 · 세라믹: Ivoclar e.max · 골드: 크라운 S0(56%)·인레이 I type(83%)\n- 보증 1년 100% · 3년 50% · 5년 30%', ['posterior-1','posterior-2']),
 ('cost','보철','앞니 보철 비용','- 지르코니아 포세린 크라운(PFZ) 800,000원 · 지르코니아 크라운 600,000원\n- 공정: 디지털 스캔 → CAD 디자인 → CAM 정밀 밀링 → (포세린 빌드업) → 색조 작업\n- 100% 토소(Tosoh) 분말 블록 · 환자 맞춤 골든 믹스(루젠 70%·바텍 20%·Aidite 10%)\n- 보증 1년 100% · 3년 50% · 5년 30%', ['anterior']),
 ('cost','레진','레진 충치 치료 비용','- 뺨측·씹는면 충치 좁은 부위 10만 / 넓은 부위 35만\n- 치아 사이 충치 면당 25만 · 다이아스테마 면당 40만\n- 치아 목 충치 10만 · 목 패임 7만 · 앞니 뒷면 5만 · 열린 옆면 7만 (치아당)', ['resin-caries']),
 ('cost','레진','레진 심미·파절 치료 비용','- 앞니 파절: 협소 12만 / 중간 30만(현정민 원장 45만) / 큰 파절 50만(현정민 원장 70만)\n- 왜소치 100만 · 다이아스테마 면당 30만(현정민 원장 50만) · 블랙트라이앵글 면당 25만\n- 반점치 점 형태 20만 / 면 형태 30만', ['resin-esthetic']),
 ('cost','레진','치경부 마모 치료 비용','- 레진 70,000원(치아당): 심미적·매끄러움, 침·피 많은 환경은 어려움\n- 글래스아이오노머(보험): 저렴, 악조건 진료 가능, 우식 예방, 표면 다소 거침', ['cervical']),
 ('cost','라미네이트','글로우네이트(라미네이트) 비용','- 글로우 프리미엄 800,000원(치아당) · 글로우 리페어 맞춤 견적(VAT 별도)\n- 보증 1년 100% · 3년 50% · 5년 30%\n- 다섯 가지 약속: 반드시 예뻐집니다 · Personal Signature Design · 핸드메이드 컬러링 · 필요한 만큼만 삭제 · 작품 보증 시스템', ['glownate-1','glownate-2']),
 ('cost','교정','치아교정 비용','- 클리피씨 500만 · 클라리티 울트라 550만\n- 전치 부분교정 양악 250만 / 편악 200만\n- 악궁 확장 아동 50만 / 성인 70만(미니 임플란트 4개 추가) · 페이스마스크·헤드기어 250만 · 구치부 직립 100만\n- 포함: 스크류·교정발치·월치료비 / 별도: 진단비·유지장치 / 불포함: 사랑니 발치·충치·잇몸치료', ['ortho-1']),
 ('cost','교정','인비절라인 비용','- 퍼스트(성장기) 400만 · 익스프레스(7단계) 300만 · 라이트(14단계) 450만 · 모더레이트(23단계) 550만 · 컴프리헨시브(무제한·5년 보장) 700만\n- 추가 단계 필요 시 1세트 추가 제작 가능(추가 비용)', ['invisalign']),
 ('cost','교정','교정 부가 수가','- 장치 제거 본원 양악 50만/편악 25만 · 타치과 80만/40만\n- 유지장치(고정+가철) 50만/30만 · Wrap around 30만 · Fixed 15만 · 제거 후 재부착 악당 25만\n- ROA·ABP 장치당 80만 · 타치과 유지장치 수리 치아당 5만 · 와이어 찔림 악당 3만 · 브라켓 재부착 치아당 5만\n- 매복치 견인 수술 30만 · 견인 장치(TPA) 150만', ['ortho-2']),
 ('cost','소아','소아진료 수가표','- 소아 레진 1면 6만 / 2면 8만 / 3면 10만 · 불소 3~3.5만 · 웃음가스 1만(비보험 진료 시)\n- 데라칼 1만 · Nance holding arch 25만 · Lingual arch 30만 · SS Crown 11만 · Band & Loop 20만 · 할터만 편측 70만 / 양측 100만', ['pediatric']),
 ('cost','구강내과','구강내과 비용','- 턱 보톡스 원더톡스(국내) 15만 · 제오민(독일) 35만\n- 이갈이 장치 100만 · 월 진료비 1만', ['tmj']),
 ('cost','기타','스테인 제거·지혈제 비용','- 에어플로우 스테인 제거 1악당 5만\n- 지혈제: 큐탄플라스트(젤라틴) 1만 · 본트리 큐브(콜라겐+키토산, 99.9% 항균) 7만', ['hygiene']),
 ('cost','이벤트','이달의 이벤트','- 턱 보톡스 원더톡스 15만 → 4.9만\n- 원데이 치아미백 1회(30분) 30만 → 4.9만 · 2회(60분) 60만 → 8만\n- 기간·조건은 데스크 확인', ['event']),
 ('notice','보증','보철 보증 기간 안내','- 일반 보철(크라운·인레이)·글로우네이트: 1년 100% · 3년 50% · 5년 30%\n- 임플란트 보철: 1년 100% · 3년 80% · 5년 50% · 7년 30%\n- 정기 검진 주기 준수 시 보증 유지', ['warranty']),
 ('notice','보험','치아 보험과 치과 치료','- 치아보험: 보험사·상품마다 보장 다름, 면책기간·보장개시일 확인, 임플란트 보통 연 3개 제한\n- 임플란트 서류: 차트 사본·전후 파노라마·치료확인서 / 보존치료: 치료확인서\n- 생명·종신보험: 치조골 이식 포함 수술특약 혜택, 1일 1개 인정(본원 수술확인서)\n- 실손보험: 건강보험 적용 항목(보험 임플란트·사랑니 발치 등) 가능(영수증)', ['dental-insurance']),
 ('notice','제휴','제휴업체 혜택 안내','- 제휴업체 임직원·가족은 접수 시 미리 말씀해 주시면 확인 후 혜택 적용\n- 선문대·순천향대·갤러리아·현대·삼성·하나마이크론·천안교차로·충남개인택시조합 등', ['partners']),
 ('explain','임플란트','오스템 임플란트 안내','- SOI: 빠른 혈병 형성·골형성 단백질 부착·초친수성 표면·치료기간 단축\n- CA: 칼슘 표면 활성화·혈액 젖음성·빠른 혈병 형성·우수한 골조직 형성', ['brand-osstem']),
 ('explain','임플란트','스트라우만 임플란트 안내','- SLA 액티브 표면 · 록솔리드 합금(티타늄보다 1.8배) · 10년 이상 99.7% · 정밀 결합\n- 나사 풀림·파절 최소화, 재조정 용이 · 필요 시 식립 전/동시 뼈이식', ['brand-straumann']),
]
CASE_NAMES = {'01_앞니사이공간': '앞니 사이 공간', '02_앞니사이충치': '앞니 사이 충치', '03_앞니파절레진': '앞니 파절 레진', '04_인접면레진': '인접면 레진', '05_왜소치': '왜소치', '06_반점치': '반점치', '07_블랙트라이앵글': '블랙트라이앵글', '09_앞니크라운브릿지': '앞니 크라운·브릿지', '10_앞니임플란트크라운브릿지': '앞니 임플란트 크라운·브릿지', '12_틀니': '틀니·부분틀니', '13_전체교정': '전체 교정', '14_부분교정': '부분 교정', '15_매복치교정': '매복치 교정'}

sql, puts = [], []
mid, sort = START_ID, START_SORT
def add(kind, category, title, body, images, guidance):
    global mid, sort
    imgs = []
    for path, caption in images:
        ext = 'png' if path.endswith('.png') else 'jpg'
        key = f'h{HID}/m{mid}/dc-{rnd()}.{ext}'
        imgs.append({'key': key, 'caption': caption, 'media_type': 'image'})
        puts.append(f'{key}\t{path}\timage/{"png" if ext == "png" else "jpeg"}')
    sql.append(f"INSERT INTO materials (id, hospital_id, kind, category, title, body, images_json, cost_json, sort, active, guidance_json, library_locked) VALUES ({mid}, {HID}, {q(kind)}, {q(category)}, {q(title)}, {q(body)}, {q(json.dumps(imgs, ensure_ascii=False))}, '[]', {sort}, 1, {q(json.dumps(guidance, ensure_ascii=False))}, 1);")
    mid += 1; sort += 1

# 1) 비용·안내 카드
for kind, cat, title, body, slugs in CARDS:
    g = COST_G if kind == 'cost' else {}
    add(kind, cat, title, body, [(os.path.join(ROOT, 'cost_out', s + '.png'), '') for s in slugs], g)
# 2) 글로우네이트 상담지(원본 그대로, 폭 2400 축소)
gl = os.path.join(OUT, 'glow'); os.makedirs(gl, exist_ok=True)
titles = ['색상 비교(상담지)', '치아형태 비교', '스마일라인 비교', '색상비교']
imgs = []
for i, p in enumerate(sorted(glob.glob(os.path.join(ROOT, 'cases/08_글로우네이트/orig/*.jpg')))):
    im = Image.open(p).convert('RGB'); im.thumbnail((2400, 2400)); o = os.path.join(gl, f'{i+1}.jpg'); im.save(o, quality=88); imgs.append((o, titles[i]))
add('explain', '라미네이트', '글로우네이트 색상·형태 비교 상담지', '- 라미네이트 색상(W0~W4)·치아 형태·스마일라인 비교 상담지', imgs, {})
# 3) 비포애프터
for d, name in CASE_NAMES.items():
    befores = sorted(glob.glob(os.path.join(ROOT, 'cases', d, 'final', '*_before.jpg')))
    for i, b in enumerate(befores):
        a = b.replace('_before', '_after')
        if not os.path.exists(a): continue
        add('before_after', name, f'{name} 사례 {i+1:02d}', '', [(b, '치료 전'), (a, '치료 후')], BA_G(name))
open(os.path.join(OUT, 'insert.sql'), 'w').write('\n'.join(sql) + '\n')
open(os.path.join(OUT, 'puts.tsv'), 'w').write('\n'.join(puts) + '\n')
print('materials', len(sql), 'objects', len(puts), 'ids', START_ID, '~', mid - 1)
