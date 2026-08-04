<script setup lang="ts">
/**
 * RelatedReading.vue —— 关联阅读（方案十）
 * 固定三向：原文路线 / 争议辨析 / 关联概念。
 */
import { computed } from 'vue'

const props = defineProps<{
  originals?: { title: string; url?: string }[]
  disputes?: { title: string; url?: string }[]
  concepts?: { title: string; url?: string }[]
}>()

const cols = computed(() => [
  { title: '原文路线', items: props.originals || [] },
  { title: '争议辨析', items: props.disputes || [] },
  { title: '关联概念', items: props.concepts || [] }
])
</script>

<template>
  <div class="wdz-related">
    <div class="wdz-related__title">继续阅读</div>
    <div class="wdz-related__grid">
      <div v-for="col in cols" :key="col.title" class="wdz-related__col">
        <h4>{{ col.title }}</h4>
        <a v-for="(it, i) in col.items" :key="i" :href="it.url || '#'" :class="{ 'is-key': i === 0 }">{{ it.title }}</a>
        <span v-if="!col.items.length" style="font-size: 0.82rem; color: var(--wdz-ink-3);">（暂无公开条目）</span>
      </div>
    </div>
  </div>
</template>
