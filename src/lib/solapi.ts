// 솔라피(SOLAPI) 알림톡 발송 — Cloudflare Workers 호환 (Web Crypto HMAC). 써모 lib/solapi.ts 와 동일 구조.
// 정책: 알림톡 온리 (문자 대체발송 없음). 플랫폼 공용 채널(Patient Connect)로 발송하며 #{병원명} 을 주입한다.
const SOLAPI_BASE = 'https://api.solapi.com'

export type SolapiEnv = {
  SOLAPI_API_KEY?: string
  SOLAPI_API_SECRET?: string
  PLATFORM_FROM_NUMBER?: string
  PLATFORM_PF_ID?: string        // 카카오 발신프로필(Patient Connect 채널)
  CONNECT_TEMPLATE_ID?: string   // 승인된 안내장 템플릿
}

async function authHeader(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString()
  const saltBytes = new Uint8Array(16); crypto.getRandomValues(saltBytes)
  const salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt))
  const signature = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

export function alimtalkReady(env: SolapiEnv): boolean {
  return !!(env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET && env.PLATFORM_PF_ID && env.CONNECT_TEMPLATE_ID)
}

export type SendResult = { ok: boolean; groupId?: string; error?: string }

export async function sendAlimtalk(env: SolapiEnv, to: string, variables: Record<string, string>): Promise<SendResult> {
  if (!alimtalkReady(env)) return { ok: false, error: '알림톡 설정 미완료(키·발신프로필·템플릿)' }
  try {
    const res = await fetch(`${SOLAPI_BASE}/messages/v4/send-many/detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader(env.SOLAPI_API_KEY!, env.SOLAPI_API_SECRET!) },
      body: JSON.stringify({
        messages: [{
          to,
          ...(env.PLATFORM_FROM_NUMBER ? { from: env.PLATFORM_FROM_NUMBER.replace(/[^0-9]/g, '') } : {}),
          kakaoOptions: { pfId: env.PLATFORM_PF_ID, templateId: env.CONNECT_TEMPLATE_ID, variables, disableSms: true },
        }],
      }),
    })
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body?.errorMessage || JSON.stringify(body).slice(0, 200)}` }
    const failed = body?.failedMessageList?.[0]
    if (failed) return { ok: false, groupId: body?.groupInfo?.groupId, error: `${failed.statusCode || ''} ${failed.statusMessage || '발송 실패'}`.trim() }
    return { ok: true, groupId: body?.groupInfo?.groupId }
  } catch (e: any) {
    return { ok: false, error: `네트워크 오류: ${e?.message || e}` }
  }
}

/** 인증정보 점검(잔액 조회). 값은 노출하지 않는다. */
export async function checkSolapiCredentials(env: SolapiEnv): Promise<{ ok: boolean; status: number; keyPrefix: string; balance?: number; error?: string }> {
  const keyPrefix = String(env.SOLAPI_API_KEY || '').slice(0, 4)
  if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET) return { ok: false, status: 0, keyPrefix, error: 'SOLAPI 키 미설정' }
  try {
    const res = await fetch(`${SOLAPI_BASE}/cash/v1/balance`, { headers: { Authorization: await authHeader(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET) } })
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, status: res.status, keyPrefix, error: String(body?.errorCode || body?.errorMessage || '').slice(0, 80) }
    return { ok: true, status: res.status, keyPrefix, balance: Number(body?.balance ?? body?.point ?? NaN) }
  } catch (e: any) { return { ok: false, status: 0, keyPrefix, error: String(e?.message || e).slice(0, 80) } }
}
