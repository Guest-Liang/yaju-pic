import type { PictureInsert } from "./types"

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])
export const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])
export const MAX_FILE_SIZE = 100 * 1024 * 1024
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024
export const MAX_UPLOAD_COUNT = 20

type ImageDimensions = {
  width: number
  height: number
}

export function collectImageFiles(formData: FormData): File[] {
  const files: File[] = []
  for (const value of formData.values()) {
    if (value instanceof File) {
      files.push(value)
    }
  }
  return files
}

export function validateUploadBatch(files: readonly File[]): void {
  if (!files.length) {
    throw new Error("请选择至少一张图片")
  }
  if (files.length > MAX_UPLOAD_COUNT) {
    throw new Error(`一次最多上传 ${MAX_UPLOAD_COUNT} 张图片`)
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (totalSize > MAX_UPLOAD_SIZE) {
    throw new Error("一次上传的文件总大小不能超过 100 MB")
  }
}

export async function readAndBuildPictureMeta(
  file: File,
  finalName: string,
  url: string,
): Promise<{ arrayBuffer: ArrayBuffer; picture: PictureInsert }> {
  validateImageFile(file)
  const arrayBuffer = await file.arrayBuffer()
  const { width, height } = parseImageDimensions(arrayBuffer, file.type)
  const ratio = Number((width / height).toFixed(3))
  const bigSize = file.size > 600_000
  const smallSize = file.size < 100_000
  const bigResolution = width > 1440 || height > 1440
  const smallResolution = width < 640 || height < 640

  return {
    arrayBuffer,
    picture: {
      name: finalName,
      url,
      size: file.size,
      width,
      height,
      ratio,
      landscape: width > height ? 1 : 0,
      near_square: ratio > 0.9090909 && ratio < 1.1 ? 1 : 0,
      big_size: bigSize ? 1 : 0,
      small_size: smallSize ? 1 : 0,
      mid_size: !bigSize && !smallSize ? 1 : 0,
      big_res: bigResolution ? 1 : 0,
      small_res: smallResolution ? 1 : 0,
      mid_res: !bigResolution && !smallResolution ? 1 : 0,
      bjn: finalName.includes("bjn") ? 1 : 0,
    },
  }
}

export function validateImageFile(file: File): void {
  if (!file.name) {
    throw new Error("文件名不能为空")
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("仅支持 PNG、JPEG、WEBP、GIF 图片")
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("单个文件不能超过 100 MB")
  }
  if (file.size <= 0) {
    throw new Error("文件内容为空")
  }

  const extension = getExtension(file.name)
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("文件扩展名必须是 png、jpg、jpeg、webp 或 gif")
  }
  if (!mimeMatchesExtension(file.type, extension)) {
    throw new Error("文件 MIME 类型与扩展名不匹配")
  }
}

export function sanitizeFileName(fileName: string): string {
  const original = String(fileName || "")
  const withoutSeparators = original.replace(/[\\/]+/gu, "")
  const cleaned = withoutSeparators
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu,
      "",
    )
    .replace(/\.\.+/gu, ".")
    .trim()

  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error("文件名无效，请修改后重新上传")
  }
  if (cleaned !== original) {
    throw new Error(
      "文件名包含路径分隔符、控制字符或路径穿越片段，请修改文件名后重新上传",
    )
  }
  return cleaned
}

function getExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".")
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : ""
}

function mimeMatchesExtension(mimeType: string, extension: string): boolean {
  if (mimeType === "image/jpeg") {
    return extension === "jpg" || extension === "jpeg"
  }
  return mimeType === `image/${extension}`
}

function parseImageDimensions(
  arrayBuffer: ArrayBuffer,
  mimeType: string,
): ImageDimensions {
  const view = new DataView(arrayBuffer)
  const parsers: Record<string, (value: DataView) => ImageDimensions> = {
    "image/png": parsePng,
    "image/jpeg": parseJpeg,
    "image/gif": parseGif,
    "image/webp": parseWebp,
  }
  const candidates = [mimeType, ...ALLOWED_IMAGE_TYPES].filter(
    (type, index, list) => Boolean(type) && list.indexOf(type) === index,
  )
  const errors: string[] = []

  for (const candidate of candidates) {
    const parser = parsers[candidate]
    if (!parser) {
      continue
    }
    try {
      return parser(view)
    } catch (error) {
      errors.push(errorMessage(error, "解析失败"))
    }
  }

  throw new Error(
    "无法解析图片尺寸，文件内容不是可识别的 PNG/JPEG/WEBP/GIF 图片" +
      `（${errors[0] ?? "格式无效"}）`,
  )
}

function parsePng(view: DataView): ImageDimensions {
  if (
    view.byteLength < 33 ||
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a
  ) {
    throw new Error("PNG 文件格式无效")
  }
  if (readAscii(view, 12, 4) !== "IHDR") {
    throw new Error("PNG 缺少 IHDR 尺寸信息")
  }
  return ensureDimensions(view.getUint32(16), view.getUint32(20), "PNG")
}

function parseGif(view: DataView): ImageDimensions {
  if (view.byteLength < 10) {
    throw new Error("GIF 文件格式无效")
  }
  const header = readAscii(view, 0, 6)
  if (header !== "GIF87a" && header !== "GIF89a") {
    throw new Error("GIF 文件格式无效")
  }
  return ensureDimensions(
    view.getUint16(6, true),
    view.getUint16(8, true),
    "GIF",
  )
}

function parseJpeg(view: DataView): ImageDimensions {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    throw new Error("JPEG 文件格式无效")
  }

  let offset = 2
  while (offset < view.byteLength) {
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) {
      offset += 1
    }
    if (offset >= view.byteLength) {
      break
    }

    const marker = view.getUint8(offset)
    offset += 1
    if (marker === 0xd9 || marker === 0xda) {
      break
    }
    if (offset + 2 > view.byteLength) {
      break
    }

    const length = view.getUint16(offset)
    if (length < 2 || offset + length > view.byteLength) {
      throw new Error("JPEG 段长度无效")
    }

    if (isJpegStartOfFrame(marker)) {
      if (length < 7) {
        throw new Error("JPEG 尺寸信息无效")
      }
      return ensureDimensions(
        view.getUint16(offset + 5),
        view.getUint16(offset + 3),
        "JPEG",
      )
    }
    offset += length
  }

  throw new Error("无法解析 JPEG 尺寸")
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  )
}

function parseWebp(view: DataView): ImageDimensions {
  if (
    view.byteLength < 30 ||
    readAscii(view, 0, 4) !== "RIFF" ||
    readAscii(view, 8, 4) !== "WEBP"
  ) {
    throw new Error("WEBP 文件格式无效")
  }

  let offset = 12
  while (offset + 8 <= view.byteLength) {
    const chunkType = readAscii(view, offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const dataOffset = offset + 8
    if (dataOffset + chunkSize > view.byteLength) {
      throw new Error("WEBP chunk 长度无效")
    }

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return ensureDimensions(
        1 + readUint24LE(view, dataOffset + 4),
        1 + readUint24LE(view, dataOffset + 7),
        "WEBP",
      )
    }

    if (chunkType === "VP8 " && chunkSize >= 10) {
      if (
        view.getUint8(dataOffset + 3) !== 0x9d ||
        view.getUint8(dataOffset + 4) !== 0x01 ||
        view.getUint8(dataOffset + 5) !== 0x2a
      ) {
        throw new Error("WEBP VP8 帧头无效")
      }
      return ensureDimensions(
        view.getUint16(dataOffset + 6, true) & 0x3fff,
        view.getUint16(dataOffset + 8, true) & 0x3fff,
        "WEBP",
      )
    }

    if (chunkType === "VP8L" && chunkSize >= 5) {
      if (view.getUint8(dataOffset) !== 0x2f) {
        throw new Error("WEBP VP8L 帧头无效")
      }
      const b1 = view.getUint8(dataOffset + 1)
      const b2 = view.getUint8(dataOffset + 2)
      const b3 = view.getUint8(dataOffset + 3)
      const b4 = view.getUint8(dataOffset + 4)
      return ensureDimensions(
        1 + (((b2 & 0x3f) << 8) | b1),
        1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
        "WEBP",
      )
    }

    offset = dataOffset + chunkSize + (chunkSize % 2)
  }

  throw new Error("无法解析 WEBP 尺寸")
}

function ensureDimensions(
  width: number,
  height: number,
  format: string,
): ImageDimensions {
  if (!width || !height) {
    throw new Error(`${format} 尺寸信息无效`)
  }
  return { width, height }
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = ""
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index))
  }
  return value
}

function readUint24LE(view: DataView, offset: number): number {
  return (
    view.getUint8(offset) |
    (view.getUint8(offset + 1) << 8) |
    (view.getUint8(offset + 2) << 16)
  )
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
