import type {
  PictureDateRange,
  PictureInsert,
  PictureListRecord,
  PictureRecord,
} from "./types"

const PICTURES_TABLE = "pictures"
const SEARCHABLE_PICTURE_NAME = `replace(
  replace(name, '(', '（'),
  ')',
  '）'
)`

const PICTURE_COLUMNS = `
  id, name, url, size, width, height, ratio,
  landscape, near_square,
  big_size, small_size, mid_size,
  big_res, small_res, mid_res,
  bjn
`

interface CountResult {
  count: number | string
}

type QueryResult =
  | { results: PictureRecord[]; error?: never; status?: never }
  | { error: string; status: number; results?: never }

export async function getPictureDateRange(env: Env): Promise<PictureDateRange> {
  const raw = await env.yaju_pic_db
    .prepare(
      `SELECT
        MIN(substr(name, 1, 10)) AS startDate,
        MAX(substr(name, 1, 10)) AS endDate,
        COUNT(*) AS total
      FROM ${PICTURES_TABLE}`,
    )
    .first<PictureDateRange>()

  return (
    raw ?? {
      startDate: null,
      endDate: null,
      total: 0,
    }
  )
}

export async function queryPictures(
  env: Env,
  {
    startDate,
    endDate,
    rawTag,
    rawOrientation,
  }: {
    startDate: string
    endDate: string
    rawTag: string
    rawOrientation: string
  },
): Promise<QueryResult> {
  if (!startDate && !endDate && !rawTag && !rawOrientation) {
    return { error: "请指定查询内容", status: 400 }
  }

  const conditions: string[] = []
  const params: Array<string | number> = []

  if (startDate) {
    conditions.push("substr(name, 1, 10) >= ?")
    params.push(startDate)
  }

  if (endDate) {
    conditions.push("substr(name, 1, 10) <= ?")
    params.push(endDate)
  }

  if (rawTag) {
    const tags = safeDecodeURIComponent(rawTag.trim())
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)

    for (const tag of tags) {
      const escapedTag = escapeLikeValue(normalizeTagForSearch(tag))
      conditions.push(`(
        ${SEARCHABLE_PICTURE_NAME} LIKE ? ESCAPE '\\' OR
        ${SEARCHABLE_PICTURE_NAME} LIKE ? ESCAPE '\\' OR
        ${SEARCHABLE_PICTURE_NAME} LIKE ? ESCAPE '\\' OR
        ${SEARCHABLE_PICTURE_NAME} LIKE ? ESCAPE '\\'
      )`)
      params.push(`%\\_${escapedTag}%`)
      params.push(`%&${escapedTag}&%`)
      params.push(`%${escapedTag}\\_%`)
      params.push(`%（${escapedTag}）%`)
    }
  }

  const orientations = parseOrientation(rawOrientation)
  if (orientations.length === 1) {
    conditions.push("landscape = ?")
    params.push(orientations[0] === "landscape" ? 1 : 0)
  }

  if (!conditions.length) {
    return { error: "请指定查询内容", status: 400 }
  }

  const query = `SELECT ${PICTURE_COLUMNS}
    FROM ${PICTURES_TABLE}
    WHERE ${conditions.join(" AND ")}
    ORDER BY substr(name, 1, 10) DESC, id DESC`
  const raw = await env.yaju_pic_db
    .prepare(query)
    .bind(...params)
    .all<PictureRecord>()

  return { results: raw.results ?? [] }
}

export async function insertPicture(
  env: Env,
  picture: PictureInsert,
): Promise<D1Result> {
  const result = await env.yaju_pic_db
    .prepare(
      `INSERT INTO ${PICTURES_TABLE} (
        name, url, size, width, height, ratio,
        landscape, near_square,
        big_size, small_size, mid_size,
        big_res, small_res, mid_res,
        bjn
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      picture.name,
      picture.url,
      picture.size,
      picture.width,
      picture.height,
      picture.ratio,
      picture.landscape,
      picture.near_square,
      picture.big_size,
      picture.small_size,
      picture.mid_size,
      picture.big_res,
      picture.small_res,
      picture.mid_res,
      picture.bjn,
    )
    .run()

  if (!result.success) {
    throw new Error(result.error || "D1 写入失败")
  }
  return result
}

export async function countPictureRecords(env: Env): Promise<number> {
  const raw = await env.yaju_pic_db
    .prepare(`SELECT COUNT(*) AS count FROM ${PICTURES_TABLE}`)
    .first<CountResult>()

  return Number(raw?.count ?? 0)
}

export async function listPictureRecords(
  env: Env,
  paging?: { limit: number; offset: number },
): Promise<PictureListRecord[]> {
  if (paging) {
    const safeLimit = Math.min(Math.max(paging.limit, 1), 100)
    const safeOffset = Math.max(paging.offset, 0)
    const raw = await env.yaju_pic_db
      .prepare(
        `SELECT id, name, url
        FROM ${PICTURES_TABLE}
        ORDER BY id ASC
        LIMIT ? OFFSET ?`,
      )
      .bind(safeLimit, safeOffset)
      .all<PictureListRecord>()
    return raw.results ?? []
  }

  const raw = await env.yaju_pic_db
    .prepare(`SELECT id, name, url FROM ${PICTURES_TABLE} ORDER BY id ASC`)
    .all<PictureListRecord>()
  return raw.results ?? []
}

function parseOrientation(rawOrientation: string): string[] {
  return safeDecodeURIComponent(rawOrientation)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value === "landscape" || value === "portrait")
    .filter((value, index, list) => list.indexOf(value) === index)
}

function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`)
}

function normalizeTagForSearch(value: string): string {
  return value.replaceAll("(", "（").replaceAll(")", "）")
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
