import type { ObjectCheckResult, PictureListRecord } from "./types"

const FALLBACK_PUBLIC_BASE_URL = "https://yaju-pic.guestliang.icu"

export function buildPublicUrl(env: Env, objectName: string): string {
  return `${publicBaseUrl(env)}/${encodeURIComponent(objectName)}`
}

export async function objectExists(
  env: Env,
  objectName: string,
): Promise<boolean> {
  return Boolean(await env.yaju_pic_r2.head(objectName))
}

export async function uploadObject(
  env: Env,
  objectName: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await env.yaju_pic_r2.put(objectName, body, {
    httpMetadata: {
      contentType,
    },
  })
}

export async function deleteObject(
  env: Env,
  objectName: string,
): Promise<void> {
  await env.yaju_pic_r2.delete(objectName)
}

export async function getAvailableObjectName(
  env: Env,
  preferredName: string,
): Promise<string> {
  if (!(await objectExists(env, preferredName))) {
    return preferredName
  }

  const dotIndex = preferredName.lastIndexOf(".")
  const base = dotIndex > 0 ? preferredName.slice(0, dotIndex) : preferredName
  const extension = dotIndex > 0 ? preferredName.slice(dotIndex) : ""
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "")

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}-${date}-${randomHex(3)}${extension}`
    if (!(await objectExists(env, candidate))) {
      return candidate
    }
  }

  throw new Error("无法生成不重名的 R2 对象名，请稍后重试")
}

export async function checkRecordObject(
  env: Env,
  record: PictureListRecord,
): Promise<ObjectCheckResult> {
  const objectName = objectNameFromUrl(env, record.url)
  if (!objectName) {
    return {
      ...record,
      matched: false,
      message: "无法从 URL 解析 R2 对象名",
    }
  }

  try {
    const matched = await objectExists(env, objectName)
    return {
      ...record,
      r2Key: objectName,
      matched,
      message: matched ? "" : "R2 中缺少对应对象",
    }
  } catch {
    return {
      ...record,
      r2Key: objectName,
      matched: false,
      message: "检查 R2 对象时失败",
    }
  }
}

function objectNameFromUrl(env: Env, value: string): string | null {
  try {
    const parsed = new URL(value)
    const publicBase = new URL(publicBaseUrl(env))
    if (parsed.host !== publicBase.host || parsed.pathname.length <= 1) {
      return null
    }
    return decodeURIComponent(parsed.pathname.slice(1))
  } catch {
    return null
  }
}

function publicBaseUrl(env: Env): string {
  return (
    env.R2_PUBLIC_BASE_URL.trim().replace(/\/+$/u, "") ||
    FALLBACK_PUBLIC_BASE_URL
  )
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
