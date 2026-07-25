<script setup lang="ts">
import { computed } from "vue"
import SearchView from "./views/SearchView.vue"
import UploadView from "./views/UploadView.vue"

const isUploadPage = computed(() => window.location.pathname === "/upload")
</script>

<template>
  <UploadView v-if="isUploadPage" />
  <SearchView v-else />
</template>
