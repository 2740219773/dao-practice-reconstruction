<script setup lang="ts">
/**
 * ArticleLayout.vue —— 普通文档布局（方案 8.5 / 8.6）
 * 承担：研究方法、安全边界、关于、更新记录等长文页；
 * 以及 /knowledge/* 知识卡详情页（从 knowledge.data 匹配当前路径，渲染头部证据组件）。
 */
import { computed } from 'vue'
import { useData, useRoute, Content } from 'vitepress'
import { data as knowledgeData } from '../data/knowledge.data.ts'
import EvidenceBadge from '../components/EvidenceBadge.vue'
import SafetyNotice from '../components/SafetyNotice.vue'
import RelatedReading from '../components/RelatedReading.vue'
import { data as buildInfo } from '../data/build-info.data.ts'

const { frontmatter } = useData()
const route = useRoute()

const byId = computed(() => {
  const m: Record<string, any> = {}
  for (const it of knowledgeData.items) m[it.id] = it
  return m
})

/** 当前路径匹配的知识条目（知识卡详情页） */
const current = computed(() =>
  knowledgeData.items.find((it) => it.url === route.path) || null
)

const isDetail = computed(() => !!current.value)

const related = computed(() => {
  const c = current.value
  if (!c) return null
  const resolve = (ids: string[]) =>
    ids
      .filter((id) => id !== c.id)
      .map((id) => {
        const it = byId.value[id]
        return it ? { title: it.title, url: it.url } : null
      })
      .filter(Boolean)
  return {
    originals: resolve(c.related.originals),
    disputes: resolve(c.related.disputes),
    concepts: resolve(c.related.concepts)
  }
})

/** 证据等级文案（EvidenceBadge 用） */
const evidenceText = computed(() => {
  const c = current.value
  if (!c) return ''
  if (c.evidenceLevel) return c.evidenceLevel
  if (c.type === 'concepts' && c.meta['现代证据等级']) return c.meta['现代证据等级']
  return ''
})

/** 风险提示（知识卡详情：风险等级 S0-S4 → caution/danger） */
const riskLevel = computed<'info' | 'caution' | 'danger' | null>(() => {
  const c = current.value
  if (!c || !c.riskLevel) return null
  if (/S[2-4]/.test(c.riskLevel)) return 'caution'
  return 'info'
})
</script>

<template>
  <div class="wdz-container wdz-container--narrow wdz-prose wdz-article" style="padding-top: 48px; padding-bottom: 64px;">
    <!-- 知识卡详情：头部证据组件 -->
    <template v-if="isDetail && current">
      <div class="wdz-original-title">
        <h1>{{ current.title }}</h1>
      </div>
      <p class="wdz-mono" style="color: var(--wdz-ink-3); margin: 0 0 12px;">{{ current.id }}</p>

      <!-- 状态徽章行 -->
      <p class="tag-row">
        <span class="tag" :class="current.status === '正式公开' ? 'tag-publish-public' : 'tag-publish-draft'">{{ current.status }}</span>
        <span v-for="(v, k) in current.tags" :key="k" class="tag tag-status">{{ k }}：{{ v }}</span>
      </p>

      <!-- 公开摘要 -->
      <blockquote v-if="current.summary" style="margin-top: 20px;">
        {{ current.summary }}
      </blockquote>

      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0;">
        <EvidenceBadge v-if="evidenceText" :level="evidenceText" />
        <SafetyNotice v-if="riskLevel" :level="riskLevel">
          本条目风险等级 {{ current.riskLevel }}。内容为知识整理，不构成练习指导或医疗建议。
        </SafetyNotice>
      </div>

      <!-- 折叠元信息 -->
      <details class="wdz-meta-detail">
        <summary>查看完整元信息</summary>
        <div class="details-content">
          <table>
            <tbody>
              <tr v-for="(v, k) in current.meta" :key="k">
                <th style="width: 150px;">{{ k }}</th>
                <td>{{ v }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <!-- 正文（生成脚本产出的 md，含 block 容器） -->
      <Content />
    </template>

    <!-- 普通文档页 -->
    <template v-else>
      <h1 v-if="frontmatter.title">{{ frontmatter.title }}</h1>
      <Content />
      <aside v-if="route.path === '/updates/' || route.path === '/updates'" class="wdz-build-info" aria-label="当前站点版本">
        <span>当前站点版本：{{ buildInfo.commit }}</span>
        <span v-if="buildInfo.buildTime">构建时间：{{ buildInfo.buildTime }}</span>
      </aside>
    </template>

    <!-- 知识卡详情底部：关联阅读 -->
    <RelatedReading v-if="isDetail && related" v-bind="related" />
  </div>
</template>
