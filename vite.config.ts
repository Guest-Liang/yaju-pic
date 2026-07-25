import { cloudflare } from "@cloudflare/vite-plugin"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [vue(), cloudflare()],
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
})
