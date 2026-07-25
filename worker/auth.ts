import { jsonError } from "./responses"
import { isRecord, stringValue } from "./types"

const COOKIE_NAME = "yaju_pic_upload_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 2
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const encoder = new TextEncoder()

interface SessionPayload {
  exp: number
}

export async function handleUploadAuth(
  request: Request,
  env: Env,
): Promise<Response> {
  const uploadSecret = env.UPLOAD_YAJU_PIC_SECRET.trim()
  if (!uploadSecret) {
    return jsonError("上传密码未配置", 500)
  }

  const turnstileSecret = env.TURNSTILE_SECRET_KEY.trim()
  if (!turnstileSecret) {
    return jsonError("人机验证未配置", 500)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("请求格式错误", 400)
  }

  if (!isRecord(body)) {
    return jsonError("请求格式错误", 400)
  }

  const password = stringValue(body.password).trim()
  const turnstileToken = stringValue(body.turnstileToken).trim()

  if (!(await verifyTurnstile(turnstileToken, turnstileSecret, request))) {
    return jsonError("人机验证失败，请重试", 403)
  }

  if (!(await secureStringEqual(password, uploadSecret))) {
    return jsonError("密码错误", 401)
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  const token = await createSessionToken({ exp }, uploadSecret)

  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie":
          `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; ` +
          `Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
      },
    },
  )
}

export async function requireUploadSession(
  request: Request,
  env: Env,
): Promise<boolean> {
  const uploadSecret = env.UPLOAD_YAJU_PIC_SECRET.trim()
  if (!uploadSecret) {
    return false
  }

  const token = getCookie(request.headers.get("Cookie") ?? "", COOKIE_NAME)
  return token ? verifySessionToken(token, uploadSecret) : false
}

async function verifyTurnstile(
  token: string,
  secret: string,
  request: Request,
): Promise<boolean> {
  if (!token || token.length > 2048) {
    return false
  }

  const formData = new FormData()
  formData.append("secret", secret)
  formData.append("response", token)
  formData.append("remoteip", request.headers.get("CF-Connecting-IP") ?? "")
  formData.append("idempotency_key", crypto.randomUUID())

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: formData,
    })
    if (!response.ok) {
      return false
    }

    const result: unknown = await response.json()
    return isRecord(result) && result.success === true
  } catch {
    return false
  }
}

async function createSessionToken(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  const payloadPart = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signature = await sign(payloadPart, secret)
  return `${payloadPart}.${signature}`
}

async function verifySessionToken(
  token: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split(".")
  if (parts.length !== 2) {
    return false
  }

  const payloadPart = parts[0]
  const signature = parts[1]
  if (!payloadPart || !signature) {
    return false
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)))
  } catch {
    return false
  }

  if (
    !isRecord(payload) ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return false
  }

  try {
    const expectedSignature = await sign(payloadPart, secret)
    return secureStringEqual(signature, expectedSignature)
  } catch {
    return false
  }
}

async function sign(payloadPart: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadPart),
  )
  return base64UrlEncode(new Uint8Array(signature))
}

async function secureStringEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ])
  return crypto.subtle.timingSafeEqual(leftDigest, rightDigest)
}

function getCookie(cookieHeader: string, name: string): string {
  for (const part of cookieHeader.split("")) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1)
    }
  }
  return ""
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  )
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
