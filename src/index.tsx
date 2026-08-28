import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { setCookie, deleteCookie } from 'hono/cookie'
import { serveStatic } from 'hono/cloudflare-workers'
import { hashPassword, randomToken, getUser, requireUser, type Bindings, type AuthUser } from './auth'
import { pageHome, pageConsult, pageCases, pageManage, pageAdmin, pageLogin, pageShare, pageNotFound } from './pages'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))
app.use('/manifest.json', serveStatic({ root: './public' }))
app.use('/sw.js', serveStatic({ root: './public' }))

// ============================================================
// 플레이스홀더 SVG 생성기  /ph?t=제목&s=부제&v=변형&dark=1
// ============================================================
// v4 플랫 플레이스홀더: [배경 틴트, 악센트] — 채도 낮은 중립 팜레트
const PALETTES = [
  ['#eef2ff', '#4f46e5'], ['#f0f9ff', '#0284c7'], ['#f0fdfa', '#0d9488'],
  ['#fdf4ff', '#a21caf'], ['#fff7ed', '#ea580c'], ['#f0fdf4', '#16a34a'],
  ['#fefce8', '#a16207'], ['#fdf2f8', '#db2777'],
]
app.get('/ph', (c) => {
  const t = c.req.query('t') || '자료'
  const s = c.req.query('s') || ''
  const v = parseInt(c.req.query('v') || '0')
  const dark = c.req.query('dark') === '1'
  const [tint, accent] = dark ? ['#1e1e23', '#818cf8'] : PALETTES[v % PALETTES.length]
  const ink = dark ? '#f4f4f5' : '#18181b'
  const ink2 = dark ? '#a1a1aa' : '#71717a'
  const ink3 = dark ? '#52525b' : '#a1a1aa'
  const line = dark ? '#2e2e36' : '#e4e4e7'
  const surface = dark ? '#26262c' : '#ffffff'
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="${dark ? '#1a1a1e' : tint}"/>
  <g transform="translate(600,300) scale(1.35)">
    <circle r="105" fill="${surface}" ${dark ? '' : `stroke="${line}" stroke-width="2"`}/>
    <path d="M -55 -45 C -55 -85 -20 -95 0 -80 C 20 -95 55 -85 55 -45 C 55 0 35 20 28 70 C 25 90 12 90 10 70 C 8 45 5 30 0 30 C -5 30 -8 45 -10 70 C -12 90 -25 90 -28 70 C -35 20 -55 0 -55 -45 Z" transform="scale(0.82) translate(0,-8)" fill="none" stroke="${accent}" stroke-width="10" stroke-linejoin="round"/>
  </g>
  <text x="600" y="545" font-family="'Pretendard','Apple SD Gothic Neo',sans-serif" font-size="58" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="-1">${esc(t)}</text>
  ${s ? `<text x="600" y="605" font-family="'Pretendard','Apple SD Gothic Neo',sans-serif" font-size="30" font-weight="500" fill="${ink2}" text-anchor="middle">${esc(s)}</text>` : ''}
  <text x="600" y="740" font-family="'Pretendard','Apple SD Gothic Neo',sans-serif" font-size="20" font-weight="500" fill="${ink3}" text-anchor="middle">설명용 예시 이미지</text>
</svg>`
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' } })
})

// ============================================================
// 인증 API
// ============================================================
app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: '이메일과 비밀번호를 입력해주세요' }, 400)
  const hash = await hashPassword(password)
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND password_hash = ?').bind(email, hash).first<any>()
  if (!user) return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401)
  const token = randomToken()
  await c.env.DB.prepare("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").bind(token, user.id).run()
  setCookie(c, 'pc_session', token, { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 })
  return c.json({ ok: true, name: user.name, role: user.role })
})

app.post('/api/auth/signup', async (c) => {
  const { clinic_name, email, password, name, phone, specialty } = await c.req.json()
  if (!clinic_name || !email || !password || !name) return c.json({ error: '필수 항목을 모두 입력해주세요' }, 400)
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (exists) return c.json({ error: '이미 가입된 이메일입니다' }, 409)
  const clinic = await c.env.DB.prepare('INSERT INTO clinics (name, phone, specialty) VALUES (?, ?, ?)').bind(clinic_name, phone || null, specialty || '').run()
  const hash = await hashPassword(password)
  const u = await c.env.DB.prepare("INSERT INTO users (clinic_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'owner')")
    .bind(clinic.meta.last_row_id, email, hash, name).run()
  const token = randomToken()
  await c.env.DB.prepare("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").bind(token, u.meta.last_row_id).run()
  setCookie(c, 'pc_session', token, { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 })
  return c.json({ ok: true })
})

app.post('/api/auth/logout', async (c) => {
  deleteCookie(c, 'pc_session', { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const user = await getUser(c)
  return c.json({ user })
})

// ============================================================
// 진료 과목
// ============================================================
app.get('/api/treatments', async (c) => {
  const specialty = c.req.query('specialty')
  let sql = 'SELECT * FROM treatments'
  const binds: any[] = []
  if (specialty && specialty !== 'all') { sql += ' WHERE specialty = ?'; binds.push(specialty) }
  sql += ' ORDER BY sort_order'
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  const specs = await c.env.DB.prepare('SELECT DISTINCT specialty FROM treatments ORDER BY sort_order').all()
  return c.json({ treatments: results, specialties: [...new Set(specs.results.map((r: any) => r.specialty))] })
})

// ============================================================
// 자료 API
// ============================================================
function parseAsset(row: any) {
  return {
    ...row,
    media_urls: JSON.parse(row.media_urls || '[]'),
    payload: JSON.parse(row.payload || '{}'),
    tags: JSON.parse(row.tags || '[]'),
  }
}

// 목록: 공개 라이브러리는 누구나, 병원 자료는 로그인 시 자기 병원 것만
app.get('/api/assets', async (c) => {
  const user = await getUser(c)
  const treatment = c.req.query('treatment')
  const category = c.req.query('category')
  const q = c.req.query('q')

  let sql = `SELECT a.*, t.name as treatment_name FROM assets a LEFT JOIN treatments t ON t.id = a.treatment_id WHERE a.is_hidden = 0 AND (`
  const binds: any[] = []
  sql += 'a.is_public = 1'
  if (user?.clinic_id) { sql += ' OR a.clinic_id = ?'; binds.push(user.clinic_id) }
  sql += ')'
  if (treatment && treatment !== 'all') { sql += ' AND a.treatment_id = ?'; binds.push(treatment) }
  if (category && category !== 'all') {
    if (category === 'clinic') { sql += ' AND a.clinic_id IS NOT NULL' }
    else { sql += ' AND a.category = ?'; binds.push(category) }
  }
  if (q) { sql += ' AND (a.title LIKE ? OR a.tags LIKE ? OR a.description LIKE ?)'; binds.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  sql += ' ORDER BY a.clinic_id IS NOT NULL DESC, a.sort_order, a.id'
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ assets: results.map(parseAsset) })
})

app.get('/api/assets/:id', async (c) => {
  const user = await getUser(c)
  const row = await c.env.DB.prepare('SELECT a.*, t.name as treatment_name FROM assets a LEFT JOIN treatments t ON t.id = a.treatment_id WHERE a.id = ?').bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: '자료를 찾을 수 없습니다' }, 404)
  if (!row.is_public && (!user || user.clinic_id !== row.clinic_id) && user?.role !== 'admin') {
    return c.json({ error: '접근 권한이 없습니다' }, 403)
  }
  await c.env.DB.prepare('UPDATE assets SET use_count = use_count + 1 WHERE id = ?').bind(row.id).run()
  return c.json({ asset: parseAsset(row) })
})

// 병원 자료 업로드/생성
app.post('/api/assets', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  const b = await c.req.json()
  const isAdmin = user.role === 'admin'
  const clinicId = isAdmin && b.is_public ? null : user.clinic_id
  if (!clinicId && !isAdmin) return c.json({ error: '병원 계정이 필요합니다' }, 403)
  const r = await c.env.DB.prepare(
    `INSERT INTO assets (clinic_id, source_asset_id, treatment_id, category, type, title, description, media_urls, payload, reviewer_name, tags, is_public, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(clinicId, b.source_asset_id || null, b.treatment_id || null, b.category || 'clinic', b.type || 'image',
    b.title, b.description || '', JSON.stringify(b.media_urls || []), JSON.stringify(b.payload || {}),
    b.reviewer_name || user.name, JSON.stringify(b.tags || []), isAdmin && b.is_public ? 1 : 0, b.sort_order || 0).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

// 복제해서 편집 (공개 자료 → 우리 병원 버전)
app.post('/api/assets/:id/duplicate', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  if (!user.clinic_id) return c.json({ error: '병원 계정이 필요합니다' }, 403)
  const src = await c.env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(c.req.param('id')).first<any>()
  if (!src) return c.json({ error: '원본을 찾을 수 없습니다' }, 404)
  const r = await c.env.DB.prepare(
    `INSERT INTO assets (clinic_id, source_asset_id, treatment_id, category, type, title, description, media_urls, payload, reviewer_name, tags, is_public, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(user.clinic_id, src.id, src.treatment_id, src.category, src.type, src.title + ' (우리 병원)', src.description,
    src.media_urls, src.payload, src.reviewer_name, src.tags, src.sort_order).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

app.put('/api/assets/:id', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  const row = await c.env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: '자료를 찾을 수 없습니다' }, 404)
  const canEdit = user.role === 'admin' || (row.clinic_id && row.clinic_id === user.clinic_id)
  if (!canEdit) return c.json({ error: '수정 권한이 없습니다' }, 403)
  const b = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE assets SET title=?, description=?, treatment_id=?, category=?, media_urls=?, payload=?, reviewer_name=?, tags=?, is_hidden=?, sort_order=? WHERE id=?`
  ).bind(b.title ?? row.title, b.description ?? row.description, b.treatment_id ?? row.treatment_id,
    b.category ?? row.category, JSON.stringify(b.media_urls ?? JSON.parse(row.media_urls)),
    JSON.stringify(b.payload ?? JSON.parse(row.payload)), b.reviewer_name ?? row.reviewer_name,
    JSON.stringify(b.tags ?? JSON.parse(row.tags)), b.is_hidden ?? row.is_hidden, b.sort_order ?? row.sort_order, row.id).run()
  return c.json({ ok: true })
})

app.delete('/api/assets/:id', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  const row = await c.env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: '자료를 찾을 수 없습니다' }, 404)
  const canDel = user.role === 'admin' || (row.clinic_id && row.clinic_id === user.clinic_id)
  if (!canDel) return c.json({ error: '삭제 권한이 없습니다' }, 403)
  await c.env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(row.id).run()
  return c.json({ ok: true })
})

// ============================================================
// 파일 업로드 (R2)
// ============================================================
app.post('/api/upload', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  const form = await c.req.formData()
  const file = form.get('file') as File
  if (!file) return c.json({ error: '파일이 없습니다' }, 400)
  if (file.size > 100 * 1024 * 1024) return c.json({ error: '100MB 이하 파일만 업로드 가능합니다' }, 413)
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const key = `clinic${user.clinic_id || 'admin'}/${Date.now()}-${randomToken(6)}.${ext}`
  await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
  return c.json({ ok: true, url: `/files/${key}`, name: file.name, type: file.type })
})

app.get('/files/*', async (c) => {
  const key = c.req.path.replace('/files/', '')
  const obj = await c.env.R2.get(key)
  if (!obj) return c.notFound()
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000',
    },
  })
})

// ============================================================
// 비포·애프터 케이스 (원내 사용 전제 — 로그인 불필요.
// 공용 데모(clinic_id NULL) + 로그인 시 자기 병원 케이스.
// 단, 환자 전송 공개 링크에는 여전히 포함하지 않음)
// ============================================================
app.get('/api/cases', async (c) => {
  const user = await getUser(c)
  const treatment = c.req.query('treatment')
  let sql = 'SELECT cs.*, t.name as treatment_name FROM cases cs LEFT JOIN treatments t ON t.id = cs.treatment_id WHERE (cs.clinic_id IS NULL'
  const binds: any[] = []
  if (user?.clinic_id) { sql += ' OR cs.clinic_id = ?'; binds.push(user.clinic_id) }
  sql += ')'
  if (treatment && treatment !== 'all') { sql += ' AND cs.treatment_id = ?'; binds.push(treatment) }
  sql += ' ORDER BY cs.clinic_id IS NOT NULL DESC, cs.id DESC'
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ cases: results.map((r: any) => ({ ...r, tags: JSON.parse(r.tags || '[]') })) })
})

app.post('/api/cases', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  if (!user.clinic_id) return c.json({ error: '병원 계정이 필요합니다' }, 403)
  const b = await c.req.json()
  if (!b.before_url || !b.after_url) return c.json({ error: '비포/애프터 이미지가 필요합니다' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO cases (clinic_id, treatment_id, title, before_url, after_url, duration, material, doctor, consent, tags) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(user.clinic_id, b.treatment_id || null, b.title || '', b.before_url, b.after_url,
    b.duration || '', b.material || '', b.doctor || user.name, b.consent ? 1 : 0, JSON.stringify(b.tags || [])).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

app.delete('/api/cases/:id', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  await c.env.DB.prepare('DELETE FROM cases WHERE id = ? AND clinic_id = ?').bind(c.req.param('id'), user.clinic_id).run()
  return c.json({ ok: true })
})

// ============================================================
// 상담 세션
// ============================================================
app.post('/api/sessions', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  if (!user.clinic_id) return c.json({ error: '병원 계정이 필요합니다' }, 403)
  const b = await c.req.json()
  const slides = JSON.stringify(b.slides || [])
  if (b.id) {
    await c.env.DB.prepare("UPDATE consult_sessions SET patient_label=?, slides=?, schedule_note=?, updated_at=datetime('now') WHERE id=? AND clinic_id=?")
      .bind(b.patient_label || '', slides, b.schedule_note || '', b.id, user.clinic_id).run()
    return c.json({ ok: true, id: b.id })
  }
  const r = await c.env.DB.prepare('INSERT INTO consult_sessions (clinic_id, user_id, patient_label, slides, schedule_note) VALUES (?,?,?,?,?)')
    .bind(user.clinic_id, user.id, b.patient_label || '', slides, b.schedule_note || '').run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

// 환자 전송 링크 생성
app.post('/api/sessions/:id/share', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  const row = await c.env.DB.prepare('SELECT * FROM consult_sessions WHERE id = ? AND clinic_id = ?').bind(c.req.param('id'), user.clinic_id).first<any>()
  if (!row) return c.json({ error: '세션을 찾을 수 없습니다' }, 404)
  let token = row.share_token
  if (!token) {
    token = randomToken(12)
    await c.env.DB.prepare('UPDATE consult_sessions SET share_token = ? WHERE id = ?').bind(token, row.id).run()
  }
  // 전송 횟수 집계
  const slides = JSON.parse(row.slides || '[]')
  for (const s of slides) {
    if (s.asset_id) await c.env.DB.prepare('UPDATE assets SET send_count = send_count + 1 WHERE id = ?').bind(s.asset_id).run()
  }
  return c.json({ ok: true, token, url: `/p/${token}` })
})

app.get('/api/sessions', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.patient_label, s.share_token, s.created_at, s.updated_at,
       (SELECT COUNT(*) FROM share_views v WHERE v.session_id = s.id) as view_count,
       (SELECT MAX(viewed_at) FROM share_views v WHERE v.session_id = s.id) as last_viewed
     FROM consult_sessions s WHERE s.clinic_id = ? ORDER BY s.updated_at DESC LIMIT 50`
  ).bind(user.clinic_id).all()
  return c.json({ sessions: results })
})

app.get('/api/sessions/:id', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  const row = await c.env.DB.prepare('SELECT * FROM consult_sessions WHERE id = ? AND clinic_id = ?').bind(c.req.param('id'), user.clinic_id).first<any>()
  if (!row) return c.json({ error: '세션을 찾을 수 없습니다' }, 404)
  return c.json({ session: { ...row, slides: JSON.parse(row.slides || '[]') } })
})

// ============================================================
// 환자 공개 페이지 데이터 (로그인 불필요)
// ============================================================
app.get('/api/share/:token', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT s.*, cl.name as clinic_name, cl.phone as clinic_phone, cl.address as clinic_address, cl.logo_url as clinic_logo, cl.emergency_info
     FROM consult_sessions s JOIN clinics cl ON cl.id = s.clinic_id WHERE s.share_token = ?`
  ).bind(c.req.param('token')).first<any>()
  if (!row) return c.json({ error: '링크가 유효하지 않습니다' }, 404)
  await c.env.DB.prepare('INSERT INTO share_views (session_id) VALUES (?)').bind(row.id).run()

  const slides = JSON.parse(row.slides || '[]')
  const assetIds = slides.map((s: any) => s.asset_id).filter(Boolean)
  let assets: any[] = []
  if (assetIds.length) {
    const placeholders = assetIds.map(() => '?').join(',')
    const { results } = await c.env.DB.prepare(`SELECT * FROM assets WHERE id IN (${placeholders})`).bind(...assetIds).all()
    // 비포·애프터(compare)는 공개 링크에서 제외 (의료광고 규정)
    assets = results.filter((a: any) => a.type !== 'compare').map(parseAsset)
  }
  // 주의사항 자동 첨부: 슬라이드에 포함된 진료의 주의사항
  const treatmentIds = [...new Set(assets.map((a) => a.treatment_id).filter(Boolean))]
  let cautions: any[] = []
  if (treatmentIds.length) {
    const ph = treatmentIds.map(() => '?').join(',')
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM assets WHERE category = 'caution' AND is_hidden = 0 AND treatment_id IN (${ph}) AND (is_public = 1 OR clinic_id = ?) ORDER BY clinic_id IS NOT NULL DESC, sort_order`
    ).bind(...treatmentIds, row.clinic_id).all()
    cautions = results.map(parseAsset)
  }
  return c.json({
    clinic: { name: row.clinic_name, phone: row.clinic_phone, address: row.clinic_address, logo: row.clinic_logo, emergency: row.emergency_info },
    patient_label: row.patient_label,
    schedule_note: row.schedule_note,
    created_at: row.created_at,
    slides, assets, cautions,
  })
})

// ============================================================
// 관리자 통계
// ============================================================
app.get('/api/admin/stats', async (c) => {
  const user = await requireUser(c); if (user instanceof Response) return user
  if (user.role !== 'admin') return c.json({ error: '관리자 권한이 필요합니다' }, 403)
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.category, a.use_count, a.send_count, a.is_public, a.sort_order, t.name as treatment_name
     FROM assets a LEFT JOIN treatments t ON t.id = a.treatment_id WHERE a.is_public = 1 ORDER BY a.use_count DESC`
  ).all()
  const clinics = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM clinics').first<any>()
  const sessions = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM consult_sessions').first<any>()
  return c.json({ assets: results, clinic_count: clinics?.cnt || 0, session_count: sessions?.cnt || 0 })
})

// ============================================================
// 페이지 라우팅
// ============================================================
app.get('/', async (c) => c.html(pageHome()))
app.get('/consult/:assetId', async (c) => c.html(pageConsult()))
app.get('/cases', async (c) => c.html(pageCases()))
app.get('/manage', async (c) => c.html(pageManage()))
app.get('/admin', async (c) => c.html(pageAdmin()))
app.get('/login', async (c) => c.html(pageLogin()))
app.get('/p/:token', async (c) => c.html(pageShare()))
// 2단계 대비 라우팅 (준비만)
app.get('/journey', (c) => c.html(pageNotFound('치료 여정 타임라인은 준비 중입니다')))
app.get('/consent', (c) => c.html(pageNotFound('진료 동의 서명은 준비 중입니다')))
app.get('/market', (c) => c.html(pageNotFound('자료 공유 마켓은 준비 중입니다')))

export default app
