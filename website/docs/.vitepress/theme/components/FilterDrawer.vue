<script setup lang="ts">
/**
 * FilterDrawer.vue —— 知识索引筛选（方案 8.4）
 * 桌面：左侧 chips；移动端：底部抽屉（mobile-only 模式渲染抽屉触发器与浮层）。
 */
import { computed, ref } from 'vue'

export interface FilterOptions {
  type: { key: string; label: string; count?: number }[]
  topic: FilterChoice[]
  concept: FilterChoice[]
  source: FilterChoice[]
  evidence: FilterChoice[]
  risk: FilterChoice[]
  date: FilterChoice[]
}

export interface FilterChoice { key: string; label: string }

const props = withDefaults(defineProps<{
  options: FilterOptions
  mobileOnly?: boolean
}>(), { mobileOnly: false })

type FilterModel = { type: string[]; topic: string[]; concept: string[]; source: string[]; evidence: string[]; risk: string[]; date: string[] }
const model = defineModel<FilterModel>({ default: () => ({ type: [], topic: [], concept: [], source: [], evidence: [], risk: [], date: [] }) })

const drawerOpen = ref(false)

const activeCount = computed(
  () => Object.values(model.value).reduce((count, values) => count + values.length, 0)
)

function toggle(listKey: keyof FilterModel, value: string) {
  const list = model.value[listKey]
  model.value = {
    ...model.value,
    [listKey]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }
}

function clearAll() {
  model.value = { type: [], topic: [], concept: [], source: [], evidence: [], risk: [], date: [] }
}

/** 主体（chips 组） */
function chipGroups() {
  const groups: { key: keyof FilterModel; label: string; items: FilterChoice[] }[] = [
    { key: 'type', label: '资料性质', items: props.options.type },
    { key: 'topic', label: '专题', items: props.options.topic },
    { key: 'concept', label: '概念', items: props.options.concept },
    { key: 'source', label: '典籍与来源', items: props.options.source },
    { key: 'evidence', label: '证据状态', items: props.options.evidence },
    { key: 'risk', label: '风险等级', items: props.options.risk },
    { key: 'date', label: '发布时间', items: props.options.date }
  ]
  return groups
}

const primaryGroups = computed(() => chipGroups().filter((group) => ['type', 'topic', 'source', 'risk'].includes(group.key)))
const moreGroups = computed(() => chipGroups().filter((group) => ['concept', 'evidence', 'date'].includes(group.key)))

function isSelected(group: keyof FilterModel, value: string) {
  return model.value[group].includes(value)
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
              v-for="v in g.items" :key="v.key"
              type="button"
              class="wdz-filter__chip"
              :aria-pressed="isSelected(g.key, v.key)"
              :class="{ 'is-active': isSelected(g.key, v.key) }"
              @click="toggle(g.key, v.key)"
            >{{ v.label }}</button>
          </div>
        </div>
        <button class="wdz-btn wdz-btn--primary" type="button" style="margin-top: 8px;" @click="drawerOpen = false">完成</button>
      </div>
    </div>
  </template>

  <!-- 桌面：左侧栏 -->
  <div v-else class="wdz-filter">
    <div v-for="g in primaryGroups" :key="g.key" class="wdz-filter__group">
      <label>{{ g.label }}</label>
      <div class="wdz-filter__chips">
        <button
          v-for="v in g.items" :key="v.key"
          type="button"
          class="wdz-filter__chip"
          :aria-pressed="isSelected(g.key, v.key)"
          :class="{ 'is-active': isSelected(g.key, v.key) }"
          @click="toggle(g.key, v.key)"
        >{{ v.label }}</button>
      </div>
    </div>
    <details class="wdz-filter__more">
      <summary>更多条件</summary>
      <div v-for="g in moreGroups" :key="g.key" class="wdz-filter__group">
        <label>{{ g.label }}</label>
        <div class="wdz-filter__chips">
          <button v-for="v in g.items" :key="v.key" type="button" class="wdz-filter__chip"
            :aria-pressed="isSelected(g.key, v.key)" :class="{ 'is-active': isSelected(g.key, v.key) }"
            @click="toggle(g.key, v.key)">{{ v.label }}</button>
        </div>
      </div>
    </details>
    <button v-if="activeCount" class="wdz-filter__clear" type="button" @click="clearAll">清除全部筛选</button>
  </div>
</template>
