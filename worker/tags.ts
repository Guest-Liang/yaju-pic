import curatedTags from "../shared/tags.json"

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}_/
const PARENTHETICAL = /[（(].*$/u

export function buildTagSuggestions(names: readonly string[]): string[] {
  const tags = new Set<string>(curatedTags)

  for (const name of names) {
    for (const tag of extractTagsFromPictureName(name)) {
      tags.add(tag)
    }
  }

  return [...tags].sort((left, right) =>
    left.localeCompare(right, "zh-CN", {
      numeric: true,
      sensitivity: "base",
    }),
  )
}

export function extractTagsFromPictureName(name: string): string[] {
  const withoutExtension = name.replace(/\.[^.]+$/u, "")
  const withoutDate = withoutExtension.replace(DATE_PREFIX, "")
  const subjectSegment = withoutDate.split("_")[0]?.trim() ?? ""
  if (!subjectSegment) {
    return []
  }

  const result = new Set<string>()
  for (const part of subjectSegment.split("&")) {
    const cleaned = part.replace(PARENTHETICAL, "").trim()
    if (cleaned) {
      result.add(cleaned)
    }
  }
  return [...result]
}
