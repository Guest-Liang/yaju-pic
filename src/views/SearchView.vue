<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import {
  MAX_QUERY_TAGS,
  parseQueryTags,
  QUERY_PAGE_SIZE,
  recentDateRange,
  validateDateRange,
} from "../../shared/query"
import DatePicker from "../components/DatePicker.vue"
import PictureGrid from "../components/PictureGrid.vue"
import SiteHeader from "../components/SiteHeader.vue"
import TagPicker from "../components/TagPicker.vue"
import { fetchSiteConfig, queryPictures } from "../lib/api"
import type {
  PicturePage,
  PictureQuery,
  SiteConfig,
  StatusTone,
} from "../types"

const config = ref<SiteConfig | null>(null)
const configStatus = ref("正在读取归档信息…")
const startDate = ref("")
const endDate = ref("")
const selectedTags = ref<string[]>([])
const landscape = ref(false)
const portrait = ref(false)
const page = ref<PicturePage | null>(null)
const results = computed(() => page.value?.items ?? [])
const submittedQuery = ref<PictureQuery | null>(null)
const resultsPanel = ref<HTMLElement | null>(null)
const failedOffset = ref<number | null>(null)
const hasSearched = ref(false)
const querying = ref(false)
const queryStatus = ref("")
const queryTone = ref<StatusTone>("idle")
let configRequest: Promise<void> | null = null
let queryController: AbortController | null = null
let querySequence = 0
const dateError = computed(() =>
  validateDateRange(startDate.value, endDate.value),
)
const pageNumber = computed(
  () => Math.floor((page.value?.offset ?? 0) / QUERY_PAGE_SIZE) + 1,
)
const recentRanges = [
  { label: "最近 7 天", days: 7 },
  { label: "最近 15 天", days: 15 },
  { label: "最近一个月", days: 30 },
] as const
const selectedRecent = computed(
  () =>
    recentRanges.find(({ days }) => {
      const range = recentDateRange(days)
      return (
        range.startDate === startDate.value && range.endDate === endDate.value
      )
    })?.days,
)
const queryChanged = computed(
  () =>
    submittedQuery.value &&
    JSON.stringify(buildQuery()) !== JSON.stringify(submittedQuery.value),
)

const rangeText = computed(() => {
  const range = config.value?.range
  if (!range?.startDate || !range.endDate) {
    return configStatus.value
  }
  return `${range.startDate} — ${range.endDate} · ${range.total} 张`
})

const orientation = computed<PictureQuery["orientation"]>(() => {
  if (landscape.value === portrait.value) {
    return undefined
  }
  return landscape.value ? "landscape" : "portrait"
})

async function loadConfig(): Promise<void> {
  if (!configRequest) {
    configRequest = (async () => {
      try {
        config.value = await fetchSiteConfig()
        configStatus.value = "暂无图片"
      } catch (error) {
        configStatus.value =
          error instanceof Error ? error.message : "归档信息读取失败"
      }
    })().finally(() => {
      configRequest = null
    })
  }
  await configRequest
}

function buildQuery(): PictureQuery {
  const query: PictureQuery = {}
  if (startDate.value) {
    query.startDate = startDate.value
  }
  if (endDate.value) {
    query.endDate = endDate.value
  }
  if (selectedTags.value.length) {
    query.tag = selectedTags.value.join(",")
  }
  if (orientation.value) {
    query.orientation = orientation.value
  }
  return query
}

function chooseRecent(days: 7 | 15 | 30): void {
  const range = recentDateRange(days)
  startDate.value = range.startDate
  endDate.value = range.endDate
}

async function submitQuery(): Promise<void> {
  const query = buildQuery()
  const error =
    dateError.value ||
    (parseQueryTags(query.tag ?? "").length > MAX_QUERY_TAGS
      ? `最多同时查询 ${MAX_QUERY_TAGS} 个关键词`
      : null)
  if (error) {
    queryStatus.value = error
    queryTone.value = "error"
    return
  }

  if (!Object.keys(query).length) {
    queryStatus.value = "请至少选择一项查询条件"
    queryTone.value = "error"
    return
  }

  submittedQuery.value = query
  page.value = null
  hasSearched.value = true
  await loadPage(0)
}

async function loadPage(offset: number, scroll = false): Promise<void> {
  if (!submittedQuery.value) return
  queryController?.abort()
  const sequence = ++querySequence
  const controller = new AbortController()
  queryController = controller
  querying.value = true
  failedOffset.value = null
  queryStatus.value = `正在读取第 ${Math.floor(offset / QUERY_PAGE_SIZE) + 1} 页…`
  queryTone.value = "progress"
  try {
    const payload = await queryPictures(
      submittedQuery.value,
      offset,
      controller.signal,
    )
    if (sequence !== querySequence) return
    page.value = payload
    if (payload.items.length) {
      queryStatus.value = `第 ${pageNumber.value} 页 · 显示第 ${offset + 1}–${offset + payload.items.length} 张`
      queryTone.value = "success"
    } else {
      queryStatus.value = offset ? "这一页没有更多图片" : "没有符合条件的图片"
      queryTone.value = "idle"
    }
    if (scroll) {
      await nextTick()
      if (sequence === querySequence)
        resultsPanel.value?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        })
    }
  } catch (error) {
    if (sequence !== querySequence || controller.signal.aborted) return
    failedOffset.value = offset
    queryStatus.value = error instanceof Error ? error.message : "查询失败"
    queryTone.value = "error"
  } finally {
    if (sequence === querySequence) {
      querying.value = false
      queryController = null
    }
  }
}

function clearQuery(): void {
  queryController?.abort()
  queryController = null
  querySequence += 1
  querying.value = false
  submittedQuery.value = null
  page.value = null
  failedOffset.value = null
  startDate.value = ""
  endDate.value = ""
  selectedTags.value = []
  landscape.value = false
  portrait.value = false
  hasSearched.value = false
  queryStatus.value = ""
  queryTone.value = "idle"
}

onMounted(() => {
  void loadConfig()
})

onBeforeUnmount(() => {
  queryController?.abort()
  querySequence += 1
})
</script>

<template>
  <div class="site-shell">
    <SiteHeader>
      <a class="header-action" href="/upload">
        上传图片
        <span aria-hidden="true">↗</span>
      </a>
    </SiteHeader>

    <main>
      <section class="archive-intro">
        <div>
          <p class="kicker">PUBLIC IMAGE INDEX / 公开图片索引</p>
          <h1>鸦居老师<wbr />图片查询</h1>
          <p class="intro-copy">
            按日期、关键词与画面方向组合筛选。关键词可以从建议中选择，也可以直接输入。
          </p>
        </div>
        <div class="archive-range">
          <span>当前收录范围</span>
          <strong>{{ rangeText }}</strong>
        </div>
      </section>

      <section class="workspace" aria-label="图片查询工具">
        <form class="filter-panel" @submit.prevent="submitQuery">
          <div class="panel-heading">
            <span class="panel-index">01</span>
            <div>
              <h2>筛选条件</h2>
              <p>多项条件同时生效</p>
            </div>
          </div>

          <fieldset class="filter-section">
            <legend>发布日期</legend>
            <div class="date-grid">
              <label class="field">
                <span class="field-label">开始</span>
                <DatePicker v-model="startDate" label="开始日期" />
              </label>
              <label class="field">
                <span class="field-label">结束</span>
                <DatePicker v-model="endDate" label="结束日期" />
              </label>
            </div>
            <div class="date-shortcuts" role="group" aria-label="快捷日期范围">
              <button
                v-for="range in recentRanges"
                :key="range.days"
                type="button"
                :aria-pressed="selectedRecent === range.days"
                @click="chooseRecent(range.days)"
              >
                {{ range.label }}
              </button>
            </div>
            <p class="field-help">
              快捷范围包含今天；最近一个月按 30 天计算。也可只选开始或结束日期。
            </p>
            <p v-if="dateError" class="field-help status-error" role="alert">
              {{ dateError }}
            </p>
          </fieldset>

          <fieldset class="filter-section">
            <legend>关键词</legend>
            <TagPicker
              v-model="selectedTags"
              :suggestions="config?.tags ?? []"
            />
          </fieldset>

          <fieldset class="filter-section">
            <legend>画面方向</legend>
            <div class="orientation-grid">
              <label class="choice-row">
                <input v-model="landscape" type="checkbox" />
                <span>
                  <strong>横屏</strong>
                  <small>宽度大于高度</small>
                </span>
              </label>
              <label class="choice-row">
                <input v-model="portrait" type="checkbox" />
                <span>
                  <strong>竖屏</strong>
                  <small>高度不小于宽度</small>
                </span>
              </label>
            </div>
            <p class="field-help">同时勾选或都不选时，不限制方向。</p>
          </fieldset>

          <div class="filter-actions">
            <button class="button" type="submit" :disabled="querying">
              {{ querying ? "查询中…" : "开始查询" }}
            </button>
            <button
              class="button button-secondary"
              type="button"
              @click="clearQuery"
            >
              重置
            </button>
          </div>
        </form>

        <section
          ref="resultsPanel"
          class="results-panel"
          aria-labelledby="results-title"
          :aria-busy="querying"
        >
          <div class="results-heading">
            <div class="panel-heading">
              <span class="panel-index">02</span>
              <div>
                <h2 id="results-title">查询结果</h2>
                <p>
                  每页 {{ QUERY_PAGE_SIZE }} 张<span v-if="page">
                    · 本页 {{ results.length }} 张</span
                  >
                </p>
              </div>
            </div>
            <p
              class="query-status"
              :class="`status-${queryTone}`"
              role="status"
              aria-live="polite"
            >
              {{ queryStatus }}
            </p>
          </div>

          <p v-if="queryChanged" class="field-help">
            筛选条件已更改，点击“开始查询”后生效。
          </p>
          <button
            v-if="failedOffset !== null && !querying"
            class="button button-secondary query-retry"
            type="button"
            @click="loadPage(failedOffset)"
          >
            重试这一页
          </button>

          <div
            v-if="!hasSearched"
            class="result-placeholder result-placeholder-plain"
          >
            <p>选择条件开始查询</p>
          </div>
          <div
            v-else-if="!querying && !results.length"
            class="result-placeholder"
          >
            <p>{{ queryStatus || "没有查询结果" }}</p>
          </div>

          <div
            v-else-if="querying && !results.length"
            class="result-placeholder"
          >
            <p>正在读取图片…</p>
          </div>
          <PictureGrid
            v-if="results.length"
            :pictures="results"
            :offset="page?.offset ?? 0"
          />
          <nav
            v-if="page && (results.length || page.offset > 0)"
            class="pagination"
            aria-label="查询结果分页"
          >
            <button
              type="button"
              class="button button-secondary"
              :disabled="querying || page.offset === 0"
              @click="
                loadPage(Math.max(0, page.offset - QUERY_PAGE_SIZE), true)
              "
            >
              上一页
            </button>
            <span
              >第 {{ pageNumber }} 页<span v-if="page.done">
                · 已到末页</span
              ></span
            >
            <button
              type="button"
              class="button"
              :disabled="querying || page.nextOffset === null"
              @click="
                page.nextOffset !== null && loadPage(page.nextOffset, true)
              "
            >
              下一页
            </button>
          </nav>
        </section>
      </section>
    </main>

    <footer class="site-footer">
      <p>图片版权所属：鸦居</p>
      <p>YAJU ARCHIVE · GuestLiang</p>
    </footer>
  </div>
</template>
