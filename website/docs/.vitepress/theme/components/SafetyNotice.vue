<script setup lang="ts">
/**
 * SafetyNotice.vue —— 安全提示（方案十）
 * 三态：info 一般说明（青灰）/ caution 需要谨慎（朱砂）/ danger 高风险边界（赭）。
 * 不使用普通黄色提示框。
 */
defineProps<{ level: 'info' | 'caution' | 'danger' }>()

const ICONS: Record<string, string> = {
  info: '知',
  caution: '慎',
  danger: '险'
}
</script>

<template>
  <div class="wdz-safety" :class="`wdz-safety--${level}`" role="note">
    <span class="wdz-safety__icon">{{ ICONS[level] }}</span>
    <div><slot /></div>
  </div>
</template>
