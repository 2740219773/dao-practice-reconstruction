<script setup lang="ts">
/**
 * EvidenceBadge.vue —— 证据状态徽章（方案十）
 * 统一显示证据强弱：原文直接支持 / 解释较强 / 项目归纳 / 研究假说 / 尚无充分依据 / 存在反证。
 * 也支持传入原始等级值（T2/I1/C1/S0 等）做归一显示。
 */
import { computed } from 'vue'

const props = defineProps<{ level?: string; label?: string }>()

const EVIDENCE_MAP: Record<string, { text: string; cls: string }> = {
  // 原始值归一
  T1: { text: '原文直接支持', cls: 'wdz-badge--moss' },
  T2: { text: '原文直接支持', cls: 'wdz-badge--moss' },
  T3: { text: '解释较强', cls: 'wdz-badge--vermilion' },
  I1: { text: '解释较强', cls: 'wdz-badge--vermilion' },
  I2: { text: '项目归纳', cls: 'wdz-badge--slate' },
  I3: { text: '项目归纳', cls: 'wdz-badge--slate' },
  I4: { text: '项目归纳（含解释）', cls: 'wdz-badge--slate' },
  M0: { text: '尚无充分依据', cls: 'wdz-badge--plain' },
  M1: { text: '研究假说', cls: 'wdz-badge--plain' },
  M2: { text: '研究假说', cls: 'wdz-badge--plain' },
  C0: { text: '存在反证', cls: 'wdz-badge--ochre' },
  C1: { text: '存在反证', cls: 'wdz-badge--ochre' },
  C2: { text: '存在反证', cls: 'wdz-badge--ochre' },
  C3: { text: '存在反证', cls: 'wdz-badge--ochre' },
  // 语义文案直通
  '原文直接支持': { text: '原文直接支持', cls: 'wdz-badge--moss' },
  '解释较强': { text: '解释较强', cls: 'wdz-badge--vermilion' },
  '项目归纳': { text: '项目归纳', cls: 'wdz-badge--slate' },
  '研究假说': { text: '研究假说', cls: 'wdz-badge--plain' },
  '尚无充分依据': { text: '尚无充分依据', cls: 'wdz-badge--plain' },
  '存在反证': { text: '存在反证', cls: 'wdz-badge--ochre' }
}

const shown = computed(() => {
  const key = props.label || props.level || ''
  const m = EVIDENCE_MAP[key.trim()]
  if (m) return m
  return { text: key || '证据待核', cls: 'wdz-badge--plain' }
})
</script>

<template>
  <span class="wdz-badge" :class="shown.cls">
    <span class="wdz-badge__dot" />证据：{{ shown.text }}
  </span>
</template>
