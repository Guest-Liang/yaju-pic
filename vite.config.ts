import { cloudflare } from "@cloudflare/vite-plugin"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

const LOCAL_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"

export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    cloudflare({
      config:
        command === "serve"
          ? (config) => ({
              vars: {
                ...config.vars,
                TURNSTILE_SITE_KEY: LOCAL_TURNSTILE_SITE_KEY,
              },
            })
          : undefined,
    }),
  ],
  server: {
    watch: {
      ignored: [
        "**/.playwright-cli/**",
        "**/.wrangler/**",
        "**/dist/**",
        "**/output/**",
      ],
    },
  },
}))
