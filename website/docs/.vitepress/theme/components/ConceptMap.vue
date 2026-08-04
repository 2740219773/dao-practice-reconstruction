<script setup lang="ts">
/**
 * ConceptMap.vue —— 六个核心概念关系图（方案 7.5 / 9.4）
 * SVG 圆形布点：中心「静」（朱砂），5 个概念环绕；右侧摘要面板。
 * 点击概念更新右侧摘要；关系线表示研究关联，不代表固定理论。
 */
import { computed, ref } from 'vue'
import type { KnowledgeItem } from '../data/_lib/types.ts'

const props = defineProps<{ concepts: KnowledgeItem[] }>()

const activeId = ref<string>('')

const active = computed(() =>
  props.concepts.find((c) => c.id === activeId.value) || props.concepts[0] || null
)

/** 环绕布局坐标（半径 150，中心 190,190，viewBox 380×380） */
const placed = computed(() =>
  props.concepts.slice(0, 6).map((c, i) => {
    const n = props.concepts.slice(0, 6).length
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    return {
      ...c,
      x: 190 + 150 * Math.cos(angle),
      y: 190 + 150 * Math.sin(angle)
    }
  })
)

const center = computed(() => placed.value[0])

const glyph = (name: string) => name.slice(0, 1)
</script>

<template>
  <div class="wdz-conceptmap">
    <!-- SVG 关系图 -->
    <div class="wdz-conceptmap__figure">
      <svg class="wdz-conceptmap__svg" viewBox="0 0 380 380" role="img" aria-label="六个核心概念关系图">
        <!-- 关系线（中心→环绕） -->
        <line
          v-for="c in placed.slice(1)"
          :key="c.id"
          :x1="center.x" :y1="center.y" :x2="c.x" :y2="c.y"
          stroke="var(--wdz-line-strong)"
          stroke-width="1"
          :class="{ active: activeId === c.id }"
          :style="{ transition: 'stroke 200ms' }"
        />
        <!-- 环绕概念 -->
        <g
          v-for="c in placed.slice(1)"
          :key="c.id"
          class="wdz-conceptmap__node"
          :transform="`translate(${c.x},${c.y})`"
          @click="activeId = c.id"
        >
          <circle r="26" :fill="activeId === c.id ? 'var(--wdz-vermilion)' : 'var(--wdz-surface)'"
                  :stroke="activeId === c.id ? 'var(--wdz-vermilion)' : 'var(--wdz-line-strong)'" stroke-width="1.2" />
          <text text-anchor="middle" dominant-baseline="central"
                :fill="activeId === c.id ? '#fdf9f2' : 'var(--wdz-ink)'" font-size="16" font-family="var(--wdz-font-serif)">
            {{ glyph(c.title) }}
          </text>
        </g>
        <!-- 中心概念 -->
        <g :transform="`translate(${center.x},${center.y})`">
          <circle r="34" fill="var(--wdz-vermilion)" />
          <text text-anchor="middle" dominant-baseline="central" fill="#fdf9f2" font-size="22" font-family="var(--wdz-font-serif)">
            {{ glyph(center.title) }}
          </text>
        </g>
      </svg>
      <p style="font-size: 0.78rem; color: var(--wdz-ink-3); margin-top: 4px;">关系线表示研究关联，不代表固定理论。点击概念查看摘要。</p>
    </div>

    <!-- 右侧摘要面板 -->
    <div v-if="active" class="wdz-conceptmap__panel">
      <div class="wdz-conceptmap__panel-glyph">{{ glyph(active.title) }}</div>
      <div class="wdz-conceptmap__panel-title">{{ active.title }}</div>
      <div class="wdz-conceptmap__panel-desc">{{ active.summary }}</div>
      <div class="wdz-conceptmap__panel-meta">
        <span v-if="active.evidenceLevel" class="wdz-badge wdz-badge--moss">证据：{{ active.evidenceLevel }}</span>
        <span v-if="active.riskLevel" class="wdz-badge wdz-badge--ochre">风险：{{ active.riskLevel }}</span>
        <span class="wdz-badge wdz-badge--plain">{{ active.status }}</span>
      </div>
      <a class="wdz-conceptmap__panel-link" :href="active.url">查看详情 →</a>
    </div>
  </div>
</template>
