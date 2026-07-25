import { hasUploadAccess } from "./access"
import {
  countPictureRecords,
  getPictureDateRange,
  insertPicture,
  listPictureRecords,
  QUERY_PAGE_SIZE,
  queryPictures,
} from "./db"
import {
  collectImageFiles,
  MAX_FILE_SIZE,
  MAX_UPLOAD_COUNT,
  MAX_UPLOAD_SIZE,
  readAndBuildPictureMeta,
  sanitizeFileName,
  validateUploadBatch,
} from "./image-meta"
import {
  buildPublicUrl,
  checkRecordObject,
  deleteObject,
  getAvailableObjectName,
  objectExists,
  uploadObject,
} from "./r2"
import { MAX_JSON_BODY_SIZE, readJsonRecord } from "./request"
import { jsonError, jsonResponse } from "./responses"
import { getTagSuggestions } from "./tags"
import { stringValue, type ObjectCheckResult } from "./types"

const MAX_REQUEST_SIZE = MAX_UPLOAD_SIZE + 1024 * 1024
const MAX_QUERY_OFFSET = 100_000

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url)
  const { pathname } = url

  if (request.method === "GET" && pathname === "/api/site-config") {
    const range = await getPictureDateRange(env)
    const tags = getTagSuggestions()
    return jsonResponse(
      {
        ok: true,
        range,
        tags,
        upload: {
          maxFiles: MAX_UPLOAD_COUNT,
          maxFileSize: MAX_FILE_SIZE,
          maxTotalSize: MAX_UPLOAD_SIZE,
          allowedTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    )
  }

  if (request.method === "POST" && pathname === "/api/latest-picture") {
    return jsonResponse({
      ok: true,
      range: await getPictureDateRange(env),
    })
  }

  if (request.method === "POST" && pathname === "/api/query-pic") {
    const bodyResult = await readJsonRecord(request)
    if (!bodyResult.ok) {
      return jsonReadError(bodyResult.error)
    }

    const body = bodyResult.value
    const offset = parseQueryOffset(body.offset)
    if (offset === null) {
      return jsonError(`查询偏移量必须是 0 到 ${MAX_QUERY_OFFSET} 的整数`, 400)
    }

    const result = await queryPictures(env, {
      startDate: stringValue(body.startDate),
      endDate: stringValue(body.endDate),
      rawTag: stringValue(body.tag),
      rawOrientation: stringValue(body.orientation),
      offset,
    })
    if ("error" in result) {
      return jsonResponse(
        {
          error: result.error,
        },
        {
          status: result.status,
        },
      )
    }
    return jsonResponse({
      items: result.results,
      offset,
      limit: QUERY_PAGE_SIZE,
      done: result.done,
      nextOffset: result.done ? null : offset + result.results.length,
    })
  }

  if (request.method === "GET" && pathname === "/upload") {
    if (!(await hasUploadAccess(request, env))) {
      return accessDeniedResponse()
    }
    return env.ASSETS.fetch(request)
  }

  if (request.method === "POST" && pathname === "/api/upload-pictures") {
    if (!(await hasUploadAccess(request, env))) {
      return accessDeniedResponse()
    }
    return handleUploadPictures(request, env)
  }

  if (request.method === "POST" && pathname === "/api/upload-check") {
    if (!(await hasUploadAccess(request, env))) {
      return accessDeniedResponse()
    }

    const bodyResult = await readJsonRecord(request)
    if (!bodyResult.ok) {
      return jsonReadError(bodyResult.error)
    }
    return handleUploadCheck(env, bodyResult.value)
  }

  if (pathname.startsWith("/api/")) {
    return jsonError("接口不存在", 404)
  }

  return env.ASSETS.fetch(request)
}

async function handleUploadPictures(
  request: Request,
  env: Env,
): Promise<Response> {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return uploadBatchError("一次上传的文件总大小不能超过 100 MB")
  }

  let files: File[]
  try {
    const formData = await request.formData()
    files = collectImageFiles(formData)
    validateUploadBatch(files)
  } catch (error) {
    return uploadBatchError(userMessage(error))
  }

  const results: Array<Record<string, unknown>> = []
  const errors: Array<Record<string, unknown>> = []

  for (const file of files) {
    const fileName = file.name
    let finalName = ""
    let r2Uploaded = false

    try {
      const cleanName = sanitizeFileName(fileName)
      finalName = await getAvailableObjectName(env, cleanName)
      const url = buildPublicUrl(env, finalName)
      const { arrayBuffer, picture } = await readAndBuildPictureMeta(
        file,
        finalName,
        url,
      )

      await uploadObject(env, finalName, arrayBuffer, file.type)
      r2Uploaded = true

      try {
        await insertPicture(env, picture)
      } catch (error) {
        await cleanupUploadedObject(env, finalName)
        throw new Error(
          `D1 写入失败，已尝试回滚 R2 对象：${userMessage(error)}`,
        )
      }

      const matched = await objectExists(env, finalName)
      results.push({
        fileName,
        name: picture.name,
        r2Key: finalName,
        url: picture.url,
        r2Uploaded,
        d1Inserted: true,
        matched,
      })
    } catch (error) {
      errors.push({
        fileName,
        name: finalName || undefined,
        r2Uploaded,
        d1Inserted: false,
        matched: false,
        message: userMessage(error),
      })
    }
  }

  const ok = results.length === files.length && errors.length === 0
  return jsonResponse(
    {
      ok,
      partial: results.length > 0 && errors.length > 0,
      results,
      errors,
    },
    {
      status: ok || results.length > 0 ? 200 : 400,
    },
  )
}

async function cleanupUploadedObject(
  env: Env,
  objectName: string,
): Promise<void> {
  try {
    await deleteObject(env, objectName)
  } catch {
    throw new Error("D1 写入失败，且 R2 回滚删除失败，请手动检查存储桶")
  }
}

async function handleUploadCheck(
  env: Env,
  body: Record<string, unknown>,
): Promise<Response> {
  const requestedLimit = Number(body.limit)
  const requestedOffset = Number(body.offset)
  const hasPaging = "limit" in body || "offset" in body
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 50
  const offset =
    Number.isInteger(requestedOffset) && requestedOffset > 0
      ? requestedOffset
      : 0
  const total = await countPictureRecords(env)
  const records = await listPictureRecords(
    env,
    hasPaging ? { limit, offset } : undefined,
  )
  const checks = await runLimited(records, 10, (record) =>
    checkRecordObject(env, record),
  )
  const missingItems: ObjectCheckResult[] = []
  const errors: ObjectCheckResult[] = []
  let matched = 0

  for (const check of checks) {
    if (check.matched) {
      matched += 1
      continue
    }

    missingItems.push(check)
    if (check.message && check.message !== "R2 中缺少对应对象") {
      errors.push(check)
    }
  }

  return jsonResponse({
    total,
    checked: records.length,
    offset: hasPaging ? offset : 0,
    limit: hasPaging ? limit : records.length,
    done: hasPaging ? Math.min(offset + records.length, total) >= total : true,
    matched,
    missing: missingItems.length,
    missingItems,
    errors,
  })
}

async function runLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let nextIndex = 0

  async function runOne(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (item !== undefined) {
        results[index] = await task(item, index)
      }
    }
  }

  const workers: Promise<void>[] = []
  const workerCount = Math.min(limit, items.length)
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(runOne())
  }
  await Promise.all(workers)
  return results
}

function parseQueryOffset(value: unknown): number | null {
  if (value === undefined) {
    return 0
  }
  const offset = Number(value)
  return Number.isInteger(offset) && offset >= 0 && offset <= MAX_QUERY_OFFSET
    ? offset
    : null
}

function jsonReadError(error: "invalid" | "too-large"): Response {
  return error === "too-large"
    ? jsonError(`JSON 请求体不能超过 ${MAX_JSON_BODY_SIZE / 1024} KiB`, 413)
    : jsonError("请求格式错误", 400)
}

function accessDeniedResponse(): Response {
  return jsonError("Cloudflare Access 身份验证无效或已过期", 403)
}

function uploadBatchError(message: string): Response {
  return jsonResponse(
    {
      ok: false,
      partial: false,
      results: [],
      errors: [
        {
          fileName: "",
          message,
        },
      ],
    },
    {
      status: 400,
    },
  )
}

function userMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "处理失败"
}
