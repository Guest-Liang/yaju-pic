import { isRecord } from "./types"

export const MAX_JSON_BODY_SIZE = 16 * 1024

export type JsonRecordReadResult =
  | {
      ok: true
      value: Record<string, unknown>
    }
  | {
      ok: false
      error: "invalid" | "too-large"
    }

export async function readJsonRecord(
  request: Request,
  maxBytes = MAX_JSON_BODY_SIZE,
): Promise<JsonRecordReadResult> {
  const declaredLength = Number(request.headers.get("Content-Length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, error: "too-large" }
  }

  if (!request.body) {
    return { ok: false, error: "invalid" }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (!value) {
        continue
      }

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel()
        } catch {
          // The size error below is still the useful response to the caller.
        }
        return { ok: false, error: "too-large" }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, error: "invalid" }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return isRecord(value)
      ? { ok: true, value }
      : { ok: false, error: "invalid" }
  } catch {
    return { ok: false, error: "invalid" }
  }
}
