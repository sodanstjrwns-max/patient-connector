// Real merged Hono routes + in-process SQLite. Provider Fetch is mocked; no external sends.
import { DatabaseSync } from 'node:sqlite';
import { build, transform } from 'esbuild';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const mod=code=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const result=await build({entryPoints:['src/index.tsx'],bundle:true,write:false,format:'esm',platform:'browser'});
const app=(await mod(result.outputFiles[0].text)).default;
const util=await mod((await transform(fs.readFileSync('src/lib/util.ts','utf8'),{loader:'ts',format:'esm'})).code);
const sqlite=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('migrations/'+f,'utf8'));
const DB={
 prepare(sql){
  const query=sqlite.prepare(sql);let params=[];
  return {
   bind(...args){params=args;return this},
   async first(){return query.get(...params)||null},
   async all(){return {results:query.all(...params)}},
   async run(){const r=query.run(...params);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}
  };
 }
};
DB.batch=async statements=>Promise.all(statements.map(s=>s.run()));
const env={DB,SESSION_SECRET:'qa',PHONE_ENC_KEY:'qa-phone',PS_SERVICE_KEY:'qa-service',APP_BASE_URL:'https://connect.patientfunnel.kr',SOLAPI_API_KEY:'mock',SOLAPI_API_SECRET:'mock',PLATFORM_PF_ID:'mock',CONNECT_TEMPLATE_ID:'mock'};
const cookie=id=>{const p=`${id}.${Date.now()+3600000}`;return 'pc_session='+p+'.'+createHmac('sha256','qa').update(p).digest('base64url')};
async function call(path,body={},id=1,extra={}){const r=await app.request('http://localhost/api'+path,{method:'POST',headers:{Cookie:cookie(id),'Content-Type':'application/json',...extra},body:JSON.stringify(body)},env);return{status:r.status,data:await r.json()}};
const get=async path=>{const r=await app.request('http://localhost/api'+path,{headers:{Cookie:cookie(1)}},env);return r.json()};
sqlite.exec("INSERT INTO hospitals(id,ps_hospital_id,name) VALUES(1,'qa','QA clinic'),(2,'other','Other clinic'); INSERT INTO materials(id,hospital_id,kind,title) VALUES(1,1,'explain','QA material')");
const phone='01000000000',encrypted=await util.encPhone(phone,env.PHONE_ENC_KEY),hashed=await util.phoneHash(phone,1);
const snapshot=[{id:1,kind:'explain',title:'QA material',body:'',images:[],cost:[],annotations:[]}];
function seed(extra={}){sqlite.exec('DELETE FROM optouts; DELETE FROM dispatches');sqlite.prepare("INSERT INTO dispatches(id,hospital_id,token,phone_enc,phone_hash,phone_last4,materials_json,channel,status,request_key,expires_at) VALUES(1,1,?,?,?,?,?,'alimtalk','failed','safe-original',datetime('now','+30 days'))").run('a'.repeat(32),encrypted,hashed,'0000',JSON.stringify(snapshot));for(const [key,value]of Object.entries(extra))sqlite.prepare('UPDATE dispatches SET '+key+'=? WHERE id=1').run(value)}
let checks=0,sends=0;const check=(v,msg)=>{assert(v,msg);checks++;console.log('PASS',msg)};
const realFetch=globalThis.fetch;
try {
 globalThis.fetch=async(url,opt)=>{assert(String(url).startsWith('https://api.solapi.com/'));assert.equal(opt.method,'POST');sends++;await new Promise(r=>setTimeout(r,25));return new Response(JSON.stringify({groupInfo:{groupId:'mock-group-'+sends}}),{status:200})};
 seed();check((await call('/dispatches/1/resend',{preview:true},2)).status===404,'Resend rejects other clinic');
 for(const status of ['link','accepted','sent','delivered','unknown','created','retrying','retry_failed']){seed({status});check((await call('/dispatches/1/resend',{preview:true})).status===409,'Resend rejects status '+status)}
 seed({created_at:'2020-01-01 00:00:00'});check((await call('/dispatches/1/resend',{preview:true})).status===400,'Expired phone is rejected even before purge runs');
 seed({expires_at:'2020-01-01 00:00:00'});check((await call('/dispatches/1/resend',{preview:true})).status===400,'Expired handout cannot be resent');
 seed({request_key:null});check((await call('/dispatches/1/resend',{preview:true})).status===409,'Legacy ambiguous failures require provider confirmation');
 seed();sqlite.prepare('INSERT INTO optouts(hospital_id,phone_hash) VALUES(1,?)').run(hashed);check((await call('/dispatches/1/resend',{preview:true})).status===409,'Resend honors optout using decrypted number hash');
 seed();check((await call('/dispatches/1/resend',{preview:true},1,{Origin:'https://evil.invalid'})).status===403,'Resend has cross-origin mutation protection');
 check((await call('/dispatches/1/resend',{})).status===409,'Resend requires explicit preflight and acknowledgement');
 const preview=await call('/dispatches/1/resend',{preview:true});check(preview.status===200&&sends===0,'Retry preview sends nothing');
 check(!JSON.stringify(preview).includes(phone),'Retry preview never exposes raw phone number');
 check((await call('/dispatches/1/resend',{confirmed:true,preview_hash:'stale'})).status===409,'Retry verifies preview digest');
 const payload={confirmed:true,preview_hash:preview.data.preview_hash};
 const both=await Promise.all([call('/dispatches/1/resend',payload),call('/dispatches/1/resend',payload)]);
 check(sends===1&&both.filter(r=>r.status===200).length===1,'Concurrent resend clicks claim exactly one provider call');
 check(sqlite.prepare('SELECT status FROM dispatches').get().status==='accepted','Retry acknowledgement remains accepted not delivered');
 check((await call('/dispatches/1/resend',payload)).status===409&&sends===1,'Repeating completed retry never sends again');
 sqlite.exec("UPDATE dispatches SET status='failed' WHERE id=1");check((await call('/dispatches/1/resend',payload)).status===409,'Stale confirmation cannot retry a later delivery attempt');
 seed();const beforeOpt=await call('/dispatches/1/resend',{preview:true});sqlite.prepare('INSERT INTO optouts(hospital_id,phone_hash) VALUES(1,?)').run(hashed);check((await call('/dispatches/1/resend',{confirmed:true,preview_hash:beforeOpt.data.preview_hash})).status===409,'Optout is rechecked after preview');
 seed();const beforeDelete=await call('/dispatches/1/resend',{preview:true});sqlite.exec('UPDATE materials SET active=0');check((await call('/dispatches/1/resend',{confirmed:true,preview_hash:beforeDelete.data.preview_hash})).status===409,'Deleted material blocks resend after preview');sqlite.exec('UPDATE materials SET active=1');
 seed();const pending=await call('/dispatches/1/resend',{preview:true});globalThis.fetch=async()=>{sends++;throw new Error('lost response')};
 check((await call('/dispatches/1/resend',{confirmed:true,preview_hash:pending.data.preview_hash})).data.status==='unknown','Network ambiguity is stored as unknown');
 check((await call('/dispatches/1/resend',{preview:true})).status===409,'Unknown retry cannot be sent again');
 seed();const rejected=await call('/dispatches/1/resend',{preview:true});globalThis.fetch=async()=>{sends++;return new Response('{}',{status:400})};
 check((await call('/dispatches/1/resend',{confirmed:true,preview_hash:rejected.data.preview_hash})).data.status==='retry_failed','Definite retry rejection has a terminal status');
 check((await call('/dispatches/1/resend',{preview:true})).status===409,'Rejected retry is not automatically repeated');
 // Retention route requires service key and fails visibly on SQL errors.
 seed({created_at:'2020-01-01 00:00:00'});
 check((await call('/v1/ops/purge')).status===401,'Purge requires service authorization');
 check(sqlite.prepare('SELECT phone_enc FROM dispatches').get().phone_enc===encrypted,'Unauthorized purge changes nothing');
 const purged=await call('/v1/ops/purge',{},1,{Authorization:'Bearer qa-service'});
 check(purged.data.purged===1&&sqlite.prepare('SELECT phone_enc FROM dispatches').get().phone_enc===null,'Authorized purge removes old encrypted phone');
 check(sqlite.prepare('SELECT phone_last4 FROM dispatches').get().phone_last4==='0000','Purge preserves last four digits');
 seed();check((await call('/v1/ops/purge',{},1,{Authorization:'Bearer qa-service'})).data.purged===0,'Purge preserves unexpired encrypted number');
 seed({created_at:'2020-01-01 00:00:00'});await get('/me');check(sqlite.prepare('SELECT phone_enc FROM dispatches').get().phone_enc===null,'App access triggers lazy retention cleanup');
 const originalPrepare=DB.prepare;DB.prepare=()=>{throw new Error('DB unavailable')};check((await call('/v1/ops/purge',{},1,{Authorization:'Bearer qa-service'})).status===500,'Failed purge does not falsely report success');DB.prepare=originalPrepare;
 check((await get('/me')).base_url==='https://connect.patientfunnel.kr','Merged config supports canonical production domain');
 fs.writeFileSync('.test-results/git-sync-results.json',JSON.stringify({checks,provider_calls_mocked:sends,real_messages_sent:0},null,2));console.log(`${checks} Git sync checks passed`);
} finally {globalThis.fetch=realFetch;sqlite.close()}
