<script setup lang="ts">
/**
 * FilterDrawer.vue —— 知识索引筛选（方案 8.4）
 * 桌面：左侧 chips；移动端：底部抽屉（mobile-only 模式渲染抽屉触发器与浮层）。
 */
import { computed, ref } from 'vue'

export interface FilterOptions {
  type: { key: string; label: string; count?: number }[]
  evidence: string[]
  risk: string[]
}

const props = withDefaults(defineProps<{
  options: FilterOptions
  mobileOnly?: boolean
}>(), { mobileOnly: false })

const model = defineModel<{ type: string[]; evidence: string[]; risk: string[] }>({ default: () => ({ type: [], evidence: [], risk: [] }) })

const drawerOpen = ref(false)

const activeCount = computed(
  () => model.value.type.length + model.value.evidence.length + model.value.risk.length
)

function toggle(listKey: 'type' | 'evidence' | 'risk', value: string) {
  const list = model.value[listKey]
  model.value = {
    ...model.value,
    [listKey]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }
}

function clearAll() {
  model.value = { type: [], evidence: [], risk: [] }
}

/** 主体（chips 组） */
function chipGroups() {
  const groups: { key: 'type' | 'evidence' | 'risk'; label: string; items: string[] | { key: string; label: string; count?: number }[] }[] = [
    { key: 'type', label: '资料性质', items: props.options.type },
    { key: 'evidence', label: '证据状态', items: props.options.evidence },
    { key: 'risk', label: '风险等级', items: props.options.risk }
  ]
  return groups
}

function chipText(g: { key: 'type' | 'evidence' | 'risk'; items: any[] }, v: any): string {
  if (g.key === 'type') return v.label
  return v
}
</script>

<template>
  <!-- 移动端：抽屉触发器 + 浮层 -->
  <template v-if="mobileOnly">
    <button class="wdz-filter-drawer__toggle" type="button" @click="drawerOpen = true">
      <span>筛选条件{{ activeCount ? `（${activeCount}）` : '' }}</span>
      <span>▾</span>
    </button>
    <div class="wdz-filter-drawer__mask" :class="{ 'is-open': drawerOpen }" @click="drawerOpen = false" />
    <div class="wdz-filter-drawer__sheet" :class="{ 'is-open': drawerOpen }" role="dialog" aria-label="筛选">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <b>筛选条件</b>
        <button class="wdz-filter__clear" type="button" @click="clearAll">清除全部</button>
      </div>
      <div class="wdz-filter">
        <div v-for="g in chipGroups()" :key="g.key" class="wdz-filter__group">
          <label>{{ g.label }}</label>
          <div class="wdz-filter__chips">
            <button
              v-for="v in g.items" :key="String(typeof v === 'object' ? v.key : v)"
              type="button"
              class="wdz-filter__chip"
              :class="{ 'is-active': (model[g.key] as string[]).includes(typeof v === 'object' ? v.key : v) }"
              @click="toggle(g.key, typeof v === 'object' ? v.key : v)"
            >{{ chipText(g, v) }}</button>
          </div>
        </div>
        <button class="wdz-btn wdz-btn--primary" type="button" style="margin-top: 8px;" @click="drawerOpen = false">完成</button>
      </div>
    </div>
  </template>

  <!-- 桌面：左侧栏 -->
  <div v-else class="wdz-filter">
    <div v-for="g in chipGroups()" :key="g.key" class="wdz-filter__group">
      <label>{{ g.label }}</label>
      <div class="wdz-filter__chips">
        <button
          v-for="v in g.items" :key="String(typeof v === 'object' ? v.key : v)"
          type="button"
          class="wdz-filter__chip"
          :class="{ 'is-active': (model[g.key] as string[]).includes(typeof v === 'object' ? v.key : v) }"
          @click="toggle(g.key, typeof v === 'object' ? v.key : v)"
        >{{ chipText(g, v) }}</button>
      </div>
    </div>
    <button v-if="activeCount" class="wdz-filter__clear" type="button" @click="clearAll">清除全部筛选</button>
  </div>
</template>
