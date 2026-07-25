import type { Picture } from "../types"

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "未知"
  }
  if (bytes === 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

export function pictureOrientation(picture: Picture): string {
  if (picture.near_square === 1) {
    return "近正方形"
  }
  return picture.landscape === 1 ? "横屏" : "竖屏"
}

export function pictureResolution(picture: Picture): string {
  if (picture.big_res === 1) {
    return "高分辨率"
  }
  if (picture.small_res === 1) {
    return "低分辨率"
  }
  return "中等分辨率"
}

export function fileIdentity(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`
}
