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
  typeLabel?: string
  sourceLabel?: string
}>()

const g = computed(() => props.glyph || '知')
const gc = computed(() => props.glyphClass || '')
</script>

<template>
  <article class="wdz-knowledge-card">
    <div class="wdz-knowledge-card__glyph" :class="gc" aria-hidden="true">{{ g }}</div>
    <div class="wdz-knowledge-card__body">
      <a class="wdz-knowledge-card__title" :href="item.url">{{ item.title }}</a>
      <p class="wdz-knowledge-card__summary">{{ item.summary }}</p>
      <div class="wdz-knowledge-card__tags">
        <span v-if="item.topics[0]">专题：{{ item.topics[0] }}</span>
        <span v-if="sourceLabel || item.sources[0]">来源：{{ sourceLabel || item.sources[0] }}</span>
      </div>
    </div>
    <dl class="wdz-knowledge-card__meta">
      <div><dt>资料</dt><dd>{{ typeLabel || item.type }}</dd></div>
      <div><dt>状态</dt><dd>{{ item.status }}</dd></div>
      <div v-if="item.evidenceLevel"><dt>证据</dt><dd>{{ item.evidenceLevel }}</dd></div>
      <div v-if="item.riskLevel"><dt>风险</dt><dd>{{ item.riskLevel }}</dd></div>
    </dl>
  </article>
</template>
