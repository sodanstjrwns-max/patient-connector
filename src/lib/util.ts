// 공통 유틸 — 전화번호 정규화·해시·암호화, 토큰, KST
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
export function nowKST(): Date { return new Date(Date.now() + KST_OFFSET_MS) }
export function kstDateStr(d: Date = nowKST()): string { return d.toISOString().slice(0, 10) }

/** 전화번호 정규화: 숫자만, 010 으로 시작하는 10~11자리 */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11) return null
  if (!digits.startsWith('01')) return null
  return digits
}

/** SHA-256 해시 (수신거부·중복 판정용, 병원 솔트) */
export async function phoneHash(phone: string, hospitalId: number): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pc-salt:${hospitalId}:${phone}`))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// AES-256-GCM (Web Crypto). 키: PHONE_ENC_KEY 시크릿에서 SHA-256 파생. 형식 "v2:" + base64(IV||ct)
async function aesKey(secret: string): Promise<CryptoKey> {
  const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pc-phone-key:${secret}`))
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
function b64enc(bytes: Uint8Array): string { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s) }
function b64dec(s: string): Uint8Array { const raw = atob(s); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out }
export async function encPhone(phone: string, secret: string): Promise<string> {
  const key = await aesKey(secret)
  const iv = new Uint8Array(12); crypto.getRandomValues(iv)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(phone))
  const packed = new Uint8Array(12 + ct.byteLength); packed.set(iv, 0); packed.set(new Uint8Array(ct), 12)
  return `v2:${b64enc(packed)}`
}
export async function decPhone(enc: string, secret: string): Promise<string> {
  const packed = b64dec(enc.replace(/^v2:/, ''))
  const key = await aesKey(secret)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packed.slice(0, 12) }, key, packed.slice(12))
  return new TextDecoder().decode(pt)
}

export function randomToken(bytes = 16): string {
  const b = new Uint8Array(bytes); crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

export function maskPhone(last4: string | null | undefined): string {
  return last4 ? `010-****-${last4}` : '번호 없음'
}

/** 상수시간 문자열 비교 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ba = enc.encode(String(a || '')); const bb = enc.encode(String(b || ''))
  if (ba.length !== bb.length) return false
  let diff = 0; for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i]
  return diff === 0
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}
