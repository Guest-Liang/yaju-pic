export interface PictureRecord {
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

export type PictureInsert = Omit<PictureRecord, "id">

export interface PictureListRecord {
  id: number
  name: string
  url: string
}

export interface PictureDateRange {
  startDate: string | null
  endDate: string | null
  total: number
}

export interface ObjectCheckResult extends PictureListRecord {
  r2Key?: string
  matched: boolean
  message: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}
