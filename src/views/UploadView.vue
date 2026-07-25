<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import SiteHeader from "../components/SiteHeader.vue"
import {
  ApiError,
  checkUploadBatch,
  fetchSiteConfig,
  uploadPictures,
} from "../lib/api"
import { fileIdentity, formatBytes } from "../lib/format"
import type {
  ObjectCheckResult,
  StatusTone,
  UploadItemResult,
  UploadLimits,
} from "../types"

type BadgeTone = "neutral" | "progress" | "success" | "warning" | "error"

interface StatusBadge {
  text: string
  tone: BadgeTone
}

interface FileStatus {
  label: string
  tone: BadgeTone
  note: string
  badges: StatusBadge[]
}

interface CheckSummary {
  total: number
  matched: number
  missing: number
  missingItems: ObjectCheckResult[]
  errors: ObjectCheckResult[]
}

const DEFAULT_LIMITS: UploadLimits = {
  maxFiles: 20,
  maxFileSize: 100 * 1024 * 1024,
  maxTotalSize: 100 * 1024 * 1024,
  allowedTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
}

const fileInput = ref<HTMLInputElement | null>(null)
const files = ref<File[]>([])
const statuses = reactive(new Map<string, FileStatus>())
const limits = ref<UploadLimits>(DEFAULT_LIMITS)
const dragging = ref(false)
const uploading = ref(false)
const uploadStatus = ref("")
const uploadTone = ref<StatusTone>("idle")
const checking = ref(false)
const checkStatus = ref("尚未运行检查")
const checkTone = ref<StatusTone>("idle")
const checkDone = ref(0)
const checkTotal = ref(0)
const checkSummary = ref<CheckSummary | null>(null)

const totalFileSize = computed(() =>
  files.value.reduce((sum, file) => sum + file.size, 0),
)

const fileRows = computed(() =>
  files.value.map((file) => ({
    file,
    key: fileIdentity(file),
    status: statuses.get(fileIdentity(file)) ?? pendingStatus(),
  })),
)

const checkPercent = computed(() =>
  checkTotal.value > 0
    ? Math.round((checkDone.value / checkTotal.value) * 100)
    : 0,
)

const checkOutput = computed(() =>
  checkSummary.value
    ? JSON.stringify(checkSummary.value, null, 2)
    : "尚未运行检查。",
)

async function loadLimits(): Promise<void> {
  try {
    const config = await fetchSiteConfig()
    limits.value = config.upload
  } catch {
    limits.value = DEFAULT_LIMITS
  }
}

function openFilePicker(): void {
  if (!uploading.value) {
    fileInput.value?.click()
  }
}

function onFileInput(event: Event): void {
  const target = event.currentTarget
  if (target instanceof HTMLInputElement && target.files) {
    addFiles(target.files)
    target.value = ""
  }
}

function addFiles(fileList: FileList): void {
  const existing = new Set(files.value.map(fileIdentity))
  const accepted = [...files.value]
  let runningSize = totalFileSize.value
  let rejected = 0

  for (const file of Array.from(fileList)) {
    const key = fileIdentity(file)
    if (existing.has(key)) {
      continue
    }
    if (!limits.value.allowedTypes.includes(file.type)) {
      rejected += 1
      continue
    }
    if (file.size > limits.value.maxFileSize) {
      rejected += 1
      continue
    }
    if (accepted.length >= limits.value.maxFiles) {
      rejected += 1
      continue
    }
    if (runningSize + file.size > limits.value.maxTotalSize) {
      rejected += 1
      continue
    }

    accepted.push(file)
    existing.add(key)
    runningSize += file.size
  }

  files.value = accepted
  if (rejected) {
    uploadStatus.value = `已选择 ${accepted.length} 张；另有 ${rejected} 个文件因格式、数量或大小限制未加入`
    uploadTone.value = "error"
  } else if (accepted.length) {
    uploadStatus.value = `已选择 ${accepted.length} 张图片`
    uploadTone.value = "success"
  } else if (fileList.length) {
    uploadStatus.value = "没有可加入的图片"
    uploadTone.value = "error"
  }
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  dragging.value = false
  if (event.dataTransfer?.files) {
    addFiles(event.dataTransfer.files)
  }
}

function clearFiles(): void {
  files.value = []
  statuses.clear()
  uploadStatus.value = "文件列表已清空"
  uploadTone.value = "idle"
}

async function upload(): Promise<void> {
  if (!files.value.length || uploading.value) {
    return
  }

  uploading.value = true
  uploadStatus.value = "正在上传，请不要关闭页面…"
  uploadTone.value = "progress"
  for (const file of files.value) {
    statuses.set(fileIdentity(file), {
      label: "上传中",
      tone: "progress",
      note: "正在发送至 R2，并写入 D1 索引",
      badges: [],
    })
  }

  try {
    const payload = await uploadPictures(files.value)
    const allResults = [...payload.results, ...payload.errors]
    for (const file of files.value) {
      const result = findResult(allResults, file)
      statuses.set(
        fileIdentity(file),
        result ? resultStatus(result) : unknownResultStatus(),
      )
    }

    if (payload.ok) {
      uploadStatus.value = `上传完成：${payload.results.length} 张成功`
      uploadTone.value = "success"
    } else if (payload.partial) {
      uploadStatus.value = `部分完成：${payload.results.length} 张成功，${payload.errors.length} 张失败`
      uploadTone.value = "error"
    } else {
      uploadStatus.value = payload.errors[0]?.message ?? "上传失败"
      uploadTone.value = "error"
    }
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      window.location.reload()
      return
    }

    const message = error instanceof Error ? error.message : "上传失败"
    for (const file of files.value) {
      statuses.set(fileIdentity(file), {
        label: "失败",
        tone: "error",
        note: message,
        badges: [
          flagBadge("R2", false),
          flagBadge("D1", false),
          flagBadge("匹配", undefined),
        ],
      })
    }
    uploadStatus.value = message
    uploadTone.value = "error"
  } finally {
    uploading.value = false
  }
}

async function runConsistencyCheck(): Promise<void> {
  if (checking.value) {
    return
  }

  checking.value = true
  checkStatus.value = "正在分批检查 D1 与 R2…"
  checkTone.value = "progress"
  checkDone.value = 0
  checkTotal.value = 0
  checkSummary.value = null

  const batchSize = 50
  let offset = 0
  let total = 0
  let matched = 0
  const missingItems: ObjectCheckResult[] = []
  const errors: ObjectCheckResult[] = []

  try {
    while (true) {
      const batch = await checkUploadBatch(offset, batchSize)
      total = batch.total || total
      matched += batch.matched
      missingItems.push(...batch.missingItems)
      errors.push(...batch.errors)
      offset += batch.checked
      checkDone.value = Math.min(offset, total)
      checkTotal.value = total
      checkStatus.value = `检查中：${checkDone.value} / ${total}`

      if (batch.done || batch.checked === 0 || offset >= total) {
        break
      }
    }

    checkSummary.value = {
      total,
      matched,
      missing: missingItems.length,
      missingItems,
      errors,
    }
    checkStatus.value = `检查完成：${matched} 条匹配，${missingItems.length} 条缺失`
    checkTone.value = missingItems.length ? "error" : "success"
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      window.location.reload()
      return
    }
    checkStatus.value =
      error instanceof Error ? error.message : "一致性检查失败"
    checkTone.value = "error"
  } finally {
    checking.value = false
  }
}

function findResult(
  results: readonly UploadItemResult[],
  file: File,
): UploadItemResult | undefined {
  return results.find((result) => result.fileName === file.name)
}

function resultStatus(result: UploadItemResult): FileStatus {
  const failed =
    Boolean(result.message) ||
    result.r2Uploaded === false ||
    result.d1Inserted === false
  return {
    label: failed ? "需要处理" : "上传完成",
    tone: failed ? "error" : "success",
    note: result.message || result.url || "服务已返回逐项结果",
    badges: [
      flagBadge("R2", result.r2Uploaded),
      flagBadge("D1", result.d1Inserted),
      flagBadge("匹配", result.matched),
    ],
  }
}

function pendingStatus(): FileStatus {
  return {
    label: "待上传",
    tone: "neutral",
    note: "等待上传",
    badges: [],
  }
}

function unknownResultStatus(): FileStatus {
  return {
    label: "已提交",
    tone: "warning",
    note: "服务未返回该文件的逐项状态",
    badges: [
      flagBadge("R2", undefined),
      flagBadge("D1", undefined),
      flagBadge("匹配", undefined),
    ],
  }
}

function flagBadge(label: string, value: boolean | undefined): StatusBadge {
  if (value === true) {
    return { text: `${label} ✓`, tone: "success" }
  }
  if (value === false) {
    return { text: `${label} ×`, tone: "error" }
  }
  return { text: `${label} ?`, tone: "warning" }
}

onMounted(() => {
  document.title = "鸦居老师图片上传 · GuestLiang"
  void loadLimits()
})
</script>

<template>
  <div class="site-shell">
    <SiteHeader>
      <a class="header-action" href="/">
        返回查询
        <span aria-hidden="true">←</span>
      </a>
    </SiteHeader>

    <main>
      <section class="archive-intro upload-intro">
        <div>
          <p class="kicker">PRIVATE UPLOAD DESK / 图片入库</p>
          <h1>批量上传与<wbr />一致性检查</h1>
          <p class="intro-copy">
            图片先写入 R2，再写入 D1。每一项都会显示存储、索引与匹配结果。
          </p>
        </div>
        <div class="archive-range">
          <span>当前限制</span>
          <strong>
            {{ limits.maxFiles }} 张 / 共
            {{ formatBytes(limits.maxTotalSize) }}
          </strong>
        </div>
      </section>

      <section class="upload-workspace" aria-label="图片上传工具">
        <section class="upload-panel">
          <div class="panel-heading">
            <span class="panel-index">01</span>
            <div>
              <h2>选择与上传</h2>
              <p>{{ files.length }} files · {{ formatBytes(totalFileSize) }}</p>
            </div>
          </div>

          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            @change="onFileInput"
          />
          <button
            type="button"
            class="drop-zone"
            :class="{ dragging }"
            :disabled="uploading"
            @click="openFilePicker"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop="onDrop"
          >
            <span class="drop-icon" aria-hidden="true">＋</span>
            <strong>拖放图片到这里，或点击选择</strong>
            <small>
              PNG / JPEG / WEBP / GIF · 最多 {{ limits.maxFiles }} 张 ·
              总计不超过 {{ formatBytes(limits.maxTotalSize) }}
            </small>
          </button>

          <div class="upload-actions">
            <button
              type="button"
              class="button"
              :disabled="!files.length || uploading"
              @click="upload"
            >
              {{ uploading ? "上传中…" : "开始上传" }}
            </button>
            <button
              type="button"
              class="button button-secondary"
              :disabled="!files.length || uploading"
              @click="clearFiles"
            >
              清空列表
            </button>
            <p
              class="form-status upload-inline-status"
              :class="`status-${uploadTone}`"
              role="status"
              aria-live="polite"
            >
              {{ uploadStatus }}
            </p>
          </div>

          <div v-if="!fileRows.length" class="file-empty">尚未选择图片。</div>
          <ol v-else class="file-list">
            <li v-for="row in fileRows" :key="row.key" class="file-row">
              <div class="file-ordinal" aria-hidden="true">
                {{ String(fileRows.indexOf(row) + 1).padStart(2, "0") }}
              </div>
              <div class="file-description">
                <strong>{{ row.file.name }}</strong>
                <span>
                  {{ formatBytes(row.file.size) }} ·
                  {{ row.file.type || "unknown" }}
                </span>
                <small>{{ row.status.note }}</small>
              </div>
              <div class="file-result">
                <span class="state-label" :class="`badge-${row.status.tone}`">
                  {{ row.status.label }}
                </span>
                <div v-if="row.status.badges.length" class="file-badges">
                  <span
                    v-for="badge in row.status.badges"
                    :key="badge.text"
                    :class="`badge-${badge.tone}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </li>
          </ol>
        </section>

        <aside class="check-panel">
          <div class="panel-heading">
            <span class="panel-index">02</span>
            <div>
              <h2>一致性检查</h2>
              <p>D1 ↔ R2</p>
            </div>
          </div>

          <p class="check-copy">
            分批读取 D1 图片记录，并确认 R2
            中存在对应对象。检查不会修改或删除数据。
          </p>
          <button
            type="button"
            class="button button-dark"
            :disabled="checking"
            @click="runConsistencyCheck"
          >
            {{ checking ? "检查中…" : "运行检查" }}
          </button>

          <div v-if="checking || checkTotal" class="progress-block">
            <div class="progress-track" aria-hidden="true">
              <span :style="{ width: `${checkPercent}%` }"></span>
            </div>
            <strong>{{ checkPercent }}%</strong>
            <small>{{ checkDone }} / {{ checkTotal }}</small>
          </div>

          <p
            class="form-status"
            :class="`status-${checkTone}`"
            role="status"
            aria-live="polite"
          >
            {{ checkStatus }}
          </p>

          <div v-if="checkSummary" class="check-metrics">
            <div>
              <span>总记录</span>
              <strong>{{ checkSummary.total }}</strong>
            </div>
            <div>
              <span>已匹配</span>
              <strong>{{ checkSummary.matched }}</strong>
            </div>
            <div>
              <span>缺失</span>
              <strong>{{ checkSummary.missing }}</strong>
            </div>
          </div>

          <details class="check-details">
            <summary>查看完整检查结果</summary>
            <pre>{{ checkOutput }}</pre>
          </details>
        </aside>
      </section>
    </main>

    <footer class="site-footer">
      <p>上传与检查接口由 Cloudflare Access 保护</p>
      <p>仅授权账户可以访问</p>
    </footer>
  </div>
</template>
