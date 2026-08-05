<script setup lang="ts">
/**
 * TopicRoute.vue —— 文脉路线（方案 7.4 / 9.4）
 * 横向路线（移动端纵向时间轴）。节点三态：已核对 / 部分核对 / 待核对。
 * 用墨点深浅与朱砂标识当前节点，不用进度条百分比。
 */
import { onMounted, ref } from 'vue'

export interface RouteNode {
  id: string
  label: string
  desc: string
  state: 'verified' | 'partial' | 'pending'
  url?: string
}

/** 「静」专题文脉路线（方案 7.4） */
const nodes: RouteNode[] = [
  { id: 'ddj', label: '道德经', desc: '致虚极，守静笃', state: 'verified', url: '/knowledge/原文-0001-道德经第十六章' },
  { id: 'zz', label: '庄子', desc: '心斋 · 坐忘', state: 'partial' },
  { id: 'gz', label: '管子·内业', desc: '心静气理', state: 'partial' },
  { id: 'zw', label: '坐忘论', desc: '收心 · 泰定', state: 'partial' },
  { id: 'modern', label: '近现代解释', desc: '静坐 · 气功传播', state: 'partial' },
  { id: 'research', label: '现代研究', desc: '正念 · 冥想对照', state: 'partial' },
  { id: 'spread', label: '当代传播', desc: '常见说法与误读', state: 'pending' }
]

const visible = ref<boolean[]>(nodes.map(() => false))
const vertical = ref(false)

function checkVertical() {
  vertical.value = typeof window !== 'undefined' && window.innerWidth <= 768
}

onMounted(() => {
  checkVertical()
  window.addEventListener('resize', checkVertical)
  // 依次显现节点（间隔 ≤80ms）
  nodes.forEach((_, i) => {
    setTimeout(() => (visible.value[i] = true), 60 + i * 80)
  })
})
</script>

<template>
  <div>
    <div class="wdz-route" :class="{ 'wdz-route--vertical': vertical }" style="margin-top: 16px;">
      <div
        v-for="(n, i) in nodes"
        :key="n.id"
        class="wdz-route__node"
        :class="{
          'wdz-route__node--partial': n.state === 'partial',
          'wdz-route__node--pending': n.state === 'pending',
          'wdz-route__node--current': n.id === 'zw'
        }"
        :style="{ opacity: visible[i] ? 1 : 0, transition: 'opacity 400ms ease' }"
      >
        <div class="wdz-route__dot" />
        <div class="wdz-route__info">
          <div class="wdz-route__label">{{ n.label }}</div>
          <div class="wdz-route__desc">{{ n.desc }}</div>
          <a v-if="n.url" class="wdz-route__enter" :href="n.url">进入 →</a>
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="wdz-route-legend">
      <span><i style="background: var(--wdz-moss);" />已核对</span>
      <span><i style="background: #a9b3ac;" />部分核对</span>
      <span><i style="background: transparent; border: 1px solid var(--wdz-line-strong);" />待核对</span>
      <span style="margin-left: auto; color: var(--wdz-ink-3);">阅读顺序，不代表单纯继承</span>
    </div>
  </div>
</template>
