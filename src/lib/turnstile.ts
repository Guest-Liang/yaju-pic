const SCRIPT_ID = "cloudflare-turnstile-script"
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

export interface TurnstileApi {
  render(
    container: string | HTMLElement,
    options: {
      sitekey: string
      theme?: "light" | "dark" | "auto"
      size?: "normal" | "compact" | "flexible"
      callback: (token: string) => void
      "expired-callback"?: () => void
      "error-callback"?: () => void
    },
  ): string
  reset(widgetId?: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loadingPromise: Promise<TurnstileApi> | null = null

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile)
  }
  if (loadingPromise) {
    return loadingPromise
  }

  loadingPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID)
    const script =
      existing instanceof HTMLScriptElement
        ? existing
        : document.createElement("script")
    let settled = false

    const timeout = window.setTimeout(() => {
      settled = true
      reject(new Error("人机验证组件加载超时，请刷新后重试"))
    }, 15_000)

    const finish = (): void => {
      if (settled) {
        return
      }
      if (!window.turnstile) {
        window.setTimeout(finish, 50)
        return
      }
      settled = true
      window.clearTimeout(timeout)
      resolve(window.turnstile)
    }

    script.addEventListener("load", finish, { once: true })
    script.addEventListener(
      "error",
      () => {
        settled = true
        window.clearTimeout(timeout)
        reject(new Error("人机验证组件加载失败"))
      },
      { once: true },
    )

    if (!existing) {
      script.id = SCRIPT_ID
      script.src = SCRIPT_URL
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    } else {
      finish()
    }
  }).catch((error: unknown) => {
    loadingPromise = null
    throw error
  })

  return loadingPromise
}
