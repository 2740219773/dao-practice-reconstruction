<script setup lang="ts">
/**
 * TopicLayout.vue —— 专题页（方案 8.1）
 * 六段正文：原文怎么说 / 历代解释 / 项目归纳 / 现代研究 / 争议反证 / 风险边界。
 * 数据从 topics.data（manifest.yml + 结论摘要）与 knowledge.data 聚合。
 */
import { computed } from 'vue'
import { useData, useRoute, Content } from 'vitepress'
import { data as topicsData } from '../data/topics.data.ts'
import { data as knowledgeData } from '../data/knowledge.data.ts'
import SafetyNotice from '../components/SafetyNotice.vue'
import RelatedReading from '../components/RelatedReading.vue'

const { frontmatter } = useData()
const route = useRoute()

const topic = computed(() =>
  topicsData.all.find((t) => t.url === route.path) || null
)

const byId = computed(() => {
  const m: Record<string, any> = {}
  for (const it of knowledgeData.items) m[it.id] = it
  return m
})

/** 取核心编号对应条目 */
const itemsOf = (ids: string[]) => ids.map((id) => byId.value[id]).filter(Boolean)

const originals = computed(() => itemsOf(topic.value?.coreIds.原文 || []))
const concepts = computed(() => itemsOf(topic.value?.coreIds.概念 || []))
const disputes = computed(() => itemsOf(topic.value?.coreIds.争议 || []))
const researches = computed(() => itemsOf(topic.value?.coreIds.研究 || []))
const risks = computed(() => itemsOf(topic.value?.coreIds.风险 || []))

/** 侧栏：页内目录（六段） */
const toc = [
  { id: 'what', label: '原文怎么说' },
  { id: 'interpret', label: '历代解释' },
  { id: 'project', label: '项目归纳' },
  { id: 'research', label: '现代研究' },
  { id: 'dispute', label: '争议与反证' },
  { id: 'risk', label: '风险边界' },
  { id: 'pending', label: '暂时不能确认' }
]

const related = computed(() => ({
  originals: originals.value.map((it) => ({ title: it.title, url: it.url })),
  disputes: disputes.value.map((it) => ({ title: it.title, url: it.url })),
  concepts: concepts.value.map((it) => ({ title: it.title, url: it.url }))
}))

const stageText = computed(() => topic.value?.stage || '')
const shortSummary = computed(() => topic.value?.name === '静'
  ? '“静”不是简单地消灭念头，而是减少扰动、保持安定，并回到秩序的一组相关表达。'
  : topic.value?.summary || '')

function plainText(value: string): string {
  return value
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
</script>

<template>
  <div v-if="topic" class="wdz-container wdz-topic-page">
    <!-- 专题首部 -->
    <div class="wdz-topic-hero">
      <div class="wdz-topic-hero__ink" aria-hidden="true" />
      <p class="wdz-topic-hero__eyebrow">专题研究 / 概念与思想 / {{ topic.name }}</p>
      <div class="wdz-topic-hero__lead">
        <div class="wdz-topic-glyph" aria-hidden="true">{{ topic.name }}</div>
        <div class="wdz-topic-hero__copy">
          <h1 class="wdz-topic-title">“{{ topic.name }}”到底意味着什么？</h1>
          <p class="wdz-topic-sub">{{ shortSummary }}</p>
          <div class="wdz-topic-badges">
            <span class="wdz-badge wdz-badge--vermilion"><span class="wdz-badge__dot" />可公开草稿</span>
            <span class="wdz-badge wdz-badge--moss"><span class="wdz-badge__dot" />概念研究</span>
            <span class="wdz-badge wdz-badge--plain">{{ stageText }}</span>
          </div>
        </div>
      </div>
      <div class="wdz-topic-summary">
        <div class="wdz-topic-summary__item"><div class="wdz-topic-summary__label">一句话理解</div><div class="wdz-topic-summary__value">{{ shortSummary }}</div></div>
        <div class="wdz-topic-summary__item"><div class="wdz-topic-summary__label">研究范围</div><div class="wdz-topic-summary__value">六张核心原文 · 概念 / 主张 / 争议 / 现代研究 · 纯知识研究</div></div>
        <div class="wdz-topic-summary__item"><div class="wdz-topic-summary__label">当前状态</div><div class="wdz-topic-summary__value">已完成并冻结（{{ stageText }}）</div></div>
        <div class="wdz-topic-summary__item"><div class="wdz-topic-summary__label">主要边界</div><div class="wdz-topic-summary__value">不提供操作教程，不教"练静"</div></div>
      </div>
    </div>

    <div class="wdz-topic-layout">
      <aside class="wdz-topic-toc" aria-label="本页目录">
        <details open>
          <summary>本页目录</summary>
          <nav>
            <a v-for="t in toc" :key="t.id" :href="`#${t.id}`">{{ t.label }}</a>
          </nav>
        </details>
      </aside>

      <!-- 正文六段 -->
      <div class="wdz-topic-main wdz-prose">
        <!-- ① 原文怎么说 -->
        <section id="what" class="wdz-topic-sec wdz-topic-sec--original">
          <h2 class="wdz-topic-sec__head">原文怎么说</h2>
          <div class="wdz-topic-sec__body">
            <p>{{ plainText(topic.narrative.what) }}</p>
            <div v-for="it in originals" :key="it.id" class="wdz-topic-linked">
              <a :href="it.url">{{ it.title }}</a>
              <span class="wdz-mono">{{ it.id }}</span>
              <p>{{ it.summary }}</p>
            </div>
          </div>
        </section>

        <!-- ② 历代解释 -->
        <section id="interpret" class="wdz-topic-sec wdz-topic-sec--interpret">
          <h2 class="wdz-topic-sec__head">历代解释</h2>
          <div class="wdz-topic-sec__body">
            <p>从先秦《道德经》《庄子》到唐代《坐忘论》，"静"的含义随传统展开：
              先秦以状态与原则出现，操作体系化是后世（尤其《坐忘论》）的展开。
              本专题区分「原文直接支持」与「后世解释」，不将后世体系读回先秦原文。</p>
            <div v-for="c in concepts" :key="c.id" class="wdz-topic-linked">
              <a :href="c.url">{{ c.title }}</a>
              <p>{{ c.summary }}</p>
            </div>
          </div>
        </section>

        <!-- ③ 项目归纳 -->
        <section id="project" class="wdz-topic-sec wdz-topic-sec--project">
          <h2 class="wdz-topic-sec__head">项目归纳</h2>
          <div class="wdz-topic-sec__body">
            <p>{{ plainText(topic.narrative.confirm) }}</p>
            <p class="wdz-topic-note">
              归纳与原文支持的区分见结论编号 TOPIC-001-C01~C06；项目分析框架（八义拆分）非证据结论。
            </p>
          </div>
        </section>

        <!-- ④ 现代研究 -->
        <section id="research" class="wdz-topic-sec wdz-topic-sec--research">
          <h2 class="wdz-topic-sec__head">现代研究</h2>
          <div class="wdz-topic-sec__body">
            <p>现代研究作为对照而非证明：不能直接证明传统"静"的机制，也不等于禅定、放松训练或脑波概念（C04）。</p>
            <div v-for="it in researches" :key="it.id" class="wdz-topic-linked">
              <a :href="it.url">{{ it.title }}</a>
              <span class="wdz-mono">{{ it.id }}</span>
              <p>{{ it.summary }}</p>
            </div>
          </div>
        </section>

        <!-- ⑤ 争议反证 -->
        <section id="dispute" class="wdz-topic-sec wdz-topic-sec--dispute">
          <h2 class="wdz-topic-sec__head">争议与反证</h2>
          <div class="wdz-topic-sec__body">
            <p>{{ plainText(topic.narrative.disputes) }}</p>
            <div v-for="d in disputes" :key="d.id" class="wdz-topic-linked">
              <a :href="d.url">{{ d.title }}</a>
              <p>{{ d.summary }}</p>
            </div>
          </div>
        </section>

        <!-- ⑥ 风险边界 -->
        <section id="risk" class="wdz-topic-sec wdz-topic-sec--risk">
          <h2 class="wdz-topic-sec__head">风险边界</h2>
          <div class="wdz-topic-sec__body">
            <SafetyNotice level="danger">
              「静」≠ 什么都不想。强行压念可能增加紧张、挫败与反弹风险（C05）；本专题是纯知识研究，不提供任何操作教程。
            </SafetyNotice>
            <p>{{ plainText(topic.narrative.safety) }}</p>
            <div v-for="r in risks" :key="r.id" class="wdz-topic-linked">
              <a :href="r.url">{{ r.title }}</a>
              <span class="wdz-mono">{{ r.id }}</span>
              <p>{{ r.summary }}</p>
            </div>
          </div>
        </section>

        <!-- ⑦ 暂时不能确认 -->
        <section id="pending" class="wdz-topic-sec wdz-topic-sec--pending">
          <h2 class="wdz-topic-sec__head">暂时不能确认</h2>
          <div class="wdz-topic-sec__body">
            <p>{{ plainText(topic.narrative.unknown) }}</p>
          </div>
        </section>

        <!-- 底部：关联阅读 -->
        <RelatedReading v-bind="related" />
      </div>

      <!-- 侧栏 -->
      <aside class="wdz-topic-aside">
        <div class="wdz-aside-card">
          <h4>证据与版本</h4>
          <ul class="wdz-aside-facts">
            <li>核心原文：{{ originals.length }} 条</li>
            <li>现代研究：{{ researches.length }} 条</li>
            <li>风险资料：{{ risks.length }} 条</li>
            <li>网络文本已逐字核对；指定底本实物复核待补</li>
          </ul>
        </div>
        <div class="wdz-aside-card">
          <h4>安全提示</h4>
          <SafetyNotice level="info">
            本专题内容为文献研究，不构成练习指导或医疗建议。任何异常体验请先停止并寻求专业意见。
          </SafetyNotice>
        </div>
      </aside>
    </div>
  </div>

  <!-- 非专题路由：普通文档 -->
  <div v-else class="wdz-container wdz-container--narrow wdz-prose" style="padding-top: 48px; padding-bottom: 64px;">
    <h1 v-if="frontmatter.title">{{ frontmatter.title }}</h1>
    <Content />
  </div>
</template>
