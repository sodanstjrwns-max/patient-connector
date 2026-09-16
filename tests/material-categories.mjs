// Local-only integration/browser checks. Requires local Wrangler with category-tests state.
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = 'http://localhost:3000';
const dbArgs = ['wrangler', 'd1', 'execute', 'patient-connect-production', '--local', '--persist-to', '.wrangler/category-tests'];
function sql(command) { execFileSync('npx', [...dbArgs, '--command', command], {stdio:'pipe'}); }
const clinic = 900001;
const cookie = (id) => { const payload = `${id}.${Date.now() + 3600000}`; return 'pc_session=' + payload + '.' + createHmac('sha256', 'pc-dev-session-secret').update(payload).digest('base64url'); };
async function request(path, method='GET', body, id=clinic) {
 const r=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie(id),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json()};
}
let count=0; const check=(value,label)=>{assert(value,label);count++;console.log('PASS',label);};
sql("INSERT OR IGNORE INTO hospitals (id, ps_hospital_id, name) VALUES (900001, 'category-qa', '분류검증 치과'), (900002, 'category-qa-other', '다른검증 치과'); DELETE FROM views WHERE dispatch_id IN (SELECT id FROM dispatches WHERE hospital_id=900001); DELETE FROM dispatches WHERE hospital_id=900001; DELETE FROM materials WHERE hospital_id=900001;");
const browser=await chromium.launch();
try {
 const fixtures=[['explain','임플란트 과정','임플란트'],['disease','잇몸질환 이해','잇몸'],['cost','임플란트 비용','임플란트'],['before_after','교정 전후','교정'],['notice','발치 후 주의사항','임플란트']];
 const saved=[];
 for(const [kind,title,category] of fixtures){const r=await request('/materials','POST',{kind,title,category,body:'첫 번째 설명\n- 두 번째 설명',cost:kind==='cost'?[{name:'검증 항목',price:10000,qty:2}]:[]});check(r.status===200&&r.data.material.kind===kind,`API saves ${kind} without falling back to explain`);saved.push(r.data.material);}
 check((await request('/materials')).data.materials.length===5,'All existing and new kinds remain visible');
 check((await request('/materials','GET',undefined,900002)).data.materials.length===0,'New kind remains clinic-scoped');
 check((await request('/materials/'+saved[1].id,'PUT',saved[1],900002)).status===404,'Other clinic cannot reclassify disease material');
 const dispatch=await request('/dispatches','POST',{material_ids:saved.map(m=>m.id),channel:'link'});
 check(dispatch.data.status==='link','Mixed categories can be published as link without sending messages');
 const ctx=await browser.newContext({viewport:{width:1360,height:920}});
 await ctx.addCookies([{name:'pc_session',value:cookie(clinic).slice(11),url:base}]);
 const page=await ctx.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/app');await page.waitForSelector('[data-kind-filter]');
 check(await page.locator('[data-kind-filter]').count()===5,'Library has All plus four requested category tabs');
 check(await page.locator('[data-kind-filter="explain"] span').innerText()==='2','Treatment count includes legacy precautions');
 await page.locator('[data-kind-filter="explain"]').click();
 check(await page.locator('[data-add]').count()===2,'Treatment filter includes explanations and precautions');
 await page.locator('[data-kind-filter="disease"]').click();
 check(await page.locator('[data-add]').count()===1&&(await page.locator('#material-grid').innerText()).includes('잇몸질환 이해'),'Disease filter is independent');
 await page.locator('[data-cat="충치"]').click();
 check((await page.locator('#main').innerText()).includes('선택한 조건에 맞는 자료가 없습니다'),'Type and disease-topic filters combine precisely');
 await page.locator('#reset-filters').click();
 check(await page.locator('[data-add]').count()===5,'Reset restores complete library');
 await page.locator('[data-kind-filter="explain"]').click();await page.locator('[data-cat="임플란트"]').click();await page.locator('#q').fill('발치');
 check(await page.locator('[data-add]').count()===1,'Search combines with category and treatment topic');
 await page.locator('[data-edit]').click();
 check(await page.locator('#editor [data-kind]').count()===4,'Editor offers only four new material types');
 check((await page.locator('#editor').innerText()).includes('기존 주의사항 자료입니다'),'Legacy precaution editor explains compatibility');
 await page.locator('#ed-title').fill('발치 후 주의사항 수정');await page.locator('#ed-save').click();await page.waitForSelector('#editor',{state:'detached'});
 check((await request('/materials')).data.materials.find(m=>m.id===saved[4].id).kind==='notice','Editing legacy title preserves notice kind');
 await page.locator('#q').fill('');await page.locator('[data-kind-filter="disease"]').click();await page.locator('[data-cat=""]').click();await page.locator('#new').click();
 check(await page.locator('[data-kind="disease"]').getAttribute('aria-pressed')==='true','Registering from disease tab preselects disease');
 await page.locator('#ed-title').fill('충치의 진행');await page.locator('.supplemental-body > summary').click();await page.locator('#ed-body').fill('본문 첫 줄\n- 두 번째 항목');await page.locator('#ed-save').click();await page.waitForSelector('#ed-del');await page.locator('#ed-close').click();
 await page.reload();await page.waitForSelector('[data-kind-filter]');await page.locator('[data-kind-filter="disease"]').click();
 check(await page.locator('[data-add]').count()===2,'New disease material persists across reload');
 await page.locator('[data-edit]').first().click();await page.locator('[data-kind="explain"]').click();await page.locator('#ed-save').click();await page.waitForSelector('#editor',{state:'detached'});
 check(await page.locator('[data-add]').count()===1,'Reclassification updates the current filter immediately');
 await page.locator('[data-add]').first().click();await page.locator('[data-tab="present"]').click();await page.locator('#go').click();
 check((await page.locator('.present').innerText()).includes('질환설명'),'Presentation shows disease label and content');await page.locator('#cl').click();
 await page.locator('[data-tab="send"]').click();
 check((await page.locator('#main').innerText()).includes('질환설명'),'Sending list keeps selected disease type');
 await page.locator('[data-tab="library"]').click();await page.locator('[data-kind-filter=""]').click();
 fs.mkdirSync('.test-results',{recursive:true});await page.screenshot({path:'.test-results/material-categories-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 check(await page.locator('.material-kind-tabs').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),'Category strip fits mobile and scrolls within its bounds');
 await page.locator('[data-kind-filter="before_after"]').click();
 check(await page.locator('[data-add]').count()===1,'Last mobile category is selectable');
 await page.screenshot({path:'.test-results/material-categories-mobile.png',fullPage:true});
 const patient=await browser.newPage({viewport:{width:390,height:844}});patient.on('pageerror',e=>errors.push(e.message));await patient.goto(base+'/g/'+dispatch.data.token);await patient.waitForSelector('[data-i]');
 const text=await patient.locator('#app').innerText();
 check(['진료설명','질환설명','비용설명','비포애프터','주의사항'].every(s=>text.includes(s)),'Patient guide renders all new and legacy category labels');
 check(text.includes('20,000원')&&text.includes('치료 전')&&text.includes('치료 후'),'Cost calculations and before-after layout remain intact');
 check(text.includes('발치 후 주의사항')&&!text.includes('발치 후 주의사항 수정'),'Previously published snapshots remain unchanged after editing');
 check(errors.length===0,'No uncaught browser errors');
 fs.writeFileSync('.test-results/material-categories-results.json',JSON.stringify({checks:count,errors},null,2));
 console.log(`${count} category checks passed`);
}finally{
 await browser.close();
 sql('DELETE FROM views WHERE dispatch_id IN (SELECT id FROM dispatches WHERE hospital_id=900001); DELETE FROM dispatches WHERE hospital_id=900001; DELETE FROM materials WHERE hospital_id=900001; DELETE FROM hospitals WHERE id IN (900001,900002);');
}
