export const QUERY_PAGE_SIZE = 10
export const MAX_QUERY_TAGS = 5
export const MAX_TAG_LENGTH = 32

export function parseQueryTags(value: string): string[] {
  let decoded = value.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // A literal percent sign is still a valid search keyword.
  }
  return decoded
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

export function validateDateRange(startDate = "", endDate = ""): string | null {
  if (
    (startDate && !isIsoDate(startDate)) ||
    (endDate && !isIsoDate(endDate))
  ) {
    return "请选择有效的日期（YYYY-MM-DD）"
  }
  if (startDate && endDate && startDate > endDate) {
    return "开始日期不能晚于结束日期"
  }
  return null
}

export function recentDateRange(
  days: 7 | 15 | 30,
  now = new Date(),
): {
  startDate: string
  endDate: string
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  const endDate = `${part("year")}-${part("month")}-${part("day")}`
  const start = new Date(`${endDate}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  return { startDate: start.toISOString().slice(0, 10), endDate }
}
