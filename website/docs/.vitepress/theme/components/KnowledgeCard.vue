<script setup lang="ts">
/**
 * KnowledgeCard.vue —— 知识索引条目卡（方案 8.4 / 十）
 * 大篆字图标 + 标题 + 摘要 + 标签 + 状态。
 */
import { computed } from 'vue'
import type { KnowledgeItem } from '../data/_lib/types.ts'

const props = defineProps<{
  item: KnowledgeItem
  glyph?: string
  glyphClass?: string
}>()

const g = computed(() => props.glyph || '知')
const gc = computed(() => props.glyphClass || '')
</script>

<template>
  <article class="wdz-knowledge-card">
    <div class="wdz-knowledge-card__glyph" :class="gc" aria-hidden="true">{{ g }}</div>
    <div class="wdz-knowledge-card__body">
      <a class="wdz-knowledge-card__title" :href="item.url">{{ item.title }}</a>
      <span class="wdz-mono" style="color: var(--wdz-ink-3); margin-left: 8px; font-size: 0.78rem;">{{ item.id }}</span>
      <p class="wdz-knowledge-card__summary">{{ item.summary }}</p>
      <div class="wdz-knowledge-card__tags">
        <span class="wdz-badge wdz-badge--plain">{{ item.status }}</span>
        <span v-if="item.evidenceLevel" class="wdz-badge wdz-badge--moss">证据：{{ item.evidenceLevel }}</span>
        <span v-if="item.riskLevel" class="wdz-badge wdz-badge--ochre">风险：{{ item.riskLevel }}</span>
      </div>
    </div>
  </article>
</template>
