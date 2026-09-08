import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'

export type Bindings = { DB: D1Database; R2: R2Bucket }
export type AuthUser = { id: number; clinic_id: number | null; email: string; name: string; role: string; clinic_name?: string; clinic_phone?: string; clinic_logo?: string; clinic_specialty?: string }
const enc = new TextEncoder()
const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
export function randomToken(len = 32) { return hex(crypto.getRandomValues(new Uint8Array(len))) }
export async function digest(value: string) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(value))) }
// Workers WebCrypto supports at most 100,000 PBKDF2 iterations. Versioned for future upgrades.
export async function hashPassword(pw: string, salt = randomToken(16)) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256)
  return `pbkdf2$100000$${salt}$${hex(bits)}`
}
export async function verifyPassword(pw: string, stored: string) {
  if (typeof pw !== 'string' || pw.length > 128) return false
  const candidate = stored.startsWith('pbkdf2$100000$') ? await hashPassword(pw, stored.split('$')[2]) : await digest(pw + 'pc_salt')
  if (candidate.length !== stored.length) return false
  let diff = 0; for (let i = 0; i < stored.length; i++) diff |= candidate.charCodeAt(i) ^ stored.charCodeAt(i)
  return diff === 0
}
export const sessionToken = (c: Context) => getCookie(c, 'pc_session') || c.req.header('Authorization')?.replace(/^Bearer /, '')
export async function newSession(c: Context<{ Bindings: Bindings }>, userId: number) {
  const token = randomToken()
  await c.env.DB.prepare("INSERT INTO auth_sessions (token,user_id,expires_at) VALUES (?,?,datetime('now','+30 days'))").bind(token, userId).run()
  setCookie(c, 'pc_session', token, { path: '/', httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', maxAge: 2592000 })
}
export async function getUser(c: Context<{ Bindings: Bindings }>): Promise<AuthUser | null> {
  const token = sessionToken(c)
  if (!token || token.length > 128) return null
  return c.env.DB.prepare(`SELECT u.id,u.clinic_id,u.email,u.name,u.role,cl.name as clinic_name,cl.phone as clinic_phone,cl.logo_url as clinic_logo,cl.specialty as clinic_specialty FROM auth_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN clinics cl ON cl.id=u.clinic_id WHERE s.token=? AND s.expires_at>datetime('now')`).bind(token).first<AuthUser>()
}
export async function requireUser(c: Context<{ Bindings: Bindings }>): Promise<AuthUser> {
  const user = await getUser(c)
  if (!user) throw new HTTPException(401, { message: '로그인이 필요합니다.' })
  return user
}
export function requireClinic(user: AuthUser) {
  if (!user.clinic_id) throw new HTTPException(403, { message: '병원 계정이 필요합니다.' })
  return user.clinic_id
}
// Atomic D1 fixed-window limiter; email + network buckets keep guesses bounded.
export async function rateLimit(c: Context<{ Bindings: Bindings }>, key: string, limit = 12, seconds = 900) {
  const now = Math.floor(Date.now() / 1000)
  const hashed = await digest(key)
  const row = await c.env.DB.prepare(`INSERT INTO auth_limits (key,attempts,resets_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN resets_at<=? THEN 1 ELSE attempts+1 END,resets_at=CASE WHEN resets_at<=? THEN ? ELSE resets_at END RETURNING attempts`).bind(hashed, now + seconds, now, now, now + seconds).first<any>()
  if (row.attempts > limit) { c.header('Retry-After', String(seconds)); throw new HTTPException(429, { message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' }) }
  // Lazy bounded cleanup, no cron required.
  c.executionCtx.waitUntil(c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM auth_limits WHERE key IN (SELECT key FROM auth_limits WHERE resets_at < ? LIMIT 100)').bind(now - 86400),
    c.env.DB.prepare("DELETE FROM auth_sessions WHERE token IN (SELECT token FROM auth_sessions WHERE expires_at < datetime('now') LIMIT 100)")
  ]).then(() => {}))
}
