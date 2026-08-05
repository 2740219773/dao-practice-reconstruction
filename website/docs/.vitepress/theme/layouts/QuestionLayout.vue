<script setup lang="ts">
/**
 * QuestionLayout.vue —— 问题详情（方案 8.3）
 * 研究路线式结构：问题背景 → 简短结论 → 支持材料 → 反方材料 → 暂时不能确认 → 关联专题。
 * 从 questions.data 按路径匹配；支持 material（问题卡正文）与数据驱动两种内容来源。
 */
import { computed } from 'vue'
import { useData, useRoute, Content } from 'vitepress'
import { data as questionsData } from '../data/questions.data.ts'
import { data as knowledgeData } from '../data/knowledge.data.ts'
import { TYPE_LABELS } from '../data/_lib/常量.ts'
import RelatedReading from '../components/RelatedReading.vue'

const { frontmatter } = useData()
const route = useRoute()

/** 问题地图首页分组数据 */
const groups = questionsData.groups

const q = computed(() =>
  questionsData.questions.find((x) => x.url === route.path) || null
)

const byId = computed(() => {
  const m: Record<string, any> = {}
  for (const it of knowledgeData.items) m[it.id] = it
  return m
})

/** 支持材料：答案依据对应的知识条目 */
const supports = computed(() =>
  (q.value?.supports || []).map((id) => byId.value[id]).filter(Boolean)
)

/** 反方材料：辨析卡/主张卡 */
const opposes = computed(() =>
  (q.value?.opposes || []).map((id) => byId.value[id]).filter(Boolean)
)

const related = computed(() => ({
  originals: supports.value.filter((it) => it.type === 'originals').map((it) => ({ title: it.title, url: it.url })),
  disputes: opposes.value.filter((it) => it.type === 'disputes' || it.type === 'claims').map((it) => ({ title: it.title, url: it.url })),
  concepts: supports.value.filter((it) => it.type === 'concepts').map((it) => ({ title: it.title, url: it.url }))
}))
</script>

<template>
  <div class="wdz-container wdz-question-page" style="padding-top: 40px; padding-bottom: 64px;">
    <template v-if="q">
      <!-- 问题首部 -->
      <div class="wdz-topic-hero">
        <div class="wdz-topic-glyph">问</div>
        <h1 class="wdz-topic-title">{{ q.title }}</h1>
        <p class="wdz-topic-sub">从问题出发，沿研究路线核查：结论、依据、反方与边界。</p>
        <div class="wdz-topic-badges">
          <span class="wdz-badge wdz-badge--moss"><span class="wdz-badge__dot" />{{ q.group }}</span>
          <span class="wdz-badge wdz-badge--plain">答案依据等级：{{ q.level }}</span>
          <span class="wdz-badge wdz-badge--vermilion"><span class="wdz-badge__dot" />{{ q.status }}</span>
        </div>
      </div>

      <div class="wdz-question-layout">
        <div class="wdz-topic-main">
          <!-- 研究路线 -->
          <div class="wdz-question-path">
            <!-- ① 问题背景 -->
            <div class="wdz-qstep">
              <div class="wdz-qstep__title">问题背景</div>
              <div class="wdz-qstep__body">{{ q.background || q.briefAnswer }}</div>
            </div>

            <!-- ② 简短结论 -->
            <div class="wdz-qstep">
              <div class="wdz-qstep__title">简短结论</div>
              <div class="wdz-qstep__body" style="font-weight: 600; color: var(--wdz-ink);">{{ q.briefAnswer }}</div>
            </div>

            <!-- ③ 支持材料 -->
            <div class="wdz-qstep" v-if="supports.length">
              <div class="wdz-qstep__title">支持材料</div>
              <div class="wdz-qstep__links">
                <a v-for="it in supports" :key="it.id" :href="it.url">{{ it.title }}（{{ TYPE_LABELS[it.type] || it.type }}）</a>
              </div>
            </div>

            <!-- ④ 反方材料 -->
            <div class="wdz-qstep" v-if="opposes.length">
              <div class="wdz-qstep__title">反方材料</div>
              <div class="wdz-qstep__body">近现代传播中的简化说法与辨析，用于对照而不直接采纳。</div>
              <div class="wdz-qstep__links">
                <a v-for="it in opposes" :key="it.id" :href="it.url">{{ it.title }}</a>
              </div>
            </div>

            <!-- ⑤ 暂时不能确认 -->
            <div class="wdz-qstep" v-if="q.unresolved && q.unresolved.length">
              <div class="wdz-qstep__title">暂时不能确认</div>
              <div class="wdz-qstep__body" v-for="(u, i) in q.unresolved" :key="i">{{ u }}</div>
            </div>

            <!-- ⑥ 关联专题 -->
            <div class="wdz-qstep" v-if="q.relatedTopics.length">
              <div class="wdz-qstep__title">关联专题</div>
              <div class="wdz-qstep__links">
                <a v-for="t in q.relatedTopics" :key="t" :href="t === '静' ? '/topics/jing' : '/topics/'">{{ t }}</a>
              </div>
            </div>
          </div>

          <RelatedReading v-bind="related" />
        </div>

        <!-- 侧栏 -->
        <aside class="wdz-topic-aside">
          <div class="wdz-aside-card">
            <h4>这是什么</h4>
            <ul>
              <li style="color: var(--wdz-ink-2); font-size: 0.85rem; line-height: 1.7;">
                问题地图把自然问题组织成研究路线。每个结论都保留来源、证据等级与边界，不直接给"答案"。
              </li>
            </ul>
          </div>
          <div class="wdz-aside-card">
            <h4>安全提示</h4>
            <ul>
              <li style="color: var(--wdz-ink-2); font-size: 0.85rem;">内容为知识整理，不构成练习指导或医疗建议。</li>
            </ul>
          </div>
        </aside>
      </div>
    </template>

    <!-- 问题地图首页（/question-map/）或非匹配：渲染 md -->
    <template v-else>
      <div class="wdz-topic-hero">
        <div class="wdz-topic-glyph">问</div>
        <h1 class="wdz-topic-title">问题地图</h1>
        <p class="wdz-topic-sub">用自然问题组织知识，而不是用内部分类。每个问题都显示：已有结论、开放争议、关联材料。</p>
      </div>
      <div style="display: flex; flex-direction: column; gap: 32px; margin-top: 24px;">
        <div v-for="g in groups" :key="g.key" class="wdz-qgroup">
          <div class="wdz-qgroup__title">{{ g.label }}</div>
          <div class="wdz-qgroup__desc">{{ g.desc }}</div>
          <div class="wdz-qgroup__list">
            <a v-for="qq in g.questions" :key="qq.id" :href="qq.url" class="wdz-question-card">
              <div class="wdz-question-card__title">{{ qq.title }}</div>
              <div class="wdz-question-card__desc">{{ qq.briefAnswer }}</div>
              <div class="wdz-question-card__meta">
                <span>{{ qq.level }}级依据</span>
                <span>已公开</span>
              </div>
            </a>
          </div>
        </div>
      </div>
      <div class="wdz-container wdz-prose" style="margin-top: 40px; max-width: none;">
        <Content />
      </div>
    </template>
  </div>
</template>
