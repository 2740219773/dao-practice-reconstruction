<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute } from 'vitepress'
import { data as topicsData } from '../data/topics.data.ts'
import { data as knowledgeData } from '../data/knowledge.data.ts'
import SafetyNotice from '../components/SafetyNotice.vue'
import RelatedReading from '../components/RelatedReading.vue'

const { frontmatter } = useData()
const route = useRoute()
const routeSlug = computed(() => route.path.replace(/^\/topics\//, '').replace(/\/$/, ''))
const topic = computed(() => topicsData.bySlug[routeSlug.value] || null)

const byId = computed(() => Object.fromEntries(knowledgeData.items.map((item) => [item.id, item])))
const itemsOf = (ids: string[]) => ids.map((id) => byId.value[id]).filter(Boolean)
const originals = computed(() => itemsOf(topic.value?.coreIds.原文 || []))
const concepts = computed(() => itemsOf(topic.value?.coreIds.概念 || []))
const disputes = computed(() => itemsOf(topic.value?.coreIds.争议 || []))
const researches = computed(() => itemsOf(topic.value?.coreIds.研究 || []))
const risks = computed(() => itemsOf(topic.value?.coreIds.风险 || []))

const toc = [
  { id: 'questions', label: '核心问题' },
  { id: 'what', label: '原文怎么说' },
  { id: 'interpret', label: '历代解释' },
  { id: 'project', label: '项目归纳' },
  { id: 'research', label: '现代研究' },
  { id: 'dispute', label: '主要争议' },
  { id: 'risk', label: '风险与使用边界' },
  { id: 'pending', label: '暂时不能确认' },
  { id: 'evidence', label: '证据清单' },
  { id: 'history', label: '版本和修订记录' }
]

const related = computed(() => ({
  originals: originals.value.map((item) => ({ title: item.title, url: item.url })),
  disputes: disputes.value.map((item) => ({ title: item.title, url: item.url })),
  concepts: concepts.value.map((item) => ({ title: item.title, url: item.url }))
}))

function plainText(value: string): string {
  return value
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\b(?:TOPIC|DAOYIN|MEDOBS)-\d+(?:-C\d+(?:[～~-]C?\d+)?)?/g, '项目结论编号')
    .replace(/\s+/g, ' ')
    .trim()
}

function statusLabel(status: string): string {
  return status || '状态待补充'
}

function emptyText(label: string, count: number): string {
  return count ? '' : `当前尚未进入${label}对照阶段。`
}
</script>

<template>
  <div v-if="topic" class="wdz-container wdz-topic-page">
    <div class="wdz-topic-hero">
      <div class="wdz-topic-hero__ink" aria-hidden="true" />
      <p class="wdz-topic-hero__eyebrow">专题研究 / {{ topic.module }} / {{ topic.name }}</p>
      <div class="wdz-topic-hero__lead">
        <div class="wdz-topic-glyph" aria-hidden="true">{{ topic.name }}</div>
        <div class="wdz-topic-hero__copy">
          <h1 class="wdz-topic-title">{{ topic.title }}</h1>
          <p class="wdz-topic-sub">{{ topic.summary }}</p>
          <div class="wdz-topic-badges">
            <span class="wdz-badge wdz-badge--vermilion"><span class="wdz-badge__dot" />{{ statusLabel(topic.publicStatus) }}</span>
            <span class="wdz-badge wdz-badge--moss"><span class="wdz-badge__dot" />{{ topic.kind === 'concept' ? '概念研究' : topic.module }}</span>
            <span class="wdz-badge wdz-badge--plain">{{ topic.statusSummary || topic.stage }}</span>
          </div>
        </div>
      </div>
      <div class="wdz-topic-summary">
        <div class="wdz-topic-summary__item"><div class="wdz-topic-summary__label">一句话理解</div><div class="wdz-topic-summary__value">{{ topic.summary }}</div></div>
        <div class="wdz-topic-summary__item"><div class="wdz-topic-summary__label">研究范围</div><div class="wdz-topic-summary__value">{{ topic.scopeSummary || '研究范围正在整理。' }}</div></div>
        <div class="wdz-topic-summary__item"><div class="wdz-topic-summary__label">当前状态</div><div class="wdz-topic-summary__value">{{ topic.statusSummary || statusLabel(topic.publicStatus) }}</div></div>
        <div class="wdz-topic-summary__item"><div class="wdz-topic-summary__label">主要边界</div><div class="wdz-topic-summary__value">{{ topic.boundarySummary || '边界信息正在整理。' }}</div></div>
      </div>
    </div>

    <div class="wdz-topic-layout">
      <aside class="wdz-topic-toc" aria-label="本页目录">
        <details open>
          <summary>本页目录</summary>
          <nav><a v-for="item in toc" :key="item.id" :href="`#${item.id}`">{{ item.label }}</a></nav>
        </details>
      </aside>

      <div class="wdz-topic-main wdz-prose">
        <section id="questions" class="wdz-topic-sec wdz-topic-sec--questions">
          <h2 class="wdz-topic-sec__head">核心问题</h2>
          <div class="wdz-topic-sec__body">
            <ul v-if="topic.coreQuestions.length">
              <li v-for="question in topic.coreQuestions" :key="question.id">{{ question.question }}</li>
            </ul>
            <p v-else>核心问题正在整理。</p>
          </div>
        </section>

        <section id="what" class="wdz-topic-sec wdz-topic-sec--original">
          <h2 class="wdz-topic-sec__head">原文怎么说</h2>
          <div class="wdz-topic-sec__body">
            <p>{{ plainText(topic.narrative.what) || '原文材料正在整理。' }}</p>
            <div v-for="item in originals" :key="item.id" class="wdz-topic-linked"><a :href="item.url">{{ item.title }}</a><span class="wdz-mono">{{ item.id }}</span><p>{{ item.summary }}</p></div>
          </div>
        </section>

        <section id="interpret" class="wdz-topic-sec wdz-topic-sec--interpret">
          <h2 class="wdz-topic-sec__head">历代解释</h2>
          <div class="wdz-topic-sec__body"><p>{{ plainText(topic.narrative.notWhat) || '历代解释正在整理。' }}</p><div v-for="item in concepts" :key="item.id" class="wdz-topic-linked"><a :href="item.url">{{ item.title }}</a><p>{{ item.summary }}</p></div></div>
        </section>

        <section id="project" class="wdz-topic-sec wdz-topic-sec--project">
          <h2 class="wdz-topic-sec__head">项目归纳</h2>
          <div class="wdz-topic-sec__body"><p>{{ plainText(topic.narrative.confirm) || '项目归纳正在整理。' }}</p><p v-if="topic.conclusionRange" class="wdz-topic-note">结论范围已登记。</p></div>
        </section>

        <section id="research" class="wdz-topic-sec wdz-topic-sec--research">
          <h2 class="wdz-topic-sec__head">现代研究</h2>
          <div class="wdz-topic-sec__body"><p>现代研究作为对照而非证明，不能替代传统文献本身。</p><p v-if="!researches.length" class="wdz-topic-note">{{ emptyText('现代研究', researches.length) }}</p><div v-for="item in researches" :key="item.id" class="wdz-topic-linked"><a :href="item.url">{{ item.title }}</a><span class="wdz-mono">{{ item.id }}</span><p>{{ item.summary }}</p></div></div>
        </section>

        <section id="dispute" class="wdz-topic-sec wdz-topic-sec--dispute">
          <h2 class="wdz-topic-sec__head">主要争议</h2>
          <div class="wdz-topic-sec__body"><p>{{ plainText(topic.narrative.disputes) || '争议材料正在整理。' }}</p><div v-for="item in disputes" :key="item.id" class="wdz-topic-linked"><a :href="item.url">{{ item.title }}</a><p>{{ item.summary }}</p></div></div>
        </section>

        <section id="risk" class="wdz-topic-sec wdz-topic-sec--risk">
          <h2 class="wdz-topic-sec__head">风险与使用边界</h2>
          <div class="wdz-topic-sec__body"><SafetyNotice v-if="topic.safetyHighlight" level="danger">{{ topic.safetyHighlight }}</SafetyNotice><p>{{ plainText(topic.narrative.safety) || topic.boundarySummary || '风险与使用边界正在整理。' }}</p><p v-if="!risks.length" class="wdz-topic-note">{{ emptyText('风险资料', risks.length) }}</p><div v-for="item in risks" :key="item.id" class="wdz-topic-linked"><a :href="item.url">{{ item.title }}</a><span class="wdz-mono">{{ item.id }}</span><p>{{ item.summary }}</p></div></div>
        </section>

        <section id="pending" class="wdz-topic-sec wdz-topic-sec--pending"><h2 class="wdz-topic-sec__head">暂时不能确认</h2><div class="wdz-topic-sec__body"><p>{{ plainText(topic.narrative.unknown) || '暂时没有可以公开确认的内容。' }}</p></div></section>

        <section id="evidence" class="wdz-topic-sec wdz-topic-sec--evidence"><h2 class="wdz-topic-sec__head">证据清单</h2><div class="wdz-topic-sec__body"><p>核心原文 {{ originals.length }} 条 · 现代研究 {{ researches.length }} 项 · 风险资料 {{ risks.length }} 项。</p><p v-if="topic.verificationSummary" class="wdz-topic-note">{{ topic.verificationSummary }}</p></div></section>
        <section id="history" class="wdz-topic-sec wdz-topic-sec--history"><h2 class="wdz-topic-sec__head">版本和修订记录</h2><div class="wdz-topic-sec__body"><p>{{ topic.verificationSummary || '版本核对记录正在整理。' }}</p></div></section>
        <RelatedReading v-bind="related" />
      </div>

      <aside class="wdz-topic-aside">
        <div class="wdz-aside-card"><h4>证据与版本</h4><ul class="wdz-aside-facts"><li>核心原文：{{ originals.length }} 条</li><li>现代研究：{{ researches.length }} 条</li><li>风险资料：{{ risks.length }} 条</li><li>{{ topic.verificationSummary || '版本核对记录正在整理。' }}</li></ul></div>
        <div v-if="topic.safetyHighlight" class="wdz-aside-card"><h4>安全提示</h4><SafetyNotice level="info">{{ topic.safetyHighlight }}</SafetyNotice></div>
      </aside>
    </div>
  </div>

  <div v-else class="wdz-container wdz-container--narrow wdz-prose" style="padding-top: 48px; padding-bottom: 64px;"><h1 v-if="frontmatter.title">{{ frontmatter.title }}</h1><p>该专题尚未公开，或页面尚未建立。</p></div>
</template>
