import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie } from 'hono/cookie'
import { serveStatic } from 'hono/cloudflare-workers'
import { hashPassword, verifyPassword, randomToken, getUser, requireUser, requireClinic, newSession, sessionToken, rateLimit, type Bindings } from './auth'
import { fail, text, idOf, parseAsset, canEdit, assetFor, validateAsset, checkMediaOwnership, mediaURL, snapshot, activeShare, shareSlides, urlsIn, withShareUrls } from './security'
import { pageHome, pageConsult, pageCases, pageManage, pageAdmin, pageLogin, pageShare, pageNotFound } from './pages'
const app = new Hono<{ Bindings: Bindings }>()
app.use('*', async (c,next) => {
  c.header('X-Content-Type-Options','nosniff'); c.header('Referrer-Policy','no-referrer'); c.header('X-Frame-Options','DENY')
  c.header('Permissions-Policy','camera=(), microphone=(), geolocation=()')
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/p/') || c.req.path.startsWith('/files/')) c.header('Cache-Control','private, no-store')
  if (c.req.path.startsWith('/p/') || c.req.path.startsWith('/files/') || c.req.path.startsWith('/cases')) c.header('X-Robots-Tag','noindex, nofollow, noarchive')
  if (!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin')
    if ((origin && origin !== new URL(c.req.url).origin) || c.req.header('Sec-Fetch-Site') === 'cross-site') return c.json({error:'다른 사이트에서 보낸 요청은 허용하지 않습니다.'},403)
    if (c.req.path !== '/api/upload' && !c.req.header('Content-Type')?.includes('application/json')) return c.json({error:'JSON 요청이 필요합니다.'},415)
  }
  await next()
})
app.use('/api/*', bodyLimit({maxSize:12*1024*1024,onError:c=>c.json({error:'요청이 너무 큽니다. 파일은 10MB, 상담은 40장 이내로 나누어 주세요.'},413)}))
app.onError((err,c)=> {
  if(err instanceof HTTPException) return c.json({error:err.message},err.status)
  if(err instanceof SyntaxError) return c.json({error:'입력 형식을 확인해 주세요.'},400)
  console.error('Request failed',c.req.method,c.req.path.replace(/\/share\/[^/]+/, '/share/[token]'),err.name)
  return c.json({error:'처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},500)
})
app.use('/static/*',serveStatic({root:'./public'}))
app.use('/manifest.json',serveStatic({root:'./public'}))
app.use('/sw.js',serveStatic({root:'./public'}))

app.get('/ph', c=> {
  const esc=(s:string)=>s.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!))
  const title=esc((c.req.query('t')||'치료 설명자료').slice(0,60)), sub=esc((c.req.query('s')||'').slice(0,100))
  const n=Math.abs(parseInt(c.req.query('v')||'0')||0)%4
  const colors=[['#e9eee6','#54715b'],['#f4ede3','#9c7650'],['#e8edf3','#5f7496'],['#ece9f0','#847096']][n]
  return c.body(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="${colors[0]}"/><circle cx="600" cy="305" r="175" fill="white" opacity=".65"/><circle cx="600" cy="305" r="210" fill="none" stroke="${colors[1]}" opacity=".13"/><g fill="none" stroke="${colors[1]}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M525 260 C510 195 558 175 600 200 C645 175 690 195 675 260 C665 310 650 324 643 380 C635 421 618 414 615 371 C612 327 588 327 585 371 C582 414 565 421 557 380 C550 324 535 310 525 260Z"/><path d="M564 226 Q600 245 636 226" opacity=".4"/><path d="M750 255v38m-19-19h38" stroke-width="5"/></g><text x="70" y="75" font-family="sans-serif" font-size="20" letter-spacing="4" fill="${colors[1]}">PATIENT CONNECT / EDUCATION</text><text x="600" y="592" text-anchor="middle" font-family="sans-serif" font-size="48" font-weight="700" fill="#293c31">${title}</text><text x="600" y="648" text-anchor="middle" font-family="sans-serif" font-size="26" fill="${colors[1]}">${sub}</text><text x="600" y="754" text-anchor="middle" font-family="sans-serif" font-size="19" fill="${colors[1]}">설명용 예시 · 실제 임상 이미지가 아닙니다</text></svg>`,200,{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=3600'})
})

const specialties=['치과','피부·미용','성형외과','정형·재활','안과','한방','기타']
app.post('/api/auth/login',async c=> {
  const b=await c.req.json(),email=text(b.email,254,true).toLowerCase(),password=text(b.password,128,true)
  await rateLimit(c,'login-ip:'+ (c.req.header('CF-Connecting-IP')||'local'),80)
  await rateLimit(c,'login-email:'+email,12)
  const user=await c.env.DB.prepare('SELECT * FROM users WHERE lower(email)=?').bind(email).first<any>()
  const valid=await verifyPassword(password,user?.password_hash||'pbkdf2$100000$00000000000000000000000000000000$'+'0'.repeat(64))
  if(!user||!valid) return c.json({error:'이메일 또는 비밀번호가 올바르지 않습니다.'},401)
  if(!user.password_hash.startsWith('pbkdf2$')) await c.env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(password),user.id).run()
  await newSession(c,user.id)
  return c.json({ok:true})
})
app.post('/api/auth/signup',async c=> {
  await rateLimit(c,'signup:'+(c.req.header('CF-Connecting-IP')||'local'),8,3600)
  const b=await c.req.json(),email=text(b.email,254,true).toLowerCase(),password=text(b.password,128,true),name=text(b.name,100,true),clinic=text(b.clinic_name,150,true)
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('올바른 이메일을 입력해 주세요.')
  if(password.length<10) fail('비밀번호는 10자 이상이어야 합니다.')
  if(!specialties.includes(b.specialty)) fail('진료 분야를 선택해 주세요.')
  if(await c.env.DB.prepare('SELECT id FROM users WHERE lower(email)=?').bind(email).first()) return c.json({error:'이미 가입된 이메일입니다.'},409)
  const hash=await hashPassword(password)
  // D1 batch is transactional; last_insert_rowid links the new clinic without orphan rows.
  const res=await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO clinics(name,phone,specialty) VALUES(?,?,?)').bind(clinic,text(b.phone,30),b.specialty),
    c.env.DB.prepare("INSERT INTO users(clinic_id,email,password_hash,name,role) VALUES(last_insert_rowid(),?,?,?,'owner')").bind(email,hash,name)
  ])
  await newSession(c,Number(res[1].meta.last_row_id));return c.json({ok:true},201)
})
app.post('/api/auth/logout',async c=> {
  await c.env.DB.prepare('DELETE FROM auth_sessions WHERE token=?').bind(sessionToken(c)||'').run()
  deleteCookie(c,'pc_session',{path:'/'});return c.json({ok:true})
})
app.get('/api/auth/me',async c=>c.json({user:await getUser(c)}))
app.post('/api/auth/password',async c=> {
  const u=await requireUser(c), b=await c.req.json(); await rateLimit(c,`password:${u.id}`,6)
  const row=await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(u.id).first<any>()
  if(!await verifyPassword(b.current_password,row.password_hash)) fail('현재 비밀번호가 올바르지 않습니다.')
  const pw=text(b.password,128,true);if(pw.length<10)fail('새 비밀번호는 10자 이상이어야 합니다.')
  await c.env.DB.batch([c.env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(pw),u.id),c.env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(u.id)])
  await newSession(c,u.id);return c.json({ok:true})
})
app.get('/api/clinic',async c=> {const u=await requireUser(c);return c.json({clinic:await c.env.DB.prepare('SELECT * FROM clinics WHERE id=?').bind(requireClinic(u)).first()})})
app.put('/api/clinic',async c=> {const u=await requireUser(c), b=await c.req.json();if(u.role!=='owner')fail('대표 계정만 변경할 수 있습니다.',403);if(!specialties.includes(b.specialty))fail('진료과를 확인해 주세요.');await c.env.DB.prepare('UPDATE clinics SET name=?,phone=?,address=?,emergency_info=?,specialty=? WHERE id=?').bind(text(b.name,150,true),text(b.phone,30),text(b.address,300),text(b.emergency_info,1000),b.specialty,requireClinic(u)).run();return c.json({ok:true})})

app.get('/api/treatments',async c=> {
  const sp=c.req.query('specialty');const {results}=await c.env.DB.prepare('SELECT * FROM treatments WHERE (? IS NULL OR specialty=?) ORDER BY sort_order,id').bind(sp||null,sp||null).all()
  return c.json({treatments:results,specialties})
})
app.get('/api/assets',async c=> {
  const u=await getUser(c),q=(c.req.query('q')||'').slice(0,150),manage=c.req.query('manage')==='1'
  let sql='SELECT a.*,t.name as treatment_name,t.specialty,EXISTS(SELECT 1 FROM favorites f WHERE f.asset_id=a.id AND f.user_id=?) as favorite FROM assets a LEFT JOIN treatments t ON t.id=a.treatment_id WHERE '
  const binds:any[]=[u?.id||0]
  if(manage&&u?.role==='admin') sql+='a.is_public=1'
  else if(manage&&u?.clinic_id) {sql+='a.clinic_id=?';binds.push(u.clinic_id)}
  else {sql+='a.is_hidden=0 AND (a.is_public=1 OR a.clinic_id=?)';binds.push(u?.clinic_id||0)}
  for(const [param,col] of [['treatment','a.treatment_id'],['specialty','t.specialty'],['type','a.type']]) {const v=c.req.query(param);if(v&&v!=='all'){sql+=` AND ${col}=?`;binds.push(v)}}
  const cat=c.req.query('category');if(cat&&cat!=='all'){if(cat==='clinic'){sql+=' AND a.clinic_id=?';binds.push(u?.clinic_id||0)}else{sql+=' AND a.category=?';binds.push(cat)}}
  if(c.req.query('favorite')==='1'){sql+=' AND EXISTS(SELECT 1 FROM favorites f WHERE f.asset_id=a.id AND f.user_id=?)';binds.push(u?.id||0)}
  if(q){sql+=' AND (a.title LIKE ? OR a.description LIKE ? OR a.tags LIKE ?)';binds.push(...Array(3).fill(`%${q}%`))}
  const order=c.req.query('sort')==='popular'?'a.use_count DESC':c.req.query('sort')==='new'?'a.id DESC':'a.sort_order,a.id'
  const {results}=await c.env.DB.prepare(sql+` ORDER BY ${order} LIMIT 500`).bind(...binds).all()
  return c.json({assets:results.map(parseAsset)})
})
app.get('/api/assets/:id',async c=>{const a=await assetFor(c.env,c.req.param('id'),await getUser(c));return c.json({asset:parseAsset(a)})})
app.post('/api/assets/:id/use',async c=>{const a=await assetFor(c.env,c.req.param('id'),await getUser(c));await rateLimit(c,'use:'+(c.req.header('CF-Connecting-IP')||'local'),100,60);await c.env.DB.prepare('UPDATE assets SET use_count=use_count+1 WHERE id=?').bind(a.id).run();return c.json({ok:true})})
app.post('/api/assets',async c=> {
  const u=await requireUser(c),b=await c.req.json(),a=validateAsset(b)
  await checkMediaOwnership(c.env,a,u)
  const isPublic=u.role==='admin'&&b.is_public?1:0,clinic=isPublic?null:requireClinic(u)
  const r=await c.env.DB.prepare('INSERT INTO assets(clinic_id,treatment_id,category,type,title,description,media_urls,payload,reviewer_name,tags,is_public,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(clinic,a.treatment_id,a.category,a.type,a.title,a.description,JSON.stringify(a.media_urls),JSON.stringify(a.payload),a.reviewer_name,JSON.stringify(a.tags),isPublic,a.sort_order).run()
  return c.json({ok:true,id:r.meta.last_row_id},201)
})
app.put('/api/assets/:id',async c=> {
  const u=await requireUser(c),raw=await assetFor(c.env,c.req.param('id'),u);if(!canEdit(raw,u))fail('수정 권한이 없습니다.',403)
  const b=await c.req.json(),a=validateAsset({...parseAsset(raw),...b});await checkMediaOwnership(c.env,a,u)
  await c.env.DB.prepare('UPDATE assets SET title=?,description=?,treatment_id=?,category=?,type=?,media_urls=?,payload=?,reviewer_name=?,tags=?,is_hidden=?,sort_order=? WHERE id=?').bind(a.title,a.description,a.treatment_id,a.category,a.type,JSON.stringify(a.media_urls),JSON.stringify(a.payload),a.reviewer_name,JSON.stringify(a.tags),a.is_hidden,a.sort_order,raw.id).run()
  return c.json({ok:true})
})
app.delete('/api/assets/:id',async c=> {
  const u=await requireUser(c),a=await assetFor(c.env,c.req.param('id'),u);if(!canEdit(a,u))fail('삭제 권한이 없습니다.',403)
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM favorites WHERE asset_id=?').bind(a.id),c.env.DB.prepare('DELETE FROM assets WHERE id=?').bind(a.id)])
  return c.json({ok:true})
})
app.post('/api/assets/:id/duplicate',async c=> {
  const u=await requireUser(c),clinic=requireClinic(u),a=await assetFor(c.env,c.req.param('id'),u)
  const r=await c.env.DB.prepare('INSERT INTO assets(clinic_id,source_asset_id,treatment_id,category,type,title,description,media_urls,payload,reviewer_name,tags,is_public) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)').bind(clinic,a.id,a.treatment_id,a.category,a.type,a.title+' · 우리 병원',a.description,a.media_urls,a.payload,a.reviewer_name,a.tags).run();return c.json({ok:true,id:r.meta.last_row_id})
})
app.post('/api/assets/:id/favorite',async c=> {
  const u=await requireUser(c),a=await assetFor(c.env,c.req.param('id'),u),b=await c.req.json()
  await c.env.DB.prepare(b.favorite?'INSERT OR IGNORE INTO favorites(user_id,asset_id) VALUES(?,?)':'DELETE FROM favorites WHERE user_id=? AND asset_id=?').bind(u.id,a.id).run();return c.json({ok:true})
})

app.post('/api/upload',async c=> {
  const u=await requireUser(c);await rateLimit(c,`upload:${u.id}`,60,3600)
  const form=await c.req.formData(),file=form.get('file')
  if(!(file instanceof File)) fail('파일을 선택해 주세요.')
  if(file.size>10*1024*1024)fail('파일은 10MB 이하로 업로드해 주세요.',413)
  const types:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'}
  const ext=types[file.type];if(!ext)fail('JPG, PNG, WebP, MP4, WebM 파일만 지원합니다.')
  const bytes=new Uint8Array(await file.arrayBuffer()),sig=String.fromCharCode(...bytes.slice(0,12))
  const valid=file.type==='image/png'?bytes[0]===137&&sig.slice(1,4)==='PNG':file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:file.type==='image/webp'?sig.startsWith('RIFF')&&sig.slice(8)==='WEBP':file.type==='video/mp4'?sig.slice(4,8)==='ftyp':bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163
  if(!valid)fail('파일 내용과 확장자가 일치하지 않습니다.')
  const key=`clinic${u.clinic_id||'admin'}/${randomToken(20)}.${ext}`
  await c.env.R2.put(key,bytes,{httpMetadata:{contentType:file.type}})
  await c.env.DB.prepare('INSERT INTO uploads(key,clinic_id,user_id,content_type,size) VALUES(?,?,?,?,?)').bind(key,u.clinic_id,u.id,file.type,file.size).run()
  return c.json({url:`/files/${key}`,name:file.name,type:file.type},201)
})
app.get('/files/*',async c=> {
  const key=c.req.path.slice(7),url='/files/'+key
  if(!/^[a-zA-Z0-9/_\-.]+$/.test(key)||key.includes('..'))return c.notFound()
  const u=await getUser(c)
  let allowed=u?.role==='admin'||!!(u?.clinic_id&&key.startsWith(`clinic${u.clinic_id}/`))
  if(!allowed){const publicRef=await c.env.DB.prepare('SELECT id FROM assets WHERE is_public=1 AND is_hidden=0 AND (instr(media_urls,?)>0 OR instr(payload,?)>0) LIMIT 1').bind(JSON.stringify(url),JSON.stringify(url)).first();allowed=!!publicRef}
  // Duplicated public assets remain usable by their owning clinic.
  if(!allowed&&u?.clinic_id)allowed=!!await c.env.DB.prepare('SELECT id FROM assets WHERE clinic_id=? AND (instr(media_urls,?)>0 OR instr(payload,?)>0) LIMIT 1').bind(u.clinic_id,JSON.stringify(url),JSON.stringify(url)).first()
  const token=c.req.query('share')
  if(!allowed&&token){const s=await activeShare(c.env,token);if(s)allowed=urlsIn(await shareSlides(c.env,s)).includes(url)}
  if(!allowed)return c.notFound()
  const obj=await c.env.R2.get(key,{range:c.req.raw.headers});if(!obj)return c.notFound()
  const type=obj.httpMetadata?.contentType||'application/octet-stream'
  if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(type))return c.notFound()
  c.header('Content-Type',type);c.header('Accept-Ranges','bytes');c.header('Content-Disposition','inline')
  if(obj.range&&'offset' in obj.range&&'length' in obj.range){c.header('Content-Range',`bytes ${obj.range.offset}-${obj.range.offset+obj.range.length-1}/${obj.size}`);c.header('Content-Length',String(obj.range.length));return c.body(obj.body,206)}
  c.header('Content-Length',String(obj.size));return c.body(obj.body)
})

app.get('/api/cases',async c=> {
  const u=await getUser(c),t=c.req.query('treatment'),sp=u?.clinic_specialty
  const {results}=await c.env.DB.prepare(`SELECT cs.*,t.name as treatment_name FROM cases cs LEFT JOIN treatments t ON t.id=cs.treatment_id WHERE (cs.clinic_id IS NULL OR cs.clinic_id=?) AND (? IS NULL OR cs.treatment_id=?) AND (? IS NULL OR t.specialty=?) ORDER BY cs.id DESC LIMIT 300`).bind(u?.clinic_id||0,t&&t!=='all'?t:null,t&&t!=='all'?t:null,sp&&sp!=='기타'?sp:null,sp&&sp!=='기타'?sp:null).all()
  return c.json({cases:results.map((r:any)=>({...r,tags:JSON.parse(r.tags||'[]')}))})
})
app.post('/api/cases',async c=> {
  const u=await requireUser(c),clinic=requireClinic(u),b=await c.req.json()
  if(b.consent!==true)fail('사진의 원내 상담 사용에 대한 환자 동의를 확인해 주세요.')
  const before=mediaURL(b.before_url),after=mediaURL(b.after_url)
  if(!before||!after)fail('비포·애프터 사진 두 장이 필요합니다.')
  await checkMediaOwnership(c.env,[before,after],u)
  const r=await c.env.DB.prepare('INSERT INTO cases(clinic_id,treatment_id,title,before_url,after_url,duration,material,doctor,consent) VALUES(?,?,?,?,?,?,?,?,1)').bind(clinic,b.treatment_id?idOf(b.treatment_id):null,text(b.title,180,true),before,after,text(b.duration,100),text(b.material,150),text(b.doctor,100)||u.name).run()
  return c.json({ok:true,id:r.meta.last_row_id})
})
app.delete('/api/cases/:id',async c=> {const u=await requireUser(c);const r=await c.env.DB.prepare('DELETE FROM cases WHERE id=? AND clinic_id=?').bind(idOf(c.req.param('id')),requireClinic(u)).run();if(!r.meta.changes)fail('케이스를 찾을 수 없습니다.',404);return c.json({ok:true})})

// Store each slide separately by asset + sub-index, with server-owned content snapshots.
app.post('/api/sessions',async c=> {
  const u=await requireUser(c),clinic=requireClinic(u),b=await c.req.json()
  if(!Array.isArray(b.slides)||!b.slides.length||b.slides.length>40)fail('상담 자료는 1~40장으로 저장해 주세요.')
  let existing:any=null
  if(b.id){existing=await c.env.DB.prepare('SELECT * FROM consult_sessions WHERE id=? AND clinic_id=?').bind(idOf(b.id),clinic).first();if(!existing)fail('상담을 찾을 수 없습니다.',404);if(Number(b.version)!==existing.version)fail('다른 화면에서 수정된 상담입니다. 새로 열어 확인해 주세요.',409)}
  const oldSlides=JSON.parse(existing?.slides||'[]'),slides:any[]=[],seen=new Set<string>()
  for(const s of b.slides){
    const id=idOf(s.asset_id),sub=Number(s.sub_index)||0,key=`${id}:${sub}`
    if(seen.has(key))fail('중복된 슬라이드입니다.');seen.add(key)
    const old=oldSlides.find((x:any)=>x.asset_id===id&&(x.sub_index||0)===sub)
    const a=old?.asset||snapshot(await assetFor(c.env,id,u))
    const items=a.payload.steps||a.payload.stages||a.media_urls
    if(!Number.isInteger(sub)||sub<0||sub>=Math.max(1,items?.length||0))fail('자료 단계를 확인해 주세요.')
    let drawing_url:string|null=null
    if(s.drawing_png){
      if(typeof s.drawing_png!=='string'||s.drawing_png.length>700000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s.drawing_png))fail('판서 이미지가 너무 크거나 잘못된 형식입니다.')
      const bytes=Uint8Array.from(atob(s.drawing_png.split(',')[1]),ch=>ch.charCodeAt(0));if(bytes[0]!==137||bytes[1]!==80)fail('잘못된 판서 이미지입니다.')
      const fileKey=`clinic${clinic}/drawings/${randomToken(20)}.png`;await c.env.R2.put(fileKey,bytes,{httpMetadata:{contentType:'image/png'}});drawing_url='/files/'+fileKey
    }else if(s.drawing_url){if(s.drawing_url!==old?.drawing_url)fail('다른 상담의 판서는 연결할 수 없습니다.',403);drawing_url=old.drawing_url}
    slides.push({asset_id:id,sub_index:sub,asset:a,note:text(s.note,2000),drawing_url,aspect:Math.min(3,Math.max(.4,Number(s.aspect)||1.5))})
  }
  const json=JSON.stringify(slides);if(new TextEncoder().encode(json).length>900000)fail('상담 내용이 너무 많습니다. 나누어 저장해 주세요.',413)
  let id=b.id,version=1
  if(existing){const r=await c.env.DB.prepare("UPDATE consult_sessions SET patient_label=?,slides=?,schedule_note=?,updated_at=datetime('now'),version=version+1 WHERE id=? AND clinic_id=? AND version=?").bind(text(b.patient_label,100),json,text(b.schedule_note,2000),existing.id,clinic,existing.version).run();if(!r.meta.changes)fail('다른 화면에서 수정되었습니다. 새로 열어 주세요.',409);version=existing.version+1}
  else {const r=await c.env.DB.prepare('INSERT INTO consult_sessions(clinic_id,user_id,patient_label,slides,schedule_note) VALUES(?,?,?,?,?)').bind(clinic,u.id,text(b.patient_label,100),json,text(b.schedule_note,2000)).run();id=r.meta.last_row_id}
  return c.json({ok:true,id,version,slides})
})
app.get('/api/sessions',async c=> {
  const u=await requireUser(c),q=(c.req.query('q')||'').slice(0,100)
  const {results}=await c.env.DB.prepare(`SELECT s.id,s.patient_label,s.share_token,s.share_expires_at,s.share_revoked_at,s.share_count,s.version,s.created_at,s.updated_at,json_array_length(s.slides) as slide_count,json_extract(s.slides,'$[0].asset_id') as first_asset_id,(SELECT COUNT(*) FROM share_views v WHERE v.session_id=s.id) as view_count,(SELECT MAX(viewed_at) FROM share_views v WHERE v.session_id=s.id) as last_viewed FROM consult_sessions s WHERE s.clinic_id=? AND s.patient_label LIKE ? ORDER BY s.updated_at DESC,s.id DESC LIMIT 200`).bind(requireClinic(u),`%${q}%`).all()
  return c.json({sessions:results})
})
app.get('/api/sessions/:id',async c=> {const u=await requireUser(c),s=await c.env.DB.prepare('SELECT * FROM consult_sessions WHERE id=? AND clinic_id=?').bind(idOf(c.req.param('id')),requireClinic(u)).first<any>();if(!s)fail('상담을 찾을 수 없습니다.',404);return c.json({session:{...s,slides:JSON.parse(s.slides)}})})
app.delete('/api/sessions/:id',async c=> {const u=await requireUser(c),id=idOf(c.req.param('id'));const s=await c.env.DB.prepare('SELECT id FROM consult_sessions WHERE id=? AND clinic_id=?').bind(id,requireClinic(u)).first();if(!s)fail('상담을 찾을 수 없습니다.',404);await c.env.DB.batch([c.env.DB.prepare('DELETE FROM share_views WHERE session_id=?').bind(id),c.env.DB.prepare('DELETE FROM consult_sessions WHERE id=?').bind(id)]);return c.json({ok:true})})
app.post('/api/sessions/:id/share',async c=> {
  const u=await requireUser(c),b=await c.req.json(),s=await c.env.DB.prepare('SELECT * FROM consult_sessions WHERE id=? AND clinic_id=?').bind(idOf(c.req.param('id')),requireClinic(u)).first<any>()
  if(!s)fail('상담을 찾을 수 없습니다.',404)
  if(!(await shareSlides(c.env,s)).length)fail('전송할 자료가 없습니다. 비포·애프터는 공유에서 제외됩니다.')
  const days=Number(b.days||30);if(![1,7,30,90].includes(days))fail('공유 기간은 1, 7, 30, 90일 중 선택해 주세요.')
  const token=randomToken(24)
  await c.env.DB.prepare("UPDATE consult_sessions SET share_token=?,share_expires_at=datetime('now',?),share_revoked_at=NULL,share_count=share_count+1 WHERE id=?").bind(token,`+${days} days`,s.id).run()
  const ids=[...new Set((await shareSlides(c.env,s)).map(x=>x.asset_id))]
  if(ids.length)await c.env.DB.prepare(`UPDATE assets SET send_count=send_count+1 WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).run()
  return c.json({ok:true,url:`/p/${token}`,token,days})
})
app.delete('/api/sessions/:id/share',async c=> {const u=await requireUser(c);const r=await c.env.DB.prepare("UPDATE consult_sessions SET share_revoked_at=datetime('now') WHERE id=? AND clinic_id=?").bind(idOf(c.req.param('id')),requireClinic(u)).run();if(!r.meta.changes)fail('상담을 찾을 수 없습니다.',404);return c.json({ok:true})})
app.get('/api/share/:token',async c=> {
  const token=c.req.param('token'),s=await activeShare(c.env,token);if(!s)fail('공유가 종료되었거나 유효하지 않은 링크입니다.',404)
  const slides=await shareSlides(c.env,s),clinic=await c.env.DB.prepare('SELECT name,phone,address,emergency_info FROM clinics WHERE id=?').bind(s.clinic_id).first<any>()
  const ids=[...new Set(slides.map(x=>x.asset.treatment_id).filter(Boolean))];let cautions:any[]=[]
  if(ids.length){const r=await c.env.DB.prepare(`SELECT title,description FROM assets WHERE category='caution' AND type!='compare' AND is_hidden=0 AND (is_public=1 OR clinic_id=?) AND treatment_id IN (${ids.map(()=>'?').join(',')}) ORDER BY sort_order`).bind(s.clinic_id,...ids).all();cautions=r.results}
  return c.json({clinic,slides:withShareUrls(slides,token),cautions,patient_label:s.patient_label,schedule_note:s.schedule_note,created_at:s.created_at,expires_at:s.share_expires_at})
})
// Explicit event, deduplicated per browser session; previews by the owning clinic aren't counted.
app.post('/api/share/:token/view',async c=> {
  const token=c.req.param('token'),s=await activeShare(c.env,token);if(!s)fail('공유가 종료되었습니다.',404)
  const u=await getUser(c);if(u?.clinic_id===s.clinic_id)return c.json({ok:true})
  const b=await c.req.json(),visitor=text(b.visitor,100,true)
  await rateLimit(c,`view:${s.id}:${visitor}`,1,1800)
  await c.env.DB.prepare('INSERT INTO share_views(session_id) VALUES(?)').bind(s.id).run();return c.json({ok:true})
})
app.get('/api/dashboard',async c=> {
  const u=await requireUser(c),clinic=requireClinic(u)
  const rows=await c.env.DB.batch([c.env.DB.prepare('SELECT COUNT(*) as count FROM assets WHERE clinic_id=?').bind(clinic),c.env.DB.prepare('SELECT COUNT(*) as count FROM consult_sessions WHERE clinic_id=?').bind(clinic),c.env.DB.prepare('SELECT COUNT(DISTINCT s.id) as count FROM consult_sessions s JOIN share_views v ON v.session_id=s.id WHERE s.clinic_id=?').bind(clinic),c.env.DB.prepare('SELECT COUNT(*) as count FROM favorites WHERE user_id=?').bind(u.id)])
  return c.json({assets:rows[0].results[0].count,sessions:rows[1].results[0].count,viewed:rows[2].results[0].count,favorites:rows[3].results[0].count})
})
app.get('/api/admin/stats',async c=> {
  const u=await requireUser(c);if(u.role!=='admin')fail('운영자 권한이 필요합니다.',403)
  const assets=await c.env.DB.prepare('SELECT a.*,t.name as treatment_name FROM assets a LEFT JOIN treatments t ON t.id=a.treatment_id WHERE a.is_public=1 ORDER BY a.use_count DESC').all()
  const clinics=await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM clinics').first<any>(),sessions=await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM consult_sessions').first<any>()
  return c.json({assets:assets.results.map(parseAsset),clinic_count:clinics?.cnt||0,session_count:sessions?.cnt||0})
})
app.get('/',c=>c.html(pageHome()))
app.get('/consult/:assetId',c=>c.html(pageConsult()))
app.get('/cases',c=>c.html(pageCases()))
app.get('/manage',c=>c.html(pageManage()))
app.get('/admin',c=>c.html(pageAdmin()))
app.get('/login',c=>c.html(pageLogin()))
app.get('/p/:token',c=>c.html(pageShare()))
app.get('/journey',c=>c.html(pageNotFound('치료 여정 타임라인은 준비 중입니다')))
app.get('/consent',c=>c.html(pageNotFound('진료 동의 서명은 준비 중입니다')))
app.get('/market',c=>c.html(pageNotFound('자료 공유 마켓은 준비 중입니다')))
app.notFound(c=>c.html(pageNotFound('요청하신 페이지를 찾을 수 없습니다'),404))
export default app
