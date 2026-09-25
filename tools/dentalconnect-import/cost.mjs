// 서울비디치과 불당본점 · 비용/안내 카드 생성기 (덴탈커넥트 전사 내용 → 새 디자인 PNG)
// 실행: cd ~/patient-series/patient-connector && node <this file> [slug ...]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire('/Users/msj/patient-series/patient-connector/package.json')
const { chromium } = require('playwright')

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../cost_out')
fs.mkdirSync(OUT, { recursive: true })
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../logo.png')).toString('base64')
const BASIS = '2026.09'

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const won = man => (Math.round(man * 10000)).toLocaleString('ko-KR') + '원'

const CSS = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
*{box-sizing:border-box}
body{margin:0;width:1600px;height:900px;font-family:Pretendard,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;background:#f6f1ea;color:#1f1a17;-webkit-font-smoothing:antialiased}
.page{position:relative;width:1600px;height:900px;overflow:hidden;display:flex;flex-direction:column;background:#f6f1ea}
.head{background:linear-gradient(135deg,#3a2718 0%,#5a3a24 70%,#6b4226 100%);padding:44px 80px 38px;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;position:relative;overflow:hidden}
.head:after{content:'';position:absolute;right:-120px;top:-160px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(217,184,122,.22),rgba(217,184,122,0) 70%)}
.eyebrow{font-size:18px;letter-spacing:.22em;color:#d9b87a;font-weight:700}
h1{font-size:54px;font-weight:800;margin:10px 0 0;letter-spacing:-.02em;line-height:1.15}
.sub{font-size:21px;color:#e8dccb;margin-top:12px;font-weight:500}
.mark{display:flex;align-items:center;gap:14px;position:relative}
.mark .bd{width:52px;height:52px;border-radius:12px;background:#f6f1ea;color:#6b4226;font-weight:800;font-size:24px;display:flex;align-items:center;justify-content:center;letter-spacing:-.02em}
.mark .t{font-size:24px;font-weight:700;color:#fff;line-height:1.1}
.mark .t small{display:block;font-size:15px;color:#d9b87a;font-weight:600;margin-top:4px;letter-spacing:.08em}
.body{flex:1;padding:36px 80px 24px;display:flex;gap:32px;min-height:0;align-items:flex-start}
.col{flex:1;min-width:0;display:flex;flex-direction:column;gap:14px}
.foot{padding:18px 80px 24px;border-top:1px solid #e3d8c9;display:flex;justify-content:space-between;align-items:center;font-size:16px;color:#7a6f65}
.foot img{height:34px;opacity:.9}
.foot .r{text-align:right;line-height:1.45}
.rows{display:flex;flex-direction:column;gap:12px}
.row{background:#fff;border:1px solid #e6dccf;border-radius:18px;padding:18px 28px;display:flex;align-items:center;gap:22px;box-shadow:0 2px 10px rgba(59,42,30,.05)}
.row.hi{border-color:#c9a15b;background:linear-gradient(90deg,#fffaf2,#fff)}
.row .n{font-size:26px;font-weight:700;letter-spacing:-.01em}
.row .d{font-size:17px;color:#6f665f;margin-top:5px;line-height:1.4}
.row .p{margin-left:auto;font-size:32px;font-weight:800;color:#3a2718;white-space:nowrap;text-align:right}
.row .p small{display:block;font-size:15px;color:#9a8f83;font-weight:600;margin-top:2px}
.row .p .strike{font-size:18px;color:#a79c90;text-decoration:line-through;font-weight:600;margin-right:10px}
.tag{display:inline-block;background:#f1e7d8;color:#6b4226;font-size:14px;font-weight:700;padding:3px 10px;border-radius:999px;margin-right:8px;vertical-align:middle}
.tag.gold{background:#3a2718;color:#e9cf98}
.sec{font-size:19px;font-weight:800;color:#6b4226;letter-spacing:.04em;margin:6px 0 2px;display:flex;align-items:center;gap:10px}
.sec:before{content:'';width:6px;height:22px;background:#c9a15b;border-radius:3px}
.card{background:#fff;border:1px solid #e6dccf;border-radius:18px;padding:22px 26px;box-shadow:0 2px 10px rgba(59,42,30,.05)}
.card h3{margin:0 0 10px;font-size:22px;font-weight:800;color:#3a2718}
.bul{margin:0;padding:0;list-style:none;font-size:17.5px;line-height:1.55;color:#3d3530}
.bul li{position:relative;padding-left:20px;margin:5px 0}
.bul li:before{content:'';position:absolute;left:0;top:11px;width:8px;height:8px;border-radius:50%;background:#c9a15b}
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #e6dccf;border-radius:18px;overflow:hidden;font-size:18px;box-shadow:0 2px 10px rgba(59,42,30,.05)}
th{background:#3a2718;color:#f3e7d3;font-weight:700;padding:14px 16px;text-align:center;font-size:17px;letter-spacing:.02em}
th:first-child{text-align:left;padding-left:24px}
td{padding:13px 16px;text-align:center;border-top:1px solid #efe7dc;font-weight:600;color:#2a231e;font-variant-numeric:tabular-nums}
td:first-child{text-align:left;padding-left:24px;font-weight:700}
td.sum{background:#fbf6ee;color:#6b4226;font-weight:800}
tr.total td{background:#fbf6ee;font-weight:800;color:#3a2718}
.note{font-size:16px;color:#7a6f65;line-height:1.5}
.note b{color:#a33b2c}
.warr{display:flex;gap:12px}
.warr .w{flex:1;background:#fff;border:1px solid #e6dccf;border-radius:16px;padding:16px 10px;text-align:center}
.warr .w b{display:block;font-size:30px;font-weight:800;color:#6b4226}
.warr .w span{font-size:15px;color:#7a6f65;font-weight:600}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.tile{background:#fff;border:1px solid #e6dccf;border-radius:18px;padding:22px 24px;box-shadow:0 2px 10px rgba(59,42,30,.05)}
.tile .no{font-size:14px;font-weight:800;color:#c9a15b;letter-spacing:.15em}
.tile h4{margin:6px 0 8px;font-size:22px;font-weight:800;color:#3a2718;line-height:1.3}
.tile p{margin:0;font-size:16.5px;color:#5f564f;line-height:1.5}
.steps{display:flex;gap:8px;align-items:stretch}
.steps .s{flex:1;background:#fff;border:1px solid #e6dccf;border-radius:14px;padding:12px 8px;text-align:center}
.steps .s small{display:block;font-size:13px;color:#c9a15b;font-weight:800;letter-spacing:.1em}
.steps .s b{display:block;font-size:17px;margin-top:4px;color:#3a2718}
.steps .s.on{background:#3a2718;border-color:#3a2718}
.steps .s.on b{color:#fff}
.big{font-size:44px;font-weight:800;color:#3a2718;letter-spacing:-.02em}
.kv{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px dashed #e3d8c9;font-size:19px}
.kv:last-child{border-bottom:0}
.kv b{font-weight:800;color:#3a2718;font-variant-numeric:tabular-nums}
.kv span{color:#3d3530;font-weight:600}
.kv small{color:#8a7f74;font-size:15px;margin-left:8px;font-weight:500}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{background:#fff;border:1px solid #e6dccf;border-radius:12px;padding:10px 16px;font-size:17px;font-weight:600;color:#3d3530}
.quote{font-size:22px;font-weight:700;color:#6b4226;line-height:1.5}
`

// ───────────── 컴포넌트 ─────────────
const page = ({ eyebrow = '비용 안내', title, sub = '', body, footNote = '' }) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="page">
<div class="head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
<div class="mark"><div class="bd">BD</div><div class="t">서울비디치과<small>불당본점</small></div></div></div>
<div class="body">${body}</div>
<div class="foot"><img src="${LOGO}" alt=""><div class="r">${footNote ? esc(footNote) + '<br>' : ''}${/비용|이벤트/.test(eyebrow) ? `안내 기준 ${BASIS} · 공용 안내 금액이며 정밀 진단 후 확정 견적과 다를 수 있습니다.` : `안내 기준 ${BASIS} · 세부 조건은 상담 시 확인해 주세요.`}</div></div>
</div></body></html>`

const rows = (items, opt = {}) => `<div class="rows">${items.map(r => `<div class="row${r.hi ? ' hi' : ''}"><div>${r.tag ? `<span class="tag${r.tagGold ? ' gold' : ''}">${esc(r.tag)}</span>` : ''}<span class="n">${esc(r.name)}</span>${r.desc ? `<div class="d">${r.desc}</div>` : ''}</div><div class="p">${r.was ? `<span class="strike">${won(r.was)}</span>` : ''}${typeof r.price === 'number' ? won(r.price) : esc(r.price)}${r.unit ? `<small>${esc(r.unit)}</small>` : ''}</div></div>`).join('')}</div>`
const bul = items => `<ul class="bul">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
const card = (h, inner) => `<div class="card">${h ? `<h3>${h}</h3>` : ''}${inner}</div>`
const sec = t => `<div class="sec">${t}</div>`
const warr = (arr) => `<div class="warr">${arr.map(([k, v]) => `<div class="w"><b>${v}</b><span>${k}</span></div>`).join('')}</div>`
const table = (head, body, opt = {}) => `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr${r.total ? ' class="total"' : ''}>${r.cells.map((c, i) => `<td${r.sumIdx === i ? ' class="sum"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
const kv = items => items.map(([k, v, s]) => `<div class="kv"><span>${k}${s ? `<small>${s}</small>` : ''}</span><b>${typeof v === 'number' ? won(v) : v}</b></div>`).join('')
const WARR_GEN = [['1년 이내', '100%'], ['3년 이내', '50%'], ['5년 이내', '30%']]
const WARR_IMP = [['1년 이내', '100%'], ['3년 이내', '80%'], ['5년 이내', '50%'], ['7년 이내', '30%']]

// ───────────── 페이지 정의 ─────────────
const PAGES = [
  // ── 임플란트
  { slug: 'implant-1', title: '임플란트 비용 안내', sub: '비디치과는 오래가는 임플란트를 목표로 합니다', body: `<div class="col">${sec('임플란트 1개 기준')}${rows([
    { tag: '세계 1위 · 스위스', tagGold: true, name: '스트라우만 BLX', desc: '록솔리드 재질(티타늄보다 1.8배 단단) · SLA 액티브 표면처리로 빠른 회복', price: 160, hi: true },
    { tag: '국내 1위 · 최상위 라인', name: '오스템 SOI', desc: '뛰어난 유지력과 초기 안정성 · 인체 친화적 표면 처리로 빠른 골유착', price: 100 },
    { tag: '국내 1위 · 기본형', name: '오스템 CA', desc: '오랜 기간 증명된 안정성 · 칼슘 이온 처리로 골유착 속도 향상', price: 80 },
  ])}<div class="note" style="margin-top:6px">픽스처·지대주·보철(지르코니아 크라운) 포함 1개 기준 안내 금액입니다. 골이식·상악동 거상술은 별도 안내표를 참고해 주세요.</div></div>` },
  { slug: 'implant-2', title: '골이식 · 상악동 거상술', sub: '뼈 상태에 따라 추가되는 시술과 보증 기간', body: `<div class="col">${sec('골이식')}${rows([
    { name: '단순 골이식', desc: '간단한 뼈 보강', price: 30 }, { name: '복잡 골이식', desc: '광범위한 뼈 보강', price: 50 },
    { name: '단순 상악동 거상술', desc: '위턱 뼈가 얇을 때', price: 50 }, { name: '복잡 상악동 거상술', desc: '위턱 뼈가 거의 없을 때', price: 100 },
  ])}</div><div class="col" style="flex:.8">${sec('임플란트 보철 보증 기간')}${warr(WARR_IMP)}${card('보증 안내', bul(['정품 등록 & 사후 관리를 포함한 7년 품질 보증제입니다.', '보증 혜택은 본원이 안내하는 정기 검진 주기를 지키실 때 지속 적용됩니다.', '레진홀 충전·컨택 타이트닝은 사후 유지관리 안내표를 참고해 주세요.']))}</div>` },
  { slug: 'implant-3', title: '프리미엄 임플란트 시스템', sub: '서울비디치과 임플란트에 포함되는 9가지 기준', body: `<div class="col"><div class="grid3">${[
    ['01', '최고급 임플란트 픽스처', '국내·세계 1위 기업의 최고급 임플란트 픽스처만 사용합니다.'],
    ['02', '프리미엄 지르코니아 블럭', '검증된 프리미엄 지르코니아 블럭 사용 · 수리·보수가 가능합니다.'],
    ['03', '7년 품질 보증제', '정품 등록 & 사후 관리를 포함한 7년 품질 보증제를 운영합니다.'],
    ['04', '무통 수면마취 시스템', '통증과 공포를 줄이는 무통 수면마취 시스템을 운영합니다.'],
    ['05', '3D CT 디지털 가이드 수술', '정밀 3D CT를 기반으로 한 디지털 가이드 수술을 진행합니다.'],
    ['06', '전문의 협진 + 원장 책임 수술', '서울대 출신 전문의 협진과 원장 책임 수술로 진행합니다.'],
    ['07', 'CNC 밀링 최고급 지대주', 'CNC 밀링으로 제작한 최고급 지대주를 사용합니다.'],
    ['08', '원내 디지털 기공센터', '원내 디지털 기공센터를 직접 운영해 정밀도를 관리합니다.'],
    ['09', '레진홀 무상 필링', '레진홀 무상 필링 (연 5만원 상당)'],
  ].map(([n, h, p]) => `<div class="tile"><div class="no">${n}</div><h4>${h}</h4><p>${p}</p></div>`).join('')}</div></div>` },
  // ── 건강보험 본인부담
  { slug: 'insurance-implant-denture', title: '임플란트 · 틀니 건강보험 본인부담금', sub: '만 65세 이상 건강보험 적용 시 단계별 본인부담금 (원)', body: `<div class="col">${table(['구분', '1단계', '2단계', '3단계', '4단계', '5단계', '6단계', '본인부담 합계'], [
    { cells: ['임플란트', '40,530', '186,260', '196,880', '-', '-', '-', '423,600'], sumIdx: 7 },
    { cells: ['금속상 완전틀니', '61,710', '129,110', '101,100', '82,290', '102,860', '-', '477,000'], sumIdx: 7 },
    { cells: ['레진상 완전틀니', '61,710', '102,860', '61,710', '82,290', '102,860', '-', '411,400'], sumIdx: 7 },
    { cells: ['부분틀니', '61,740', '69,370', '147,660', '42,590', '42,140', '137,300', '500,500'], sumIdx: 7 },
  ])}<div class="grid2" style="margin-top:4px">${card('임시틀니 추가 시', bul(['임시 완전틀니 92,800원', '임시 부분틀니 24,570원 + 추가 치아당 2,360원씩 본인부담금 추가']))}${card('확인해 주세요', bul(['본인부담금 절사 방식으로 상·하악 동시 시행 또는 여러 단계 동시 산정 시 <b style="color:#a33b2c">총액 500원 미만의 차이</b>가 있을 수 있습니다.', '의료급여 1·2종은 본인부담금액이 다를 수 있습니다.']))}</div></div>` },
  // ── 할인
  { slug: 'implant-discount', title: '임플란트 할인 안내', sub: '식립 개수와 조건에 따라 적용되는 할인율', body: `<div class="col">${table(['임플란트 식립 수', '다수치 할인', '소개 할인', '당일완납 할인', '인터뷰 할인', '최대 할인'], [
    { cells: ['1 ~ 3개', '-', '10%', '+5%', '+5%', '20%'], sumIdx: 5 },
    { cells: ['4 ~ 6개', '10%', '10%', '+5%', '+5%', '30%'], sumIdx: 5 },
    { cells: ['7 ~ 9개', '15%', '10%', '+5%', '+5%', '35%'], sumIdx: 5 },
    { cells: ['10개 이상', '20%', '10%', '+5%', '+5%', '40%'], sumIdx: 5 },
  ])}<div class="grid2">${card('인터뷰 할인', bul(['치료 전 · 치료 중 · 마무리 총 3회 인터뷰 진행 시 적용됩니다.']))}${card('적용 기준', bul(['전체 비용에서 적용되는 할인율입니다.', '보험 진료비는 별도입니다.']))}</div></div>` },
  // ── 사후 유지관리
  { slug: 'implant-care-1', title: '임플란트 사후 유지관리 비용', sub: '본원 식립 환자 · 안심 보증 케어', body: `<div class="col">${table(['관리 항목', '1년 이내', '1 ~ 3년', '3 ~ 5년', '5 ~ 7년'], [
    { cells: ['레진홀 충전', '무상', '무상', '무상', '무상'] },
    { cells: ['컨택 타이트닝', '무상', '무상', '무상', '무상'] },
    { cells: ['보철물 재제작 (어벗 포함)', '무상', '12만원', '30만원', '42만원'] },
    { cells: ['보철물 재제작 (어벗 제외)', '무상', '10만원', '25만원', '35만원'] },
  ])}<div class="grid3">${card('본원 환자 특전', bul(['수술 후 1년까지는 모든 유지관리 항목이 100% 무상 지원됩니다.']))}${card('정기 검진의 중요성', bul(['보증 혜택은 본원이 안내하는 정기 검진 주기를 준수하실 때 지속 적용됩니다.']))}${card('타 병원 임플란트', bul(['제품 종류(오스템·스트라우만 등)와 부품 호환 여부 확인이 먼저 필요하므로 상담 후 진행합니다.']))}</div></div>` },
  { slug: 'implant-care-2', title: '타 병원 임플란트 유지관리 비용', sub: '타 병원에서 식립한 임플란트를 본원에서 관리할 때', body: `<div class="col">${rows([
    { name: '레진홀 충전', desc: '크라운 나사 구멍 레진 재충전', price: 5 },
    { name: '컨택 타이트닝', desc: '타 병원 임플란트는 진행하지 않습니다', price: '진행 불가' },
    { name: '보철물 재제작 (어벗 포함)', desc: '지대주(어벗) 신규 제작 포함', price: 60 },
    { name: '보철물 재제작 (어벗 제외)', desc: '기존 지대주 그대로 사용 시', price: 50 },
  ])}<div class="note">제품 종류와 부품 호환 여부를 먼저 확인한 뒤 진행 가능 여부와 비용을 안내드립니다.</div></div>` },
  // ── 어금니 보철
  { slug: 'posterior-1', title: '어금니 보철 비용', sub: '크라운 · 오버레이 · 인레이 (치아 1개 기준)', body: `<div class="col">${rows([
    { tag: '크라운', name: '지르코니아 크라운', desc: '독일 Amann Girrbach 오스트리아 직영 공장 · 100% 토소(Tosoh) 분말 블록', price: 55 },
    { tag: '크라운', name: '골드 크라운', desc: '최고등급 S0 type (금 함량 56%) 합금 사용', price: 95 },
    { tag: '오버레이', name: '세라믹 오버레이', desc: '치아를 최대한 보존하며 손상 부위만 덮는 치료 · Ivoclar e.max', price: 80 },
    { tag: '인레이', name: '세라믹 인레이', desc: '심미적이고 튼튼한 Ivoclar vivadent e.max', price: 35 },
    { tag: '인레이', name: '골드 인레이', desc: '최고등급 I type (금 함량 83%) 합금 사용', price: 48 },
  ])}</div><div class="col" style="flex:.55">${sec('보철 보증 기간')}${warr(WARR_GEN)}${card('보증 안내', bul(['일반 보철(크라운·인레이) 공통 보증 기준입니다.', '정기 검진 주기를 지키실 때 보증이 유지됩니다.']))}</div>` },
  { slug: 'posterior-2', title: '어금니 보철 재료 안내', sub: '서울비디치과가 재료를 고르는 기준', body: `<div class="col"><div class="grid3">${card('지르코니아', bul(['아주 단단해 보철물로 적합하며 치아색과 유사해 심미적입니다.', '지르코니아 블록을 깎아서 만들며, 필요한 치아 삭제량은 금보다 큽니다.', '국내 유통 블록 상당수는 중국산·국내산 분말입니다. 본원은 독일 Amann Girrbach 오스트리아 직영 공장의 100% 토소 분말 블록을 사용합니다.']))}${card('세라믹 (e.max)', bul(['아주 단단하고 치아색과 유사해 심미적으로 뛰어납니다.', '필요한 치아 삭제량은 금보다 큽니다.', '본원은 매우 심미적이고 튼튼한 Ivoclar vivadent e.max로 인레이·오버레이를 제작합니다.']))}${card('골드', bul(['잘 늘어나는 성질로 치아 삭제량이 적고 미세 부위를 잘 맞출 수 있으며 교합력에 적응하는 좋은 재료입니다.', '일반 치과는 크라운 A type(금 46%)·A4G(33.6%), 인레이 P type(77.2%)을 씁니다. 본원은 최고등급 크라운 S0 type(56%)·인레이 I type(83%)을 사용합니다.', '심미적이지 못한 단점이 있습니다.']))}</div></div>` },
  // ── 앞니 보철
  { slug: 'anterior', title: '앞니 보철 비용', sub: '전치부 크라운 (치아 1개 기준)', body: `<div class="col">${rows([
    { tag: '프리미엄', tagGold: true, name: '지르코니아 포세린 크라운 (PFZ)', desc: '지르코니아 위에 포세린을 쌓아 자연치의 투명감을 재현', price: 80, hi: true },
    { name: '지르코니아 크라운', desc: '단단하고 심미적인 풀 지르코니아 크라운', price: 60 },
  ])}${sec('제작 공정')}<div class="steps">${['디지털 스캔', 'CAD 디자인', 'CAM 정밀 밀링', '포세린 빌드업', '색조 작업'].map((s, i) => `<div class="s${i === 3 ? ' on' : ''}"><small>${i + 1}단계</small><b>${s}</b></div>`).join('')}</div><div class="note">포세린 빌드업(4단계)은 PFZ에만 포함됩니다.</div></div><div class="col" style="flex:.85">${card('100% 토소(Tosoh) 분말 블록', bul(['국내 유통되는 일반 블록(중국산·저가형 분말)과 달리 세계적인 명품 원료인 일본 토소사 분말 100% 프리미엄 블록만 사용합니다.', '보철물의 투명도와 강도를 동시에 확보하는 비결입니다.']))}${card("환자 맞춤형 '골든 믹스' 블록", bul(['환자 개개인의 치아 색상과 투명도에 맞춰 블록을 선별 적용합니다.', '루젠 70% · 바텍 20% · Aidite 3D Pro 10% 사용 비중']))}${warr(WARR_GEN)}</div>` },
  // ── 레진
  { slug: 'resin-caries', title: '레진 충치 치료 비용', sub: '충치 위치와 범위에 따른 레진 충전', body: `<div class="col">${rows([
    { name: '뺨측 · 어금니 씹는면 충치', desc: '좁은 부위', price: 10 }, { name: '뺨측 · 어금니 씹는면 충치', desc: '넓은 부위', price: 35 },
    { name: '치아 사이 충치', desc: '면당', price: 25 }, { name: '다이아스테마 (치아 사이 벌어짐)', desc: '면당', price: 40 },
  ])}</div><div class="col">${rows([
    { name: '치아 목 부위 충치', desc: '치아당', price: 10 }, { name: '치아 목 부위 패임', desc: '치아당', price: 7 },
    { name: '앞니 뒷면 충치', desc: '치아당', price: 5 }, { name: '열린 옆면 충치', desc: '치아당', price: 7 },
  ])}<div class="note" style="margin-top:6px">충치 범위는 검사 후 확정되며, 신경 가까이 진행된 충치는 치료 계획이 달라질 수 있습니다.</div></div>` },
  { slug: 'resin-esthetic', title: '레진 심미 · 파절 치료 비용', sub: '앞니 파절 · 왜소치 · 다이아스테마 · 블랙트라이앵글 · 반점치', body: `<div class="col">${sec('앞니 파절')}${rows([
    { name: '협소한 파절', price: 12 }, { name: '중간 파절', desc: '중앙선을 넘지 않는 파절 · 현정민 원장 치료 시 450,000원', price: 30 }, { name: '큰 파절', desc: '중앙선을 넘는 파절 · 현정민 원장 치료 시 700,000원', price: 50 },
  ])}</div><div class="col">${sec('심미 레진')}${rows([
    { name: '왜소치', price: 100 }, { name: '다이아스테마', desc: '면당 · 현정민 원장 치료 시 500,000원', price: 30 }, { name: '블랙트라이앵글', desc: '면당', price: 25 },
    { name: '반점치', desc: '좁은 부위(점 형태) 200,000원 · 넓은 부위(면 형태) 300,000원', price: '20~30만원' },
  ])}</div>` },
  { slug: 'cervical', title: '치경부 마모 치료', sub: '치아 목 부위가 패였을 때 선택할 수 있는 두 가지 재료', body: `<div class="col"><div class="grid2">${card('레진 <span class="tag" style="margin-left:8px">비보험</span>', `<div class="big" style="margin:4px 0 12px">${won(7)}<span style="font-size:18px;color:#8a7f74;font-weight:600;margin-left:8px">치아당</span></div>` + bul(['심미적이고 미세한 조절이 가능하며 표면이 매끄럽습니다.', '침이나 피가 많이 나는 환경에서는 진행이 어렵습니다.']))}${card('글래스아이오노머 (GI) <span class="tag" style="margin-left:8px">보험 적용</span>', `<div class="big" style="margin:4px 0 12px">보험 수가<span style="font-size:18px;color:#8a7f74;font-weight:600;margin-left:8px">본인부담금만</span></div>` + bul(['비용이 저렴하며 침이나 피가 나는 악조건에서도 진료가 가능합니다.', '추가적인 치아 우식을 방지하는 효과가 있습니다.', '심미적이지 못하며 표면이 다소 거친 느낌이 있습니다.']))}</div></div>` },
  // ── 글로우네이트
  { slug: 'glownate-1', title: '글로우네이트 (라미네이트) 비용', sub: '서울비디치과 라미네이트 프로그램', body: `<div class="col">${rows([
    { tag: 'Glow Premium', tagGold: true, name: '글로우 프리미엄', desc: '최상급 심미 재료와 맞춤형 디자인으로 첫 시술의 심미성을 극대화하는 프로그램', price: 80, unit: '치아 1개 기준', hi: true },
    { tag: 'Glow Repair', name: '글로우 리페어', desc: '타 병원 라미네이트 불만족·실패 케이스 재시술 및 고난이도 심미 복원 전문 · 원장단 협진 정밀 진단 후 맞춤 견적', price: '맞춤 견적', unit: 'VAT 별도' },
  ])}${sec('보증 기간')}${warr(WARR_GEN)}</div><div class="col" style="flex:.7">${card('글로우 리페어 진행 방식', bul(['원장단 협진을 통한 고난도 문제 해결 및 복원 시스템', '원장 협진팀의 정밀 진단 후 맞춤 견적을 안내합니다.']))}${card('디자인부터 사후 관리까지', bul(['하나의 작품으로 책임지는 작품 보증 시스템으로 관리합니다.', '다섯 가지 약속은 다음 장을 참고해 주세요.']))}</div>` },
  { slug: 'glownate-2', title: '글로우네이트 다섯 가지 약속', sub: '서울비디치과 라미네이트가 지키는 기준', body: `<div class="col"><div class="grid3">${[
    ['01', '반드시 예뻐집니다', '아름다움 그 자체를 최우선으로, 치아와 얼굴의 조화를 극대화합니다.'],
    ['02', 'Personal Signature Design', '얼굴 윤곽과 피부 톤을 고려한, 나만을 위한 맞춤 디자인입니다.'],
    ['03', '핸드메이드 컬러링', '자연스러운 빛과 질감을 장인의 손길로 완성합니다.'],
    ['04', '필요한 만큼만 삭제', '치아를 지키기 위해 꼭 필요한 만큼만 정교하게 다듬습니다.'],
    ['05', '작품 보증 시스템', '디자인부터 사후 관리까지, 하나의 작품으로 책임집니다.'],
  ].map(([n, h, p]) => `<div class="tile"><div class="no">PROMISE ${n}</div><h4>${h}</h4><p>${p}</p></div>`).join('')}<div class="tile" style="background:#3a2718;border-color:#3a2718"><div class="no">WARRANTY</div><h4 style="color:#fff">보증 기간</h4><p style="color:#e8dccb">1년 이내 100% · 3년 이내 50% · 5년 이내 30%</p></div></div></div>` },
  // ── 교정
  { slug: 'ortho-1', title: '치아교정 비용', sub: '고정식 교정 · 부분 교정 · 악궁 확장 · 악정형', body: `<div class="col">${sec('고정식 교정 장치 치료')}${rows([
    { name: '클리피씨 (Clippy-C)', desc: '세라믹 자가결찰 브라켓', price: 500 }, { name: '클라리티 울트라 (Clarity Ultra)', desc: '3M 세라믹 자가결찰 브라켓', price: 550 },
  ])}${sec('상하악 전치 부분 교정')}${rows([{ name: '양악', price: 250 }, { name: '편악', price: 200 }])}</div><div class="col">${sec('악궁 확장 · 악정형 · 기타')}${rows([
    { name: '악궁 확장 장치', desc: '아동 500,000원 · 성인 700,000원 (성인은 미니 임플란트 4개 비용 추가)', price: '50~70만원' },
    { name: '페이스 마스크 · 헤드기어', desc: '악정형 치료', price: 250 }, { name: '구치부 직립 교정', price: 100 },
  ])}${card('포함 · 불포함', bul(['<b style="color:#3a2718">포함</b> 스크류, 교정 발치, 월 치료비', '<b style="color:#a33b2c">별도</b> 진단비, 유지장치', '<b style="color:#a33b2c">불포함</b> 사랑니 발치, 충치 치료, 잇몸 치료']))}</div>` },
  { slug: 'invisalign', title: '인비절라인 비용', sub: '투명교정 · 단계 수에 따른 프로그램', body: `<div class="col">${rows([
    { name: '인비절라인 퍼스트', desc: '성장기 아동', price: 400 }, { name: '인비절라인 익스프레스', desc: '7단계', price: 300 },
    { name: '인비절라인 라이트', desc: '14단계', price: 450 },
  ])}</div><div class="col">${rows([
    { name: '인비절라인 모더레이트', desc: '23단계', price: 550 }, { tag: '무제한', tagGold: true, name: '인비절라인 컴프리헨시브', desc: '단계 무제한 · 5년 보장', price: 700, hi: true },
  ])}${card('추가 단계가 필요할 때', bul(['추가 단계 필요 시 1세트 추가 제작이 가능합니다 (추가 비용 발생).', '성인 양악 기준 700만원, 아동 400만원 (인비절라인 퍼스트).']))}</div>` },
  { slug: 'ortho-2', title: '교정 부가 수가', sub: '장치 제거 · 유지장치 · 수리 · 매복치 견인', body: `<div class="col">${sec('교정장치 제거 · 유지장치')}${card('', kv([
    ['본원 교정장치 제거', '500,000원', '양악 · 편악 250,000원'], ['타치과 교정장치 제거', '800,000원', '양악 · 편악 400,000원'],
    ['유지장치 (고정식+가철식)', '500,000원', '양악 · 편악 300,000원'], ['Wrap around 유지장치', '300,000원'], ['고정식 유지장치 (Fixed)', '150,000원'],
    ['본원 교정장치 제거 후 재부착', '250,000원', '악당'],
  ]))}</div><div class="col">${sec('수리 · 특수 장치')}${card('', kv([
    ['기타 ROA · ABP 장치', '800,000원', '장치당'], ['타치과 고정식 유지장치 수리', '50,000원', '치아당'], ['타치과 와이어 찔림 처리', '30,000원', '악당'],
    ['타치과 브라켓 탈락 재부착', '50,000원', '치아당'], ['매복치 견인 수술', '300,000원'], ['매복치 견인 장치 (TPA)', '1,500,000원'],
  ]))}</div>` },
  // ── 소아
  { slug: 'pediatric', title: '소아진료 수가표', sub: '어린이 충치 치료 · 예방 · 공간 유지 장치', body: `<div class="col">${sec('소아 레진 · 예방')}${card('', kv([['소아 레진 1면', 6], ['소아 레진 2면', 8], ['소아 레진 3면', 10], ['불소 도포', '30,000 ~ 35,000원'], ['웃음가스 (비보험 진료 시)', 1, '보험 진료 시 보험 적용']]))}</div><div class="col">${sec('소아 진료 · 장치')}${card('', kv([['데라칼 (Theracal)', 1], ['Nance holding arch', 25], ['Lingual arch', 30], ['SS Crown (기성 금속관)', 11], ['Band(Crown) & Loop', 20], ['할터만 장치 편측', 70], ['할터만 장치 양측', 100]]))}</div>` },
  // ── 구강내과
  { slug: 'tmj', title: '구강내과 비용', sub: '턱 보톡스 · 이갈이 장치', body: `<div class="col">${sec('턱 보톡스')}${rows([
    { tag: '국내', name: '원더톡스', price: 15 }, { tag: '독일', tagGold: true, name: '제오민 (XEOMIN)', desc: '불순 단백질을 제거한 독일 프리미엄 보툴리눔 톡신', price: 35, hi: true },
  ])}</div><div class="col">${sec('이갈이 · 턱관절')}${rows([{ name: '이갈이 장치 (스플린트)', desc: '맞춤 제작 · 월 진료비 10,000원 별도', price: 100 }])}${card('안내', bul(['이갈이 장치는 제작 후 정기 조정이 필요하며 월 진료비는 10,000원입니다.', '턱 보톡스는 개인별 근육량에 따라 용량이 조정될 수 있습니다.']))}</div>` },
  { slug: 'hygiene', title: '스테인 제거 · 지혈제', sub: '착색 제거와 발치·수술 시 사용하는 지혈 재료', body: `<div class="col">${sec('스테인 착색 제거')}${rows([{ name: '에어플로우 (EMS AIRFLOW)', desc: '고운 파우더 분사로 커피·담배 착색 제거 · 1악당', price: 5 }])}<div class="note" style="margin-top:4px">EMS AIRFLOW Prophylaxis Master 장비를 사용합니다.</div></div><div class="col">${sec('지혈제')}${rows([
    { name: '큐탄플라스트 (젤라틴 지혈 스펀지)', desc: '무균 젤라틴 스펀지 · 혈전 형성을 도와 자연 응고 유도 · 표준 재료', price: 1 },
    { tag: '프리미엄', tagGold: true, name: '본트리 큐브 (콜라겐 지혈 스펀지)', desc: 'Type 1 콜라겐 + 식물성 키토산 · 우수한 지혈 · 99.9% 항균 · 낮은 알러지 위험', price: 7, hi: true },
  ])}</div>` },
  { slug: 'event', eyebrow: '이벤트 안내', title: '이달의 이벤트', sub: '기간과 조건은 데스크에서 확인해 주세요', body: `<div class="col">${sec('턱 보톡스')}${rows([{ tag: 'EVENT', tagGold: true, name: '원더톡스 (국내)', was: 15, price: 4.9, hi: true }])}</div><div class="col">${sec('원데이 치아미백')}${rows([{ tag: 'EVENT', tagGold: true, name: '1회 · 30분', was: 30, price: 4.9, hi: true }, { tag: 'EVENT', tagGold: true, name: '2회 · 60분', was: 60, price: 8, hi: true }])}</div>`, footNote: '이벤트 가격은 해당 기간에만 적용됩니다.' },
  // ── 주의사항(notice)
  { slug: 'warranty', eyebrow: '보증 안내', title: '보철 보증 기간', sub: '서울비디치과 보철물 보증 기준', body: `<div class="col">${sec('일반 보철 (크라운 · 인레이) · 글로우네이트')}${warr(WARR_GEN)}${sec('임플란트 보철')}${warr(WARR_IMP)}</div><div class="col" style="flex:.7">${card('보증 적용 조건', bul(['보증 비율은 재제작 비용에서 본원이 부담하는 비율입니다.', '본원이 안내한 정기 검진 주기를 준수하실 때 보증이 유지됩니다.', '외상·부주의로 인한 파손은 보증 범위와 다를 수 있으니 상담해 주세요.']))}</div>` },
  { slug: 'dental-insurance', eyebrow: '보험 안내', title: '치아 보험과 치과 치료', sub: '가입하신 보험으로 보장받으려면 미리 확인해 주세요', body: `<div class="col">${card('치아 보험', bul(['라이나, 에이스, 메리츠, 한화, DB, KB 등 다양한 보험사가 있습니다.', '임플란트, 크라운, 인레이, 레진, 파노라마 촬영, 치주치료, 발치 등이 보장됩니다.', '보험사·상품마다 보장 내역이 다르며, 가입 후 면책기간과 보장 개시일을 꼭 확인하세요.', '임플란트 식립은 보통 연 3개로 제한되며, 발치 기준인지 식립 기준인지 보험사마다 다릅니다.', '보험 약관이 모두 다르니 콜센터 연결 후 체크가 필요합니다.']))}${card('필요 서류', bul(['<b style="color:#3a2718">임플란트</b> 차트 사본, 전·후 파노라마, 보험사 치료확인서 (상황에 따라 세부내역서·영수증)', '<b style="color:#3a2718">보존치료</b> 보험사 치료확인서 (보험사마다 서류 내용이 다르니 확인 필요)']))}</div><div class="col" style="flex:.85">${card('생명보험 · 종신보험 <span class="tag" style="margin-left:8px">본원 수술확인서 필요</span>', bul(['수술특약으로 치조골 이식술이 포함된 경우 혜택이 있습니다.', '1일 1개의 임플란트는 수술로 인정됩니다.', '여러 개 진행 시 1일 1개씩, 매회 치조골 이식 내용이 들어가야 합니다.']))}${card('실손보험 (실비보험) <span class="tag" style="margin-left:8px">영수증 필요</span>', bul(['병·의원 및 약국에서 실제 지출한 의료비·약제비를 보상해 주는 보험입니다.', '보험 임플란트나 사랑니 발치 등 건강보험이 적용되는 항목에 대해 가능합니다.']))}</div>` },
  { slug: 'partners', eyebrow: '제휴 혜택 안내', title: '제휴업체 혜택 안내', sub: '해당 기관 임직원·가족은 접수 시 미리 말씀해 주세요', body: `<div class="col"><div class="chips">${['지방부수리', '선문대학교', '갤러리아 (the galleria)', '현대 (HYUNDAI)', 'we라이브병원', 'NIFCO', 'CITY GYM', 'UNION SOLUTION', '삼성 (SAMSUNG)', '숯불구이 천지연 · 송도갈비', '예지슬유치원', '쌍용종합사회복지관 · 쌍용어린이집', 'Coffee Mellow', '서울대정병원', '천안교차로', '충남개인택시조합', '하나마이크론 · 하나머티리얼즈', '천안 스노우의원', '나은필병원', '아이본안과', '순천향대학교', '천안시장애인종합복지관', 'CENO', '(주)케이엠티이엔지', '삼성미라클안과 천안'].map(n => `<div class="chip">${n}</div>`).join('')}</div><div class="grid2" style="margin-top:8px">${card('혜택 적용 방법', bul(['제휴업체 대상에 해당하시는 분은 미리 말씀해 주시면 확인 후 혜택을 적용해 드립니다.']))}${card('확인 절차', bul(['간단한 확인 절차 진행 후 협약에 따른 혜택이 적용됩니다.']))}</div></div>` },
  // ── 설명자료(explain): 임플란트 브랜드
  { slug: 'brand-osstem', eyebrow: '임플란트 브랜드 안내', title: '오스템 임플란트', sub: '국내 1위 브랜드 · SOI와 CA 표면 처리의 차이', body: `<div class="col">${card('SOI <span class="tag gold" style="margin-left:8px">Super Osseointegration</span>', bul(['빠르고 풍부한 혈병 형성으로 지혈 효과와 빠른 골 융합을 돕습니다.', 'SOI 코팅 표면 · 탁월한 골형성 단백질 부착', '초친수성 표면 · 치료 기간 단축']))}</div><div class="col">${card('CA <span class="tag" style="margin-left:8px">Calcium</span>', bul(['칼슘 수용액의 표면 활성화 에너지로 치료 기간을 단축합니다.', '탁월한 혈액 젖음성 · 빠른 혈병 형성', '우수한 세포 유효성 · 우수한 골조직 형성']))}${card('비교', bul(['SOI는 CA의 장점에 골형성 단백질 부착력을 더한 최상위 라인입니다.', '두 제품 모두 오랜 기간 임상으로 검증된 오스템 정품입니다.']))}</div>` },
  { slug: 'brand-straumann', eyebrow: '임플란트 브랜드 안내', title: '스트라우만 임플란트', sub: '세계 1위 스위스 프리미엄 임플란트', body: `<div class="col"><div class="grid2">${[
    ['SLA 액티브 표면 처리', '친수성 표면이 혈액과 단백질 흡착을 촉진해 빠른 골유착을 유도합니다.'],
    ['프리미엄 록솔리드 합금', '티타늄보다 1.8배 강한 재질(티타늄+지르코니아 합성)로 구성됩니다.'],
    ['10년 이상의 장기 내구성', '임상 데이터 기준 99.7% 이상이 10년 이상 사용됩니다.'],
    ['정밀한 결합 안정성', '높은 정밀도의 나사 구조로 오랜 기간 흔들림 없이 사용할 수 있습니다.'],
  ].map(([h, p]) => `<div class="tile"><h4>${h}</h4><p>${p}</p></div>`).join('')}</div></div><div class="col" style="flex:.9">${card('나사 풀림 · 파절', bul(['씹는 힘에도 결합력이 우수해 나사 풀림과 파절 현상을 최소화합니다.', '풀림이 생겨도 구조적으로 재조정·수리가 용이합니다.']))}${card('수명 · 뼈이식', bul(['뿌리(고정체)-기둥(지대주)-보철 구조로 정기검진 시 반영구적 사용이 가능합니다.', '뼈와 직접 결합되는 구조로 안정성이 우수하며, 필요 시 식립 전 또는 동시에 뼈이식이 가능합니다 (CT 확인 후 결정).', '뼈 손실이 적어 재식립이나 유지 관리에도 유리합니다.']))}</div>` },
]

const only = process.argv.slice(2)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
const pg = await ctx.newPage()
for (const p of PAGES) {
  if (only.length && !only.includes(p.slug)) continue
  await pg.setContent(page(p), { waitUntil: 'networkidle' })
  await pg.evaluate(() => document.fonts.ready)
  const overflow = await pg.evaluate(() => { const b = document.querySelector('.body'); return b.scrollHeight - b.clientHeight })
  await pg.screenshot({ path: path.join(OUT, p.slug + '.png'), type: 'png' })
  console.log(p.slug, overflow > 0 ? `OVERFLOW +${overflow}px` : 'ok')
}
await browser.close()
