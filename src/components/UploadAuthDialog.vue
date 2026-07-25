<script setup lang="ts">
import { nextTick, onUnmounted, ref } from "vue"
import { authorizeUpload } from "../lib/api"
import { loadTurnstile, type TurnstileApi } from "../lib/turnstile"
import type { StatusTone } from "../types"

const props = defineProps<{
  siteKey: string
}>()

const dialog = ref<HTMLDialogElement | null>(null)
const turnstileContainer = ref<HTMLDivElement | null>(null)
const passwordInput = ref<HTMLInputElement | null>(null)
const password = ref("")
const token = ref("")
const status = ref("")
const tone = ref<StatusTone>("idle")
const submitting = ref(false)

let turnstile: TurnstileApi | null = null
let widgetId: string | null = null

async function open(): Promise<void> {
  password.value = ""
  token.value = ""
  status.value = ""
  tone.value = "idle"
  dialog.value?.showModal()
  await nextTick()
  passwordInput.value?.focus()
  await renderTurnstile()
}

function close(): void {
  dialog.value?.close()
}

async function renderTurnstile(): Promise<void> {
  if (!props.siteKey) {
    status.value = "Turnstile site key 未配置"
    tone.value = "error"
    return
  }
  if (!turnstileContainer.value) {
    return
  }

  status.value = "正在载入人机验证…"
  tone.value = "progress"
  try {
    turnstile = await loadTurnstile()
    if (widgetId) {
      turnstile.remove(widgetId)
    }
    turnstileContainer.value.replaceChildren()
    widgetId = turnstile.render(turnstileContainer.value, {
      sitekey: props.siteKey,
      theme: "light",
      size: "flexible",
      callback: (value) => {
        token.value = value
        status.value = ""
        tone.value = "idle"
      },
      "expired-callback": () => {
        token.value = ""
        status.value = "验证已过期，请重新完成验证"
        tone.value = "error"
      },
      "error-callback": () => {
        token.value = ""
        status.value = "人机验证加载失败，请重试"
        tone.value = "error"
      },
    })
  } catch (error) {
    status.value = error instanceof Error ? error.message : "人机验证加载失败"
    tone.value = "error"
  }
}

function cleanup(): void {
  password.value = ""
  token.value = ""
  submitting.value = false
  if (turnstile && widgetId) {
    turnstile.remove(widgetId)
  }
  widgetId = null
  turnstileContainer.value?.replaceChildren()
}

async function submit(): Promise<void> {
  if (!token.value) {
    status.value = "请先完成人机验证"
    tone.value = "error"
    return
  }

  submitting.value = true
  status.value = "正在验证…"
  tone.value = "progress"
  try {
    await authorizeUpload(password.value, token.value)
    status.value = "验证通过，正在进入上传页…"
    tone.value = "success"
    window.location.assign("/upload")
  } catch (error) {
    status.value = error instanceof Error ? error.message : "验证失败"
    tone.value = "error"
    token.value = ""
    if (turnstile && widgetId) {
      turnstile.reset(widgetId)
    }
  } finally {
    submitting.value = false
  }
}

onUnmounted(cleanup)

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="auth-dialog" @close="cleanup">
    <form class="auth-form" @submit.prevent="submit">
      <div class="dialog-heading">
        <div>
          <p class="kicker">UPLOAD ACCESS</p>
          <h2>上传验证</h2>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="关闭上传验证"
          @click="close"
        >
          ×
        </button>
      </div>

      <p class="dialog-copy">
        输入上传密码并完成人机验证。密码仅通过请求正文提交，不会写入网址。
      </p>

      <div ref="turnstileContainer" class="turnstile-slot"></div>

      <label class="field">
        <span class="field-label">上传密码</span>
        <input
          ref="passwordInput"
          v-model="password"
          class="control"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>

      <p
        class="form-status"
        :class="`status-${tone}`"
        role="status"
        aria-live="polite"
      >
        {{ status }}
      </p>

      <div class="dialog-actions">
        <button type="button" class="button button-secondary" @click="close">
          取消
        </button>
        <button type="submit" class="button" :disabled="submitting">
          {{ submitting ? "验证中…" : "进入上传页" }}
        </button>
      </div>
    </form>
  </dialog>
</template>
