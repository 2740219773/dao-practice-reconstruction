<script setup lang="ts">
import { computed } from 'vue'
import { data as topicsData } from '../data/topics.data.ts'

const currentTopics = computed(() => topicsData.listedTopics.filter((topic) => topic.publicStatus === '研究中'))
const completedTopics = computed(() => topicsData.listedTopics.filter((topic) => topic.publicStatus === '已完成'))
const plannedTopics = computed(() => topicsData.listedTopics.filter((topic) => topic.publicStatus === '待开始'))
const moduleTopics = computed(() => {
  const groups = new Map<string, typeof topicsData.listedTopics>()
  for (const topic of topicsData.listedTopics) {
    const list = groups.get(topic.module) || []
    list.push(topic)
    groups.set(topic.module, list)
  }
  return [...groups.entries()].filter(([module]) => module).map(([module, topics]) => ({ module, topics }))
})

function statusLabel(status: string) {
  return status
}
</script>

<template>
  <div class="wdz-container wdz-topics-page">
    <header class="wdz-topics-hero">
      <p class="wdz-topics-hero__eyebrow">研究路线 / 专题总入口</p>
      <h1>专题研究</h1>
      <p>从一个词开始，追踪它在不同文献、时代和解释中的变化。</p>
      <p>不是给出一句定义，而是呈现来源、分歧、证据和边界。</p>
    </header>

    <section v-if="currentTopics.length" class="wdz-topics-section" aria-labelledby="topics-current">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">进行中</span>
        <h2 id="topics-current" class="wdz-section__title">当前研究</h2>
      </div>
      <div class="wdz-topics-grid">
        <article v-for="topic in currentTopics" :key="topic.id" class="wdz-topic-card wdz-topic-card--current">
          <div class="wdz-topic-card__mark" aria-hidden="true">{{ topic.name }}</div>
          <div class="wdz-topic-card__body">
            <p class="wdz-topic-card__status">{{ statusLabel(topic.publicStatus) }}</p>
            <h3>{{ topic.title }}</h3>
            <p>{{ topic.scopeSummary || topic.summary }}</p>
            <p class="wdz-topic-card__note">{{ topic.statusSummary }}</p>
            <span class="wdz-topic-card__action">研究进行中</span>
          </div>
        </article>
      </div>
    </section>

    <section v-if="completedTopics.length" class="wdz-topics-section" aria-labelledby="topics-completed">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">已完成</span>
        <h2 id="topics-completed" class="wdz-section__title">已完成专题</h2>
      </div>
      <div class="wdz-topics-grid">
        <article v-for="topic in completedTopics" :key="topic.id" class="wdz-topic-card">
          <div class="wdz-topic-card__mark" aria-hidden="true">{{ topic.name }}</div>
          <div class="wdz-topic-card__body">
            <p class="wdz-topic-card__status">{{ topic.statusSummary || statusLabel(topic.publicStatus) }}</p>
            <h3>{{ topic.title }}</h3>
            <p>{{ topic.summary }}</p>
            <p class="wdz-topic-card__note">原文 → 概念 → 争议 → 现代研究 → 风险边界</p>
            <a v-if="topic.detailVisible" class="wdz-topic-card__action" :href="topic.url">查看专题 →</a>
          </div>
        </article>
      </div>
    </section>

    <section v-if="plannedTopics.length" class="wdz-topics-section" aria-labelledby="topics-planned">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">路线</span>
        <h2 id="topics-planned" class="wdz-section__title">后续专题路线</h2>
      </div>
      <div class="wdz-topics-roadmap" role="list">
        <div v-for="topic in plannedTopics" :key="topic.id" class="wdz-topic-roadmap-item" role="listitem">
          <span class="wdz-topic-roadmap-item__name">{{ topic.name }}</span>
          <span>{{ topic.publicStatus }}</span>
        </div>
      </div>
    </section>

    <section class="wdz-topics-section" aria-labelledby="topics-modules">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">模块</span>
        <h2 id="topics-modules" class="wdz-section__title">不同研究类型</h2>
      </div>
      <div class="wdz-topics-modules">
        <div v-for="group in moduleTopics" :key="group.module" class="wdz-topics-module">
          <h3>{{ group.module }}</h3>
          <p v-if="group.module.includes('概念')">追踪概念的原文、解释、争议、现代研究与边界。</p>
          <p v-else-if="group.module.includes('导引')">动作、版本、传统功效主张与风险资料，尚未启动。</p>
          <p v-else>原始观察、替代解释与现代医学对照，尚未启动。</p>
          <span class="wdz-topic-card__action">{{ group.topics.some((topic) => topic.publicStatus === '已完成') ? '已有公开专题' : '尚未启动' }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
