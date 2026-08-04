<script setup lang="ts">
/**
 * KnowledgeLayout.vue —— 统一知识索引（方案 8.4）
 * 左侧筛选（专题/资料性质/典籍/证据状态/风险等级），右侧按类型分组结果。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import { data as knowledgeData } from '../data/knowledge.data.ts'
import { data as questionsData } from '../data/questions.data.ts'
import { TYPE_LABELS } from '../data/_lib/常量.ts'
import KnowledgeCard from '../components/KnowledgeCard.vue'
import FilterDrawer, { type FilterChoice } from '../components/FilterDrawer.vue'

const { frontmatter } = useData()

type Filters = { type: string[]; topic: string[]; concept: string[]; source: string[]; evidence: string[]; risk: string[]; date: string[] }
const emptyFilters = (): Filters => ({ type: [], topic: [], concept: [], source: [], evidence: [], risk: [], date: [] })
const filters = ref<Filters>(emptyFilters())
const keyword = ref('')
const sort = ref<'recent' | 'type'>('recent')

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function readFiltersFromUrl() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const next = emptyFilters()
  for (const key of Object.keys(next) as (keyof Filters)[]) {
    next[key] = (params.get(key) || '').split(',').map((v) => v.trim()).filter(Boolean)
  }
  keyword.value = params.get('q') || ''
  sort.value = params.get('sort') === 'type' ? 'type' : 'recent'
  filters.value = next
}

function writeFiltersToUrl(next: Filters) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  for (const key of Object.keys(next) as (keyof Filters)[]) {
    if (next[key].length) url.searchParams.set(key, next[key].join(','))
    else url.searchParams.delete(key)
  }
  if (keyword.value.trim()) url.searchParams.set('q', keyword.value.trim())
  else url.searchParams.delete('q')
  if (sort.value === 'type') url.searchParams.set('sort', sort.value)
  else url.searchParams.delete('sort')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

onMounted(readFiltersFromUrl)
watch([filters, keyword, sort], () => writeFiltersToUrl(filters.value), { deep: true })

const itemById = computed(() => new Map(knowledgeData.items.map((item) => [item.id, item])))
function labelForReference(value: string) {
  return itemById.value.get(value)?.title || value
}
function choices(values: string[]): FilterChoice[] {
  return unique(values).map((key) => ({ key, label: labelForReference(key) }))
}

const sourceLabels = computed(() => {
  const labels = new Map<string, string[]>()
  for (const item of knowledgeData.items) {
    for (const source of item.sources) {
      const label = labelForReference(source)
      labels.set(label, [...new Set([...(labels.get(label) || []), source])])
    }
  }
  return labels
})

/** 筛选选项（由数据推导） */
const filterOptions = computed(() => ({
  type: Object.keys(knowledgeData.byType).map((t) => ({
    key: t, label: TYPE_LABELS[t] || t, count: knowledgeData.byType[t].length
  })),
  topic: choices(knowledgeData.items.flatMap((i) => i.topics)),
  concept: choices(knowledgeData.items.flatMap((i) => i.concepts)),
  source: [...sourceLabels.value.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN')).map((label) => ({ key: label, label })),
  evidence: choices(knowledgeData.items.map((i) => i.evidenceLevel || '')),
  risk: choices(knowledgeData.items.map((i) => i.riskLevel || '')),
  date: choices(knowledgeData.items.map((i) => i.sortDate.slice(0, 4)))
}))

const filtered = computed(() =>
  knowledgeData.items.filter((it) => {
    if (filters.value.type.length && !filters.value.type.includes(it.type)) return false
    if (filters.value.topic.length && !filters.value.topic.some((v) => it.topics.includes(v))) return false
    if (filters.value.concept.length && !filters.value.concept.some((v) => it.concepts.includes(v))) return false
    if (filters.value.source.length && !filters.value.source.some((v) => it.sources.some((source) => labelForReference(source) === v))) return false
    if (filters.value.evidence.length && !(it.evidenceLevel && filters.value.evidence.includes(it.evidenceLevel))) return false
    if (filters.value.risk.length && !(it.riskLevel && filters.value.risk.includes(it.riskLevel))) return false
    if (filters.value.date.length && !filters.value.date.includes(it.sortDate.slice(0, 4))) return false
    const query = keyword.value.trim().toLocaleLowerCase('zh-CN')
    if (!query) return true
    return [it.title, it.summary, it.bodyPreview, ...it.topics, ...it.concepts.map(labelForReference), ...it.sources.map(labelForReference)]
      .join(' ').toLocaleLowerCase('zh-CN').includes(query)
  })
)

const sorted = computed(() => [...filtered.value].sort((a, b) => {
  if (sort.value === 'type') return (TYPE_LABELS[a.type] || a.type).localeCompare(TYPE_LABELS[b.type] || b.type, 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN')
  return b.sortDate.localeCompare(a.sortDate) || a.title.localeCompare(b.title, 'zh-CN')
}))

/** 按类型分组（保持类型顺序：文献/原文/概念/主张/争议/现代研究/风险） */
const groups = computed(() => {
  const order = ['library', 'originals', 'concepts', 'claims', 'hypotheses', 'disputes', 'research', 'risks', 'contemporary', 'daoyin', 'medical-observations']
  return order
    .filter((t) => sorted.value.some((i) => i.type === t))
    .map((t) => ({ type: t, label: TYPE_LABELS[t] || t, items: sorted.value.filter((i) => i.type === t) }))
})

const glyph = (type: string) => {
  const m: Record<string, string> = { library: '经', originals: '原', concepts: '辨', claims: '主', disputes: '争', research: '研', risks: '险', contemporary: '传', hypotheses: '说' }
  return m[type] || '知'
}
const glyphClass = (type: string) => {
  const m: Record<string, string> = { library: 'wdz-knowledge-card__glyph--moss', originals: 'wdz-knowledge-card__glyph--moss', concepts: 'wdz-knowledge-card__glyph--vermilion', claims: 'wdz-knowledge-card__glyph--slate', disputes: 'wdz-knowledge-card__glyph--vermilion', research: 'wdz-knowledge-card__glyph--slate', risks: 'wdz-knowledge-card__glyph--ochre' }
  return m[type] || ''
}

const bottomQuestions = computed(() => questionsData.questions.slice(0, 6))
const hasActiveFilters = computed(() => Object.values(filters.value).some((values) => values.length) || Boolean(keyword.value.trim()))
function clearAll() { filters.value = emptyFilters(); keyword.value = ''; sort.value = 'recent' }
</script>

<template>
  <div class="wdz-container" style="padding-top: 48px; padding-bottom: 64px;">
    <!-- 页头 -->
    <div class="wdz-topic-hero">
      <div class="wdz-topic-glyph">典</div>
      <h1 class="wdz-topic-title">典籍与概念</h1>
      <p class="wdz-topic-sub">
        统一检索全部已公开知识：典籍原文、概念辨析、主张、争议、现代研究与风险资料。
        内部资料类型已转化为筛选条件，正文与证据结构保留。
      </p>
      <div class="wdz-topic-badges">
        <span class="wdz-badge wdz-badge--ink"><span class="wdz-badge__dot" />共 {{ knowledgeData.items.length }} 项正式知识</span>
        <span class="wdz-badge wdz-badge--plain">{{ knowledgeData.stats.knowledgePub }} 已公开 · {{ knowledgeData.stats.pending }} 整理中</span>
      </div>
    </div>

    <div class="wdz-knowledge-layout" style="margin-top: 32px;">
      <!-- 左筛选（桌面） -->
      <aside class="wdz-knowledge-aside">
        <FilterDrawer v-model="filters" :options="filterOptions" />
      </aside>

      <!-- 移动端筛选抽屉 -->
      <div class="wdz-filter-drawer">
        <FilterDrawer v-model="filters" :options="filterOptions" mobile-only />
      </div>

      <!-- 右侧结果 -->
      <div>
        <div class="wdz-knowledge-context" aria-label="索引建议">
          <div><span>当前专题</span><b>「静」：原文、解释、争议与边界</b></div>
          <div><span>建议入口</span><a href="/question-map/">从一个问题开始</a></div>
        </div>
        <div class="wdz-knowledge-result-head">
          <span class="wdz-knowledge-count">知识索引 <b>{{ filtered.length }}</b> 项</span>
          <button v-if="hasActiveFilters" class="wdz-filter__clear" type="button" @click="clearAll">
            清除筛选
          </button>
        </div>
        <div class="wdz-knowledge-tools">
          <label class="wdz-knowledge-search"><span class="sr-only">在知识索引中搜索</span><input v-model="keyword" type="search" placeholder="在当前知识索引中搜索" /></label>
          <label class="wdz-knowledge-sort">排序<select v-model="sort"><option value="recent">最近更新</option><option value="type">资料性质</option></select></label>
        </div>

        <div v-for="g in groups" :key="g.type">
          <h3 class="wdz-knowledge-group__title">{{ g.label }}（{{ g.items.length }}）</h3>
          <div v-for="it in g.items" :key="it.id">
            <KnowledgeCard :item="it" :glyph="glyph(it.type)" :glyph-class="glyphClass(it.type)" />
          </div>
        </div>
        <div v-if="filtered.length === 0" class="wdz-search__empty" role="status"><p>没有符合当前条件的条目。</p><button class="wdz-filter__clear" type="button" @click="clearAll">清除筛选并查看全部</button></div>
      </div>
    </div>

    <!-- 底部：也可以从问题开始 -->
    <div style="margin-top: 56px; border-top: 1px solid var(--wdz-line); padding-top: 32px;">
      <h2 class="wdz-section__title" style="font-size: 1.25rem;">也可以从问题开始</h2>
      <div class="wdz-qgroup__list" style="margin-top: 16px;">
        <a v-for="q in bottomQuestions" :key="q.id" :href="q.url" class="wdz-question-card">
          <div class="wdz-question-card__title">{{ q.title }}</div>
          <div class="wdz-question-card__desc">{{ q.briefAnswer }}</div>
        </a>
      </div>
    </div>
  </div>
</template>
