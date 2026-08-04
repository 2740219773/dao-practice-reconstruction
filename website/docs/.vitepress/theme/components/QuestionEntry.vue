<script setup lang="ts">
/**
 * QuestionEntry.vue —— 问题卡（方案 7.3 / 十）
 * 标题是完整问题，附一句摘要与关联材料数，不显示内部编号。
 */
import { computed } from 'vue'
import type { Question } from '../data/_lib/types.ts'

const props = defineProps<{ questions: Question[] }>()

const cards = computed(() =>
  props.questions.map((q) => ({
    title: q.title,
    desc: q.briefAnswer,
    url: q.url,
    meta: `${q.level}级依据 · ${q.group}`
  }))
)
</script>

<template>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
    <a v-for="c in cards" :key="c.url" class="wdz-question-card" :href="c.url">
      <span class="wdz-question-card__go">进入探索 →</span>
      <div class="wdz-question-card__title">{{ c.title }}</div>
      <div class="wdz-question-card__desc">{{ c.desc }}</div>
      <div class="wdz-question-card__meta"><span>{{ c.meta }}</span></div>
    </a>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  div { grid-template-columns: 1fr !important; }
}
</style>
