// Isolated localhost tests. ffmpeg generates a synthetic silent clip; no real patient media.
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='http://localhost:3000', hid=900021;
const token=id=>{const p=`${id}.${Date.now()+3600000}`;return p+'.'+createHmac('sha256','pc-dev-session-secret').update(p).digest('base64url')};
const sql=q=>execFileSync('npx',['wrangler','d1','execute','patient-connect-production','--local','--persist-to','.wrangler/category-tests','--command',q],{stdio:'pipe'});
const clean=()=>sql('DELETE FROM views WHERE dispatch_id IN (SELECT id FROM dispatches WHERE hospital_id=900021); DELETE FROM dispatches WHERE hospital_id=900021; DELETE FROM scoped_annotations WHERE hospital_id=900021; DELETE FROM material_sets WHERE hospital_id=900021; DELETE FROM materials WHERE hospital_id=900021; DELETE FROM hospitals WHERE id=900021;');
async function api(path,body,method=body===undefined?'GET':'POST'){
 if(path==='/dispatches'&&method==='POST'){const pre=await api('/dispatches/preview',body,'POST');if(pre.status!==200)return pre;body={...body,confirmed:true,preview_hash:pre.data.preview_hash,request_key:crypto.randomUUID()}}
const r=await fetch(base+'/api'+path,{method,headers:{Cookie:'pc_session='+token(hid),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
async function upload(id,bytes,type,name){const form=new FormData();form.set('file',new Blob([bytes],{type}),name);const r=await fetch(base+`/api/materials/${id}/images`,{method:'POST',headers:{Cookie:'pc_session='+token(hid)},body:form});return{status:r.status,data:await r.json()}}
let checks=0;const check=(ok,msg)=>{assert(ok,msg);checks++;console.log('PASS',msg)};
fs.mkdirSync('.test-results',{recursive:true});
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x386cc4:s=320x180:r=12','-t','1','-c:v','libvpx','-an','.test-results/media-fixture.webm']);
const bytes=fs.readFileSync('.test-results/media-fixture.webm');
clean();sql("INSERT INTO hospitals (id,ps_hospital_id,name) VALUES (900021,'media-qa','이미지 목업 치과');");
const browser=await chromium.launch();
try {
 await api('/materials/examples',{confirmed:true});let all=(await api('/materials')).data.materials;
 check(all.length===8&&all.every(m=>m.images.length===1),'Eight sample records contain actual image references');
 for(const m of all){const r=await fetch(base+'/a/'+m.images[0].key);const b=new Uint8Array(await r.arrayBuffer());check(r.status===200&&r.headers.get('content-type').startsWith('image/png')&&b[0]===137,`Mockup image resolves: ${m.category}`)}
 check((await fetch(base+'/a/examples/not-allowed.png')).status===404,'Only enumerated public sample image paths bypass private media auth');
 const first=all[0];sql(`UPDATE materials SET images_json='[]' WHERE id=${first.id};`);
 await api('/materials/'+first.id,{...first,title:'병원에서 수정한 설명'},'PUT');
 check((await api('/material-library')).data.missing_images===1,'Old text-only example can be detected for upgrade');
 const upgraded=(await api('/materials/examples',{confirmed:true})).data;
 all=(await api('/materials')).data.materials;
 check(upgraded.added===0&&upgraded.updated===1&&all.find(m=>m.id===first.id).title==='병원에서 수정한 설명','Explicit image upgrade fills empty media without duplicating or replacing text');
 const image=fs.readFileSync('public/static/mockups/caries.png');const attached=await upload(first.id,image,'image/png','custom.png');
 check(attached.status===200&&attached.data.images.length===2,'Custom image upload remains available alongside mockup');
 check((await api('/materials/examples',{confirmed:true})).data.updated===0,'Repeated sample import never replaces existing uploaded media');
 const video=(await api('/materials',{kind:'explain',category:'치아교정',title:'검증 영상',body:''})).data.material;
 const uploaded=await upload(video.id,bytes,'video/webm','clip.webm');
 check(uploaded.status===200&&uploaded.data.images[0].media_type==='video','Real WebM fixture uploads with typed video reference');
 const key=uploaded.data.images[0].key;
 check((await fetch(base+'/a/'+key)).status===403,'Anonymous direct video access is denied');
 check((await fetch(base+'/a/'+key,{headers:{Cookie:'pc_session='+token(900022)}})).status===403,'Cross-clinic direct video access is denied');
 const full=await fetch(base+'/a/'+key,{headers:{Cookie:'pc_session='+token(hid)}});
 check(full.status===200&&full.headers.get('content-type')==='video/webm'&&full.headers.get('cache-control').includes('no-store'),'Owned video serves correct MIME and no-store policy');
 const partial=await fetch(base+'/a/'+key,{headers:{Cookie:'pc_session='+token(hid),Range:'bytes=0-15'}});
 check(partial.status===206&&(await partial.arrayBuffer()).byteLength===16&&partial.headers.get('content-range')===`bytes 0-15/${bytes.length}`,'Video range requests return exact bytes for seeking');
 check((await fetch(base+'/a/'+key,{headers:{Cookie:'pc_session='+token(hid),Range:'bytes=99999999-'}})).status===416,'Invalid video byte ranges are rejected');
 const suffix=await fetch(base+'/a/'+key,{headers:{Cookie:'pc_session='+token(hid),Range:'bytes=-8'}});
 check(suffix.status===206&&(await suffix.arrayBuffer()).byteLength===8,'Suffix range reads work');
 check((await upload(video.id,Buffer.from('<script>not a video</script>'),'video/mp4','fake.mp4')).status===400,'Spoofed video content is rejected');
 const before=(await api('/materials',{kind:'before_after',title:'비교용'})).data.material;
 check((await upload(before.id,bytes,'video/webm','clip.webm')).status===400,'Before-after materials remain image-only');
 const published=(await api('/dispatches',{channel:'link',material_ids:[video.id,first.id]})).data;
 check((await fetch(base+'/a/'+key+'?t='+published.token)).status===200,'Valid guide token can fetch only its included video');
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.addCookies([{name:'pc_session',value:token(hid),url:base}]);const p=await ctx.newPage(), errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/app');await p.waitForSelector('.media-card-cover');await p.waitForFunction(()=>[...document.querySelectorAll('.media-card-cover>img')].every(i=>i.complete&&i.naturalWidth>0));
 check(await p.locator('.media-card-cover>img').count()===8,'Library displays loaded image thumbnails instead of text-only placeholders');
 await p.waitForTimeout(400);await p.screenshot({path:'.test-results/image-library-desktop.png',fullPage:true});
 await p.locator(`[data-preview="${first.id}"]`).click();await p.locator('#session-clean').click();await p.waitForSelector('.media-stage img');
 check(await p.locator('.media-stage img').count()===2,'Thumbnail click opens full-size image-first presentation');
 check(await p.locator('.media-supplement').getAttribute('open')===null,'Long text stays optional rather than competing with the image');await p.screenshot({path:'.test-results/image-presentation.png'});await p.locator('#cl').click();
 await p.locator(`[data-preview="${video.id}"]`).click();await p.locator('#session-clean').click();await p.waitForSelector('.present video');
 await p.locator('.present video').evaluate(async v=>{v.muted=true;await v.play()});
 check(await p.locator('.present video').evaluate(v=>v.readyState>=2),'Uploaded video plays in the explanation screen');await p.locator('#cl').click();
 const guest=await browser.newPage({viewport:{width:390,height:844}});await guest.goto(base+'/g/'+published.token);await guest.waitForSelector('video');await guest.locator('video').evaluate(async v=>{v.muted=true;await v.play()});
 check(await guest.locator('video').evaluate(v=>v.readyState>=2),'Patient handout plays the token-authorized video');
 check(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Image and video handout fits mobile');
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'.test-results/image-library-mobile.png',fullPage:true});
 const gallery=await browser.newPage();await gallery.goto(base+'/static/mockups/index.html');await gallery.locator('img').last().scrollIntoViewIfNeeded();await gallery.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth===1200));
 check(await gallery.locator('article').count()===8,'Public mockup gallery loads eight real PNG images');
 check(errors.length===0,'Media workflows produce no uncaught browser errors');
 fs.writeFileSync('.test-results/material-media-results.json',JSON.stringify({checks,errors},null,2));console.log(`${checks} media checks passed`);
}finally{await browser.close();clean();}
