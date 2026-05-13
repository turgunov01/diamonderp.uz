<script setup lang="ts">
definePageMeta({
  ssr: true
})
</script>

<template>
  <NuxtPage :page-key="route => route.fullPath" />
</template>
