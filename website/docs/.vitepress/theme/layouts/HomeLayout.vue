<script setup lang="ts">
/**
 * HomeLayout.vue —— 首页（方案七：6 屏结构）
 * ① 品牌与起点 → InkHero
 * ② 你想了解什么 → QuestionEntry
 * ③ 当前研究·静的文脉路线 → TopicRoute
 * ④ 六个核心概念 → ConceptMap
 * ⑤ 我们如何形成判断 → 静态 5 步
 * ⑥ 最近更新 → 数据驱动
 */
import { computed } from 'vue'
import { useData } from 'vitepress'
import { data as knowledgeData } from '../data/knowledge.data.ts'
import { data as questionsData } from '../data/questions.data.ts'
import { HOMEPAGE_QUESTION_IDS } from '../data/_lib/常量.ts'
import InkHero from '../components/InkHero.vue'
import QuestionEntry from '../components/QuestionEntry.vue'
import TopicRoute from '../components/TopicRoute.vue'
import ConceptMap from '../components/ConceptMap.vue'

const { frontmatter } = useData()

/** 第二屏：3 个高价值问题 */
const heroQuestions = computed(() =>
  HOMEPAGE_QUESTION_IDS
    .map((id) => questionsData.byId[id])
    .filter(Boolean)
)

/** 第四屏：六个核心概念（概念-0001~0006） */
const concepts = computed(() =>
  (knowledgeData.byType.concepts || []).slice(0, 6)
)

/** 第六屏：最近更新（按最后修改日期排序前 3 条） */
const recentUpdates = computed(() =>
  [...knowledgeData.items]
    .filter((it) => it.lastModified)
    .sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))
    .slice(0, 3)
)
</script>

<template>
  <div class="wdz-home">
    <!-- 第一屏：品牌与起点 -->
    <InkHero />

    <section class="wdz-home-principles" aria-label="研究原则">
      <div class="wdz-container wdz-home-principles__inner">
        <div><b>文</b><span><strong>原文为根</strong>回到语境与版本，不先设结论。</span></div>
        <div><b>辨</b><span><strong>多方辨析</strong>区分原文、传承与项目判断。</span></div>
        <div><b>界</b><span><strong>边界清晰</strong>公开争议、不能确认与风险。</span></div>
      </div>
    </section>

    <!-- 第二屏：你想了解什么 -->
    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">问题</span>
        <h2 class="wdz-section__title">你想了解什么</h2>
      </div>
      <p class="wdz-section__sub">从问题开始，而不是从分类开始。三个代表性问题，通往完整的问题地图。</p>
      <QuestionEntry :questions="heroQuestions" style="margin-top: 24px;" />
    </section>

    <!-- 第三屏：当前研究·静的文脉路线 -->
    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">路线</span>
        <h2 class="wdz-section__title">当前研究 ·「静」的文脉路线</h2>
      </div>
      <TopicRoute />
      <p class="wdz-section__sub" style="margin-top: 8px;">阅读顺序，不代表单纯继承；每一站都可回到原文查证。</p>
    </section>

    <!-- 第四屏：六个核心概念 -->
    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">概念</span>
        <h2 class="wdz-section__title">六个核心概念</h2>
      </div>
      <p class="wdz-section__sub">关系线表示研究关联，不代表固定理论。</p>
      <ConceptMap :concepts="concepts" style="margin-top: 24px;" />
    </section>

    <!-- 第五屏：我们如何形成判断 -->
    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">方法</span>
        <h2 class="wdz-section__title">我们如何形成判断</h2>
      </div>
      <div class="wdz-steps">
        <div class="wdz-step"><div class="wdz-step__num">1</div><div class="wdz-step__title">找到原文</div><div class="wdz-step__desc">回到典籍原文，注明版本与页码</div></div>
        <div class="wdz-step"><div class="wdz-step__num">2</div><div class="wdz-step__title">核对语境</div><div class="wdz-step__desc">区分章节、时代与说话语境</div></div>
        <div class="wdz-step"><div class="wdz-step__num">3</div><div class="wdz-step__title">区分解释</div><div class="wdz-step__desc">原文支持 / 后世解释 / 项目归纳分开</div></div>
        <div class="wdz-step"><div class="wdz-step__num">4</div><div class="wdz-step__title">对照研究</div><div class="wdz-step__desc">与现代研究对照，但不互相替代</div></div>
        <div class="wdz-step"><div class="wdz-step__num">5</div><div class="wdz-step__title">标记边界</div><div class="wdz-step__desc">不能确认的与有风险的，明确标注</div></div>
      </div>
      <p style="margin-top: 16px; font-size: 0.9rem; color: var(--wdz-ink-2);">
        完整七层工作流见 <a href="/method/" style="color: var(--wdz-vermilion);">研究方法</a>。
      </p>
    </section>

    <!-- 第六屏：最近更新 -->
    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">更新</span>
        <h2 class="wdz-section__title">最近更新</h2>
      </div>
      <div class="wdz-updates">
        <a v-for="u in recentUpdates" :key="u.id" class="wdz-update" :href="u.url">
          <span class="wdz-update__date">{{ u.lastModified }}</span>
          <span class="wdz-update__title">{{ u.title }}</span>
        </a>
      </div>
    </section>
  </div>
</template>
