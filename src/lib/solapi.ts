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

export type SendResult = { ok: boolean; groupId?: string; error?: string; uncertain?: boolean }

export async function sendAlimtalk(env: SolapiEnv, to: string, variables: Record<string, string>): Promise<SendResult> {
  if (!alimtalkReady(env)) return { ok: false, error: '알림톡 설정 미완료(키·발신프로필·템플릿)' }
  try {
    const res = await fetch(`${SOLAPI_BASE}/messages/v4/send-many/detail`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
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
    if (!res.ok) return { ok: false, uncertain: res.status >= 500, error: `SOLAPI 요청 오류 (HTTP ${res.status}). 운영 콘솔에서 확인하세요.` }
    const failed = body?.failedMessageList?.[0]
    if (failed) return { ok: false, groupId: body?.groupInfo?.groupId, error: `${failed.statusCode || ''} ${failed.statusMessage || '발송 실패'}`.trim() }
    if (!body?.groupInfo?.groupId) return {ok:false,uncertain:true,error:'접수 결과를 확인할 수 없습니다. 중복 방지를 위해 자동 재발송하지 않습니다.'}
    return { ok: true, groupId: body.groupInfo.groupId }
  } catch (e: any) {
    return { ok: false, uncertain: true, error: '통신 중 결과 확인이 중단되었습니다. 접수되었을 수 있어 자동 재발송하지 않습니다. SOLAPI 콘솔을 확인하세요.' }
  }
}

/** 인증정보 점검(잔액 조회). 값은 노출하지 않는다. */
export async function checkSolapiCredentials(env: SolapiEnv): Promise<{ ok: boolean; status: number; keyPrefix: string; balance?: number; error?: string; uncertain?: boolean }> {
  const keyPrefix = String(env.SOLAPI_API_KEY || '').slice(0, 4)
  if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET) return { ok: false, status: 0, keyPrefix, error: 'SOLAPI 키 미설정' }
  try {
    const res = await fetch(`${SOLAPI_BASE}/cash/v1/balance`, { headers: { Authorization: await authHeader(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET) } })
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, status: res.status, keyPrefix, error: String(body?.errorCode || body?.errorMessage || '').slice(0, 80) }
    return { ok: true, status: res.status, keyPrefix, balance: Number(body?.balance ?? body?.point ?? NaN) }
  } catch (e: any) { return { ok: false, status: 0, keyPrefix, error: String(e?.message || e).slice(0, 80) } }
}

/** Official solapi SDK 6.0.1 GroupMessageResponse count fields. One recipient per group. */
export async function deliveryStatus(env: SolapiEnv, groupId: string): Promise<{status?: string; error?: string}> {
  if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET) return {error:'SOLAPI 키 미설정'}
  try {
    const res = await fetch(`${SOLAPI_BASE}/messages/v4/groups/${encodeURIComponent(groupId)}`, {signal:AbortSignal.timeout(10000),headers:{Authorization:await authHeader(env.SOLAPI_API_KEY,env.SOLAPI_API_SECRET)}})
    if (!res.ok) return {error:`전달 결과 조회 실패 (HTTP ${res.status})`}
    const body: any = await res.json(), c = body.count
    if (c?.sentSuccess === 1 && c?.sentFailed === 0) return {status:'delivered'}
    if (c?.sentFailed === 1 && c?.sentSuccess === 0) return {status:'failed',error:'SOLAPI가 전달 실패를 확인했습니다. 자세한 사유는 SOLAPI 콘솔에서 확인하세요.'}
    return {status:'accepted'}
  } catch { return {error:'전달 결과를 조회하지 못했습니다. 기존 상태를 유지합니다.'} }
}
