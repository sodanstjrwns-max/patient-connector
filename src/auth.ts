// 인증 헬퍼 (Web Crypto 기반)
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'

export type Bindings = {
  DB: D1Database
  R2: R2Bucket
}

export type AuthUser = {
  id: number
  clinic_id: number | null
  email: string
  name: string
  role: string
  clinic_name?: string
  clinic_phone?: string
  clinic_logo?: string
  clinic_specialty?: string
}

const SALT = 'pc_salt'

export async function hashPassword(pw: string): Promise<string> {
  const data = new TextEncoder().encode(pw + SALT)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomToken(len = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getUser(c: Context<{ Bindings: Bindings }>): Promise<AuthUser | null> {
  const token = getCookie(c, 'pc_session') || c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.clinic_id, u.email, u.name, u.role, cl.name as clinic_name, cl.phone as clinic_phone, cl.logo_url as clinic_logo, cl.specialty as clinic_specialty
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     LEFT JOIN clinics cl ON cl.id = u.clinic_id
     WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))`
  ).bind(token).first<AuthUser>()
  return row || null
}

export async function requireUser(c: Context<{ Bindings: Bindings }>): Promise<AuthUser | Response> {
  const user = await getUser(c)
  if (!user) return c.json({ error: '로그인이 필요합니다' }, 401)
  return user
}
