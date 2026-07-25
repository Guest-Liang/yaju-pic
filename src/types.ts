export interface Picture {
  id: number
  name: string
  url: string
  size: number
  width: number
  height: number
  ratio: number
  landscape: number
  near_square: number
  big_size: number
  small_size: number
  mid_size: number
  big_res: number
  small_res: number
  mid_res: number
  bjn: number
}

export interface PictureDateRange {
  startDate: string | null
  endDate: string | null
  total: number
}

export interface UploadLimits {
  maxFiles: number
  maxFileSize: number
  maxTotalSize: number
  allowedTypes: string[]
}

export interface SiteConfig {
  range: PictureDateRange
  tags: string[]
  upload: UploadLimits
}

export interface PictureQuery {
  startDate?: string
  endDate?: string
  tag?: string
  orientation?: "landscape" | "portrait"
}

export interface UploadItemResult {
  fileName: string
  name?: string
  r2Key?: string
  url?: string
  r2Uploaded?: boolean
  d1Inserted?: boolean
  matched?: boolean
  message?: string
}

export interface UploadResponse {
  ok: boolean
  partial: boolean
  results: UploadItemResult[]
  errors: UploadItemResult[]
}

export interface ObjectCheckResult {
  id: number
  name: string
  url: string
  r2Key?: string
  matched: boolean
  message: string
}

export interface UploadCheckBatch {
  total: number
  checked: number
  offset: number
  limit: number
  done: boolean
  matched: number
  missing: number
  missingItems: ObjectCheckResult[]
  errors: ObjectCheckResult[]
}

export type StatusTone = "idle" | "progress" | "success" | "error"
