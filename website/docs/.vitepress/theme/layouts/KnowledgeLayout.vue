<script setup lang="ts">
/**
 * KnowledgeLayout.vue —— 统一知识索引（方案 8.4）
 * 左侧筛选（专题/资料性质/典籍/证据状态/风险等级），右侧按类型分组结果。
 */
import { computed, ref } from 'vue'
import { useData } from 'vitepress'
import { data as knowledgeData } from '../data/knowledge.data.ts'
import { data as questionsData } from '../data/questions.data.ts'
import { TYPE_LABELS } from '../data/_lib/常量.ts'
import KnowledgeCard from '../components/KnowledgeCard.vue'
import FilterDrawer from '../components/FilterDrawer.vue'

const { frontmatter } = useData()

type Filters = { type: string[]; evidence: string[]; risk: string[] }
const filters = ref<Filters>({ type: [], evidence: [], risk: [] })

/** 筛选选项（由数据推导） */
const filterOptions = computed(() => ({
  type: Object.keys(knowledgeData.byType).map((t) => ({
    key: t, label: TYPE_LABELS[t] || t, count: knowledgeData.byType[t].length
  })),
  evidence: [...new Set(knowledgeData.items.map((i) => i.evidenceLevel).filter(Boolean))] as string[],
  risk: [...new Set(knowledgeData.items.map((i) => i.riskLevel).filter(Boolean))] as string[]
}))

const filtered = computed(() =>
  knowledgeData.items.filter((it) => {
    if (filters.value.type.length && !filters.value.type.includes(it.type)) return false
    if (filters.value.evidence.length && !(it.evidenceLevel && filters.value.evidence.includes(it.evidenceLevel))) return false
    if (filters.value.risk.length && !(it.riskLevel && filters.value.risk.includes(it.riskLevel))) return false
    return true
  })
)

/** 按类型分组（保持类型顺序：文献/原文/概念/主张/争议/现代研究/风险） */
const groups = computed(() => {
  const order = ['library', 'originals', 'concepts', 'claims', 'hypotheses', 'disputes', 'research', 'risks', 'contemporary', 'daoyin', 'medical-observations']
  return order
    .filter((t) => filtered.value.some((i) => i.type === t))
    .map((t) => ({ type: t, label: TYPE_LABELS[t] || t, items: filtered.value.filter((i) => i.type === t) }))
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
        <div class="wdz-knowledge-result-head">
          <span class="wdz-knowledge-count">知识索引 <b>{{ filtered.length }}</b> 项</span>
          <button v-if="filters.type.length || filters.evidence.length || filters.risk.length"
                  class="wdz-filter__clear" type="button" @click="filters = { type: [], evidence: [], risk: [] }">
            清除筛选
          </button>
        </div>

        <div v-for="g in groups" :key="g.type">
          <h3 class="wdz-knowledge-group__title">{{ g.label }}（{{ g.items.length }}）</h3>
          <div v-for="it in g.items" :key="it.id">
            <KnowledgeCard :item="it" :glyph="glyph(it.type)" :glyph-class="glyphClass(it.type)" />
          </div>
        </div>
        <p v-if="filtered.length === 0" class="wdz-search__empty">没有符合当前筛选条件的条目。</p>
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
