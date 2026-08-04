<script setup lang="ts">
/**
 * SearchModal.vue —— 全站搜索浮层（方案 14.2）
 * 构建期 search-index.data.ts 生成索引 → MiniSearch 客户端检索。
 * 键盘：/ 打开、Esc 关闭、↑↓ 选择、Enter 跳转。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vitepress'
import MiniSearch from 'minisearch'
import { data as searchIndex } from '../data/search-index.data.ts'

const open = defineModel<boolean>('open', { default: false })

const router = useRouter()
const query = ref('')
const results = ref<typeof searchIndex>([])
const activeIdx = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

let ms: MiniSearch | null = null

function init() {
  ms = new MiniSearch({
    fields: ['title', 'keywords'],
    storeFields: ['title', 'type', 'url', 'snippet', 'keywords'],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3 } }
  })
  ms.addAll(searchIndex)
}

watch(open, async (v) => {
  if (v) {
    query.value = ''
    results.value = []
    await nextTick()
    inputEl.value?.focus()
  }
})

watch(query, (q) => {
  if (!ms) return
  const t = q.trim()
  if (!t) { results.value = []; return }
  results.value = ms.search(t).slice(0, 12) as unknown as typeof searchIndex
  activeIdx.value = 0
})

function go(idx: number) {
  const r = results.value[idx]
  if (!r) return
  open.value = false
  router.go(r.url)
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx.value = Math.min(activeIdx.value + 1, results.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx.value = Math.max(activeIdx.value - 1, 0) }
  else if (e.key === 'Enter') { e.preventDefault(); go(activeIdx.value) }
  else if (e.key === 'Escape') { open.value = false }
}

/** 全局快捷键：/ 打开搜索 */
function globalKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(tag)) {
    e.preventDefault()
    open.value = true
  }
}

onMounted(() => {
  init()
  window.addEventListener('keydown', globalKey)
})
onUnmounted(() => window.removeEventListener('keydown', globalKey))
</script>

<template>
  <div v-if="open" class="wdz-search" @keydown="onKeydown">
    <div class="wdz-search__box" role="dialog" aria-label="搜索">
      <div class="wdz-search__input-row">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color: var(--wdz-ink-3); flex-shrink: 0;"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input
          ref="inputEl"
          v-model="query"
          class="wdz-search__input"
          type="search"
          placeholder="搜索问题、专题、概念、文献…"
          aria-label="搜索输入"
        />
        <button class="wdz-search__close" type="button" aria-label="关闭搜索" @click="open = false">✕</button>
      </div>
      <div class="wdz-search__results">
        <a
          v-for="(r, i) in results"
          :key="r.id"
          class="wdz-search__result"
          :style="i === activeIdx ? 'background: var(--wdz-paper); border-left-color: var(--wdz-vermilion);' : ''"
          :href="r.url"
          @mouseenter="activeIdx = i"
          @click.prevent="go(i)"
        >
          <span class="wdz-badge wdz-badge--plain" style="flex-shrink: 0; align-self: flex-start;">{{ r.type }}</span>
          <span>
            <span class="wdz-search__result-title">{{ r.title }}</span>
            <span class="wdz-search__result-snippet">{{ r.snippet }}</span>
          </span>
        </a>
        <div v-if="query.trim() && !results.length" class="wdz-search__empty">未找到相关结果。试试更短的词，或从「问题地图」开始。</div>
        <div v-if="!query.trim()" class="wdz-search__empty">输入关键词开始检索。</div>
      </div>
      <div class="wdz-search__hint">↑↓ 选择 · Enter 打开 · Esc 关闭 · 共 {{ searchIndex.length }} 条索引</div>
    </div>
  </div>
</template>
