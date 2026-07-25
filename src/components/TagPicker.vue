<script setup lang="ts">
import { computed, nextTick, ref } from "vue"

const props = defineProps<{
  modelValue: string[]
  suggestions: string[]
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string[]]
}>()

const input = ref("")
const inputNode = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const activeIndex = ref(0)
const isComposing = ref(false)

const options = computed(() => {
  const query = input.value.trim()
  const normalizedQuery = normalize(query)
  const selected = new Set(props.modelValue)
  const matching = props.suggestions.filter(
    (tag) =>
      !selected.has(tag) &&
      (!normalizedQuery || normalize(tag).includes(normalizedQuery)),
  )

  if (
    query &&
    !selected.has(query) &&
    !matching.some((tag) => normalize(tag) === normalizedQuery)
  ) {
    matching.unshift(query)
  }
  return matching.slice(0, 80)
})

const activeDescendant = computed(() =>
  isOpen.value && options.value.length
    ? `tag-option-${activeIndex.value}`
    : undefined,
)

function normalize(value: string): string {
  return value.toLocaleLowerCase("zh-CN")
}

function open(): void {
  if (!isOpen.value) {
    activeIndex.value = 0
  }
  isOpen.value = true
}

function close(): void {
  isOpen.value = false
}

function add(tag: string): void {
  const cleaned = tag.trim()
  if (!cleaned || props.modelValue.includes(cleaned)) {
    return
  }
  emit("update:modelValue", [...props.modelValue, cleaned])
  input.value = ""
  activeIndex.value = 0
  open()
  void nextTick(() => inputNode.value?.focus())
}

function remove(tag: string): void {
  emit(
    "update:modelValue",
    props.modelValue.filter((item) => item !== tag),
  )
}

function clear(): void {
  emit("update:modelValue", [])
  input.value = ""
  open()
  void nextTick(() => inputNode.value?.focus())
}

function moveActive(step: number): void {
  const count = options.value.length
  if (!count) {
    return
  }
  activeIndex.value = (activeIndex.value + step + count) % count
  void nextTick(() => {
    document
      .getElementById(`tag-option-${activeIndex.value}`)
      ?.scrollIntoView({ block: "nearest" })
  })
}

function onInput(): void {
  activeIndex.value = 0
  if (!isComposing.value) {
    open()
  }
}

function onCompositionEnd(): void {
  isComposing.value = false
  onInput()
}

function onKeydown(event: KeyboardEvent): void {
  if (isComposing.value || event.isComposing) {
    return
  }

  if (event.key === "ArrowDown") {
    event.preventDefault()
    if (isOpen.value) {
      moveActive(1)
    } else {
      open()
    }
    return
  }
  if (event.key === "ArrowUp") {
    event.preventDefault()
    if (isOpen.value) {
      moveActive(-1)
    } else {
      open()
      activeIndex.value = Math.max(options.value.length - 1, 0)
    }
    return
  }
  if (event.key === "Enter") {
    const selectedOption = options.value[activeIndex.value]
    if (isOpen.value && selectedOption) {
      event.preventDefault()
      add(selectedOption)
    } else if (input.value.trim()) {
      event.preventDefault()
      add(input.value)
    }
    return
  }
  if (event.key === "Escape") {
    close()
    return
  }
  if (event.key === "Backspace" && !input.value && props.modelValue.length) {
    const lastTag = props.modelValue.at(-1)
    if (lastTag) {
      remove(lastTag)
    }
  }
}

function onBlur(): void {
  window.setTimeout(close, 120)
}
</script>

<template>
  <div class="tag-picker">
    <div v-if="modelValue.length" class="selected-tags" aria-live="polite">
      <button
        v-for="tag in modelValue"
        :key="tag"
        type="button"
        class="tag-token"
        :aria-label="`移除关键词 ${tag}`"
        @click="remove(tag)"
      >
        <span>{{ tag }}</span>
        <span aria-hidden="true">×</span>
      </button>
    </div>

    <div class="tag-input-row">
      <div class="combobox-wrap">
        <input
          ref="inputNode"
          v-model="input"
          class="control tag-control"
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          :aria-expanded="isOpen"
          aria-controls="tag-options"
          :aria-activedescendant="activeDescendant"
          placeholder="输入关键词，按 Enter 添加"
          @focus="open"
          @click="open"
          @input="onInput"
          @blur="onBlur"
          @keydown="onKeydown"
          @compositionstart="isComposing = true"
          @compositionend="onCompositionEnd"
        />
        <div v-if="isOpen" class="tag-menu">
          <div class="tag-menu-meta">
            {{ options.length ? `${options.length} 个可选项` : "没有匹配项" }}
          </div>
          <ul id="tag-options" class="tag-options" role="listbox">
            <li v-if="!options.length" class="tag-no-result">
              直接按 Enter 也可以添加自定义关键词
            </li>
            <li v-for="(tag, index) in options" :key="`${tag}-${index}`">
              <button
                :id="`tag-option-${index}`"
                type="button"
                role="option"
                class="tag-option"
                :class="{ active: index === activeIndex }"
                :aria-selected="index === activeIndex"
                @mousedown.prevent
                @click="add(tag)"
              >
                <span>{{ tag }}</span>
                <small
                  v-if="input.trim() === tag && !suggestions.includes(tag)"
                >
                  自定义
                </small>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        class="text-button"
        :disabled="!modelValue.length"
        @click="clear"
      >
        清空
      </button>
    </div>

    <p class="field-help">
      支持任意关键词；多个关键词按 AND 查询。方向键选择，Backspace删除最后一项。
    </p>
  </div>
</template>
