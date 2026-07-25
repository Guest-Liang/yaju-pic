import curatedTags from "../shared/tags.json"

export function getTagSuggestions(): string[] {
  return [...new Set(curatedTags)]
}
