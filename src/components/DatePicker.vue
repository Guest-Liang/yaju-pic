<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

const props = defineProps<{
  label: string
}>()

const model = defineModel<string>({ default: "" })
const root = ref<HTMLElement | null>(null)
const open = ref(false)
const today = startOfDay(new Date())
const initialView = parseIsoDate(model.value) ?? today
const viewYear = ref(initialView.getFullYear())
const viewMonth = ref(initialView.getMonth())

const weekDays = ["日", "一", "二", "三", "四", "五", "六"]

const monthLabel = computed(
  () => `${viewYear.value} 年 ${viewMonth.value + 1} 月`,
)

const displayValue = computed(() => {
  const selected = parseIsoDate(model.value)
  return selected
    ? `${selected.getFullYear()} 年 ${selected.getMonth() + 1} 月 ${selected.getDate()} 日`
    : "选择日期"
})

const calendarDays = computed<(number | null)[]>(() => {
  const leading = new Date(viewYear.value, viewMonth.value, 1).getDay()
  const count = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const result: (number | null)[] = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= count; day += 1) {
    result.push(day)
  }
  return result
})

watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }
  const selected = parseIsoDate(model.value) ?? today
  viewYear.value = selected.getFullYear()
  viewMonth.value = selected.getMonth()
})

function toggle(): void {
  open.value = !open.value
}

function previousMonth(): void {
  const target = new Date(viewYear.value, viewMonth.value - 1, 1)
  viewYear.value = target.getFullYear()
  viewMonth.value = target.getMonth()
}

function nextMonth(): void {
  const target = new Date(viewYear.value, viewMonth.value + 1, 1)
  viewYear.value = target.getFullYear()
  viewMonth.value = target.getMonth()
}

function selectDay(day: number): void {
  model.value = toIsoDate(new Date(viewYear.value, viewMonth.value, day))
  open.value = false
}

function selectToday(): void {
  model.value = toIsoDate(today)
  open.value = false
}

function clear(): void {
  model.value = ""
  open.value = false
}

function isSelected(day: number): boolean {
  return (
    model.value === toIsoDate(new Date(viewYear.value, viewMonth.value, day))
  )
}

function isToday(day: number): boolean {
  return (
    viewYear.value === today.getFullYear() &&
    viewMonth.value === today.getMonth() &&
    day === today.getDate()
  )
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (
    open.value &&
    event.target instanceof Node &&
    !root.value?.contains(event.target)
  ) {
    open.value = false
  }
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const result = new Date(year, month, day)
  return result.getFullYear() === year &&
    result.getMonth() === month &&
    result.getDate() === day
    ? result
    : null
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown)
})
</script>

<template>
  <div ref="root" class="date-picker" @keydown.esc.stop="open = false">
    <button
      type="button"
      class="date-trigger"
      :class="{ selected: model }"
      :aria-label="`${props.label}：${displayValue}`"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <span>{{ displayValue }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
        />
      </svg>
    </button>

    <Transition name="calendar-popover">
      <div
        v-if="open"
        class="date-popover"
        role="dialog"
        :aria-label="`${props.label}月历`"
      >
        <div class="calendar-heading">
          <button
            type="button"
            class="calendar-arrow"
            aria-label="上个月"
            @click="previousMonth"
          >
            ‹
          </button>
          <strong>{{ monthLabel }}</strong>
          <button
            type="button"
            class="calendar-arrow"
            aria-label="下个月"
            @click="nextMonth"
          >
            ›
          </button>
        </div>

        <div class="calendar-weekdays" aria-hidden="true">
          <span v-for="weekDay in weekDays" :key="weekDay">
            {{ weekDay }}
          </span>
        </div>

        <div class="calendar-grid">
          <template
            v-for="(day, index) in calendarDays"
            :key="`${day}-${index}`"
          >
            <span v-if="day === null" class="calendar-blank"></span>
            <button
              v-else
              type="button"
              :class="{
                selected: isSelected(day),
                today: isToday(day),
              }"
              :aria-label="`${viewYear}年${viewMonth + 1}月${day}日`"
              :aria-pressed="isSelected(day)"
              @click="selectDay(day)"
            >
              {{ day }}
            </button>
          </template>
        </div>

        <div class="calendar-actions">
          <button type="button" @click="selectToday">今天</button>
          <button type="button" :disabled="!model" @click="clear">清空</button>
        </div>
      </div>
    </Transition>
  </div>
</template>
