// 병원 세션 (HMAC 서명 쿠키) — 허브 SSO 로만 발급된다 (자체 로그인 없음)
const DEFAULT_SECRET = 'pc-dev-session-secret' // 프로덕션: SESSION_SECRET 필수 (index.tsx 가드)

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)))
}

/** 세션 토큰: hospitalId.expiry.sig (기본 30일) */
export async function signSession(hospitalId: number, secret?: string, days = 30): Promise<string> {
  const exp = Date.now() + days * 86400000
  const payload = `${hospitalId}.${exp}`
  return `${payload}.${await hmac(secret || DEFAULT_SECRET, payload)}`
}
export async function verifySession(token: string | undefined, secret?: string): Promise<number | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [idStr, expStr, sig] = parts
  if (Number(expStr) < Date.now()) return null
  if (sig !== (await hmac(secret || DEFAULT_SECRET, `${idStr}.${expStr}`))) return null
  const id = Number(idStr)
  return Number.isInteger(id) && id > 0 ? id : null
}
export function sessionCookie(token: string): string {
  return `pc_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`
}
export function clearCookie(): string {
  return 'pc_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
}
export function getSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  const m = cookieHeader.match(/(?:^|;\s*)pc_session=([^;]+)/)
  return m?.[1]
}
