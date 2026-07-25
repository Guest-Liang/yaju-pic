<script setup lang="ts">
import { AUTHOR_LINKS } from "../config/links"
</script>

<template>
  <header class="site-header">
    <nav class="profile-bar" aria-label="鸦居老师的公开主页">
      <span class="profile-bar-label">鸦居老师的公开主页</span>
      <div class="profile-links">
        <a
          v-for="link in AUTHOR_LINKS"
          :key="link.href"
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ link.label }}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </nav>

    <div class="header-main">
      <a class="wordmark" href="/" aria-label="返回图片查询首页">
        <span class="wordmark-mark"></span>
        <span>
          <strong>YAJU ARCHIVE</strong>
          <small>GuestLiang</small>
        </span>
      </a>
      <slot />
    </div>
  </header>
</template>
