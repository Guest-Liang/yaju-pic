import type {
  ObjectCheckResult,
  Picture,
  PictureDateRange,
  PictureQuery,
  SiteConfig,
  UploadCheckBatch,
  UploadItemResult,
  UploadLimits,
  UploadResponse,
} from "../types"

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const { response, payload } = await requestJson("/api/site-config", {
    method: "GET",
  })
  if (!response.ok) {
    throw responseError(payload, response.status, "读取站点配置失败")
  }

  const record = requireRecord(payload, "站点配置格式错误")
  return {
    range: parseDateRange(record.range),
    tags: stringArray(record.tags),
    upload: parseUploadLimits(record.upload),
  }
}

export async function queryPictures(query: PictureQuery): Promise<Picture[]> {
  const results: Picture[] = []
  let offset = 0

  while (true) {
    const { response, payload } = await requestJson("/api/query-pic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...query,
        offset,
      }),
    })
    if (!response.ok) {
      throw responseError(payload, response.status, "查询失败")
    }

    const page = requireRecord(payload, "查询结果格式错误")
    if (!Array.isArray(page.items) || typeof page.done !== "boolean") {
      throw new ApiError("查询结果格式错误", 502)
    }

    results.push(...page.items.map(parsePicture))
    if (page.done) {
      return results
    }

    const nextOffset = Number(page.nextOffset)
    if (!Number.isInteger(nextOffset) || nextOffset <= offset) {
      throw new ApiError("查询分页信息格式错误", 502)
    }
    offset = nextOffset
  }
}

export async function uploadPictures(
  files: readonly File[],
): Promise<UploadResponse> {
  const formData = new FormData()
  for (const file of files) {
    formData.append("files", file, file.name)
  }

  const { response, payload } = await requestJson("/api/upload-pictures", {
    method: "POST",
    headers: accessRequestHeaders(),
    body: formData,
  })
  if (response.status === 401 || response.status === 403) {
    throw new ApiError("Cloudflare Access 登录已过期", response.status)
  }

  const parsed = parseUploadResponse(payload)
  if (
    !response.ok &&
    parsed.results.length === 0 &&
    parsed.errors.length === 0
  ) {
    throw responseError(payload, response.status, "上传失败")
  }
  return parsed
}

export async function checkUploadBatch(
  offset: number,
  limit: number,
): Promise<UploadCheckBatch> {
  const { response, payload } = await requestJson("/api/upload-check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...accessRequestHeaders(),
    },
    body: JSON.stringify({ offset, limit }),
  })
  if (response.status === 401 || response.status === 403) {
    throw new ApiError("Cloudflare Access 登录已过期", response.status)
  }
  if (!response.ok) {
    throw responseError(payload, response.status, "一致性检查失败")
  }

  const record = requireRecord(payload, "一致性检查结果格式错误")
  return {
    total: numberField(record.total),
    checked: numberField(record.checked),
    offset: numberField(record.offset),
    limit: numberField(record.limit),
    done: booleanField(record.done),
    matched: numberField(record.matched),
    missing: numberField(record.missing),
    missingItems: objectCheckArray(record.missingItems),
    errors: objectCheckArray(record.errors),
  }
}

function accessRequestHeaders(): Record<string, string> {
  return {
    "X-Requested-With": "XMLHttpRequest",
  }
}

async function requestJson(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<{ response: Response; payload: unknown }> {
  let response: Response
  try {
    response = await fetch(input, {
      credentials: "same-origin",
      ...init,
    })
  } catch {
    throw new ApiError("网络错误或服务暂时不可用", 0)
  }

  const text = await response.text()
  if (!text) {
    return { response, payload: null }
  }

  try {
    return {
      response,
      payload: JSON.parse(text) as unknown,
    }
  } catch {
    return {
      response,
      payload: {
        message: text,
      },
    }
  }
}

function parsePicture(value: unknown): Picture {
  const record = requireRecord(value, "图片记录格式错误")
  return {
    id: numberField(record.id),
    name: stringField(record.name),
    url: stringField(record.url),
    size: numberField(record.size),
    width: numberField(record.width),
    height: numberField(record.height),
    ratio: numberField(record.ratio),
    landscape: numberField(record.landscape),
    near_square: numberField(record.near_square),
    big_size: numberField(record.big_size),
    small_size: numberField(record.small_size),
    mid_size: numberField(record.mid_size),
    big_res: numberField(record.big_res),
    small_res: numberField(record.small_res),
    mid_res: numberField(record.mid_res),
    bjn: numberField(record.bjn),
  }
}

function parseDateRange(value: unknown): PictureDateRange {
  const record = requireRecord(value, "时间范围格式错误")
  return {
    startDate: nullableStringField(record.startDate),
    endDate: nullableStringField(record.endDate),
    total: numberField(record.total),
  }
}

function parseUploadLimits(value: unknown): UploadLimits {
  const record = requireRecord(value, "上传限制格式错误")
  return {
    maxFiles: numberField(record.maxFiles),
    maxFileSize: numberField(record.maxFileSize),
    maxTotalSize: numberField(record.maxTotalSize),
    allowedTypes: stringArray(record.allowedTypes),
  }
}

function parseUploadResponse(value: unknown): UploadResponse {
  const record = requireRecord(value, "上传结果格式错误")
  return {
    ok: booleanField(record.ok),
    partial: booleanField(record.partial),
    results: uploadItemArray(record.results),
    errors: uploadItemArray(record.errors),
  }
}

function uploadItemArray(value: unknown): UploadItemResult[] {
  return Array.isArray(value) ? value.map(parseUploadItem) : []
}

function parseUploadItem(value: unknown): UploadItemResult {
  const record = requireRecord(value, "上传条目格式错误")
  return {
    fileName: stringField(record.fileName),
    name: optionalStringField(record.name),
    r2Key: optionalStringField(record.r2Key),
    url: optionalStringField(record.url),
    r2Uploaded: optionalBooleanField(record.r2Uploaded),
    d1Inserted: optionalBooleanField(record.d1Inserted),
    matched: optionalBooleanField(record.matched),
    message: optionalStringField(record.message),
  }
}

function objectCheckArray(value: unknown): ObjectCheckResult[] {
  return Array.isArray(value) ? value.map(parseObjectCheck) : []
}

function parseObjectCheck(value: unknown): ObjectCheckResult {
  const record = requireRecord(value, "一致性检查条目格式错误")
  return {
    id: numberField(record.id),
    name: stringField(record.name),
    url: stringField(record.url),
    r2Key: optionalStringField(record.r2Key),
    matched: booleanField(record.matched),
    message: stringField(record.message),
  }
}

function responseError(
  payload: unknown,
  status: number,
  fallback: string,
): ApiError {
  if (isRecord(payload)) {
    const message = payload.error ?? payload.message
    if (typeof message === "string" && message.trim()) {
      return new ApiError(message, status)
    }
  }
  return new ApiError(fallback, status)
}

function requireRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ApiError(message, 502)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function optionalStringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function nullableStringField(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function numberField(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function booleanField(value: unknown): boolean {
  return value === true
}

function optionalBooleanField(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}
