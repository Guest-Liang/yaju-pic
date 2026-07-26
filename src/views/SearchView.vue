<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import DatePicker from "../components/DatePicker.vue"
import SiteHeader from "../components/SiteHeader.vue"
import TagPicker from "../components/TagPicker.vue"
import { fetchSiteConfig, queryPictures } from "../lib/api"
import {
  formatBytes,
  pictureOrientation,
  pictureResolution,
} from "../lib/format"
import type { Picture, PictureQuery, SiteConfig, StatusTone } from "../types"

const config = ref<SiteConfig | null>(null)
const configStatus = ref("正在读取归档信息…")
const startDate = ref("")
const endDate = ref("")
const selectedTags = ref<string[]>([])
const landscape = ref(false)
const portrait = ref(false)
const results = ref<Picture[]>([])
const hasSearched = ref(false)
const querying = ref(false)
const queryStatus = ref("")
const queryTone = ref<StatusTone>("idle")
let configRequest: Promise<void> | null = null

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

async function submitQuery(): Promise<void> {
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

  if (!Object.keys(query).length) {
    queryStatus.value = "请至少选择一项查询条件"
    queryTone.value = "error"
    return
  }

  querying.value = true
  hasSearched.value = true
  queryStatus.value = "查询中…"
  queryTone.value = "progress"
  results.value = []
  try {
    const payload = await queryPictures(query)
    results.value = payload
    if (payload.length) {
      queryStatus.value = `找到 ${payload.length} 条记录`
      queryTone.value = "success"
    } else {
      queryStatus.value = "没有符合条件的图片"
      queryTone.value = "idle"
    }
  } catch (error) {
    queryStatus.value = error instanceof Error ? error.message : "查询失败"
    queryTone.value = "error"
  } finally {
    querying.value = false
  }
}

function clearQuery(): void {
  startDate.value = ""
  endDate.value = ""
  selectedTags.value = []
  landscape.value = false
  portrait.value = false
  results.value = []
  hasSearched.value = false
  queryStatus.value = ""
  queryTone.value = "idle"
}

function hideBrokenImage(event: Event): void {
  if (event.currentTarget instanceof HTMLImageElement) {
    event.currentTarget.hidden = true
  }
}

onMounted(() => {
  void loadConfig()
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

        <section class="results-panel" aria-labelledby="results-title">
          <div class="results-heading">
            <div class="panel-heading">
              <span class="panel-index">02</span>
              <div>
                <h2 id="results-title">查询结果</h2>
                <p>{{ results.length }} items</p>
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

          <ol v-else class="result-grid">
            <li
              v-for="(picture, index) in results"
              :key="picture.id || picture.url"
            >
              <a
                class="picture-card"
                :href="picture.url"
                target="_blank"
                rel="noreferrer"
              >
                <div class="picture-preview">
                  <img
                    :src="picture.url"
                    :alt="picture.name"
                    loading="lazy"
                    decoding="async"
                    @error="hideBrokenImage"
                  />
                  <span>{{ String(index + 1).padStart(3, "0") }}</span>
                </div>
                <div class="picture-body">
                  <h3>{{ picture.name }}</h3>
                  <dl class="picture-meta">
                    <div>
                      <dt>尺寸</dt>
                      <dd>{{ picture.width }} × {{ picture.height }}</dd>
                    </div>
                    <div>
                      <dt>比例</dt>
                      <dd>{{ picture.ratio || "—" }}</dd>
                    </div>
                    <div>
                      <dt>文件</dt>
                      <dd>{{ formatBytes(picture.size) }}</dd>
                    </div>
                    <div>
                      <dt>类型</dt>
                      <dd>
                        {{ pictureOrientation(picture) }} ·
                        {{ pictureResolution(picture) }}
                      </dd>
                    </div>
                  </dl>
                </div>
              </a>
            </li>
          </ol>
        </section>
      </section>
    </main>

    <footer class="site-footer">
      <p>图片版权所属：鸦居</p>
      <p>YAJU ARCHIVE · GuestLiang</p>
    </footer>
  </div>
</template>
