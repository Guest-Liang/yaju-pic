<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import {
  formatBytes,
  pictureOrientation,
  pictureResolution,
} from "../lib/format"
import type { Picture } from "../types"

const props = defineProps<{ pictures: Picture[]; offset: number }>()
const grid = ref<HTMLOListElement | null>(null)
const failed = reactive(new Set<number>())
const retries = reactive(new Map<number, number>())
let observer: ResizeObserver | undefined

function retry(picture: Picture): void {
  failed.delete(picture.id)
  retries.set(picture.id, (retries.get(picture.id) ?? 0) + 1)
}

function observeCards(): void {
  observer?.disconnect()
  for (const card of grid.value?.querySelectorAll<HTMLElement>(
    ".picture-card",
  ) ?? []) {
    observer?.observe(card)
  }
}

onMounted(() => {
  observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const item = target.parentElement
      if (item)
        item.style.gridRowEnd = `span ${Math.ceil(target.getBoundingClientRect().height) + 20}`
    }
  })
  observeCards()
})

watch(
  () => props.pictures,
  async () => {
    failed.clear()
    retries.clear()
    await nextTick()
    observeCards()
  },
)

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <ol ref="grid" class="result-grid" :start="offset + 1">
    <li v-for="(picture, index) in pictures" :key="picture.id">
      <article class="picture-card">
        <div
          class="picture-preview"
          :style="{
            aspectRatio: `${picture.width || 1} / ${picture.height || 1}`,
          }"
        >
          <a
            v-if="!failed.has(picture.id)"
            :href="picture.url"
            target="_blank"
            rel="noreferrer"
            :aria-label="`查看原图：${picture.name}`"
          >
            <img
              :key="`${picture.id}-${retries.get(picture.id) ?? 0}`"
              :src="picture.url"
              :width="picture.width"
              :height="picture.height"
              :alt="picture.name"
              loading="lazy"
              decoding="async"
              @error="failed.add(picture.id)"
            />
          </a>
          <div v-else class="picture-error" role="status">
            <p>预览加载失败</p>
            <button type="button" class="text-button" @click="retry(picture)">
              重试
            </button>
            <a :href="picture.url" target="_blank" rel="noreferrer"
              >查看原图 ↗</a
            >
          </div>
          <span>{{ String(offset + index + 1).padStart(3, "0") }}</span>
        </div>
        <div class="picture-body">
          <h3>
            <a :href="picture.url" target="_blank" rel="noreferrer">{{
              picture.name
            }}</a>
          </h3>
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
              <dt>原图</dt>
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
      </article>
    </li>
  </ol>
</template>
