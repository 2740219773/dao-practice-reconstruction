<script setup lang="ts">
/**
 * HomeLayout.vue —— 首页
 * ① 品牌与起点 → InkHero
 * ② 学习 / 实践双入口
 * ③ 问题入口
 * ④ 当前研究·静的文脉路线
 * ⑤ 核心概念入口
 * ⑥ 研究判断方法
 * ⑦ 最近更新
 */
import { computed } from 'vue'
import { data as knowledgeData } from '../data/knowledge.data.ts'
import { data as questionsData } from '../data/questions.data.ts'
import { HOMEPAGE_QUESTION_IDS } from '../data/_lib/常量.ts'
import InkHero from '../components/InkHero.vue'
import QuestionEntry from '../components/QuestionEntry.vue'
import TopicRoute from '../components/TopicRoute.vue'
import ConceptMap from '../components/ConceptMap.vue'

const heroQuestions = computed(() =>
  HOMEPAGE_QUESTION_IDS
    .map((id) => questionsData.byId[id])
    .filter(Boolean)
)

const concepts = computed(() =>
  (knowledgeData.byType.concepts || []).slice(0, 6)
)

const recentUpdates = computed(() =>
  [...knowledgeData.items]
    .filter((it) => it.lastModified)
    .sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))
    .slice(0, 3)
)
</script>

<template>
  <div class="wdz-home">
    <InkHero />

    <section class="wdz-home-principles" aria-label="研究原则">
      <div class="wdz-container wdz-home-principles__inner">
        <div><b>文</b><span><strong>原文为根</strong>回到语境与版本，不先设结论。</span></div>
        <div><b>辨</b><span><strong>多方辨析</strong>区分原文、传统与项目判断。</span></div>
        <div><b>界</b><span><strong>边界清晰</strong>知识、实践、体验与现代研究分层。</span></div>
      </div>
    </section>

    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">起点</span>
        <h2 class="wdz-section__title">你今天想从哪里开始</h2>
      </div>
      <p class="wdz-section__sub">问道志现在保留两条清晰入口：先理解，再实践；实践中随时可以回到证据与安全边界。</p>
      <div class="wdz-home-paths">
        <a class="wdz-home-path" href="/question-map/">
          <span class="wdz-home-path__eyebrow">我要学习</span>
          <strong>从一个真实问题进入知识网络</strong>
          <p>通过问题地图连接经典、概念、人物、传统、方法与争议。适合先弄清“古人到底怎么说”。</p>
          <span class="wdz-home-path__link">进入学习 →</span>
        </a>
        <a class="wdz-home-path wdz-home-path--practice" href="/practice/">
          <span class="wdz-home-path__eyebrow">我要实践</span>
          <strong>从低风险基础能力开始</strong>
          <p>安全检查、调身、身体觉察、自然察息、注意返回、短时安坐、动静转换与日用觉察。</p>
          <span class="wdz-home-path__link">进入实践 →</span>
        </a>
      </div>
      <p class="wdz-home__route-note">实践区不是古法速成教程。第一批只开放 S1 低风险现代教学单元，中高风险内容继续只做研究。</p>
    </section>

    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">问题</span>
        <h2 class="wdz-section__title">你想了解什么</h2>
      </div>
      <p class="wdz-section__sub">从问题开始，而不是从分类开始。三个代表性问题，通往完整的问题地图。</p>
      <QuestionEntry :questions="heroQuestions" class="wdz-home__questions" />
    </section>

    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">路线</span>
        <h2 class="wdz-section__title">当前研究 ·「静」的文脉路线</h2>
      </div>
      <TopicRoute />
      <p class="wdz-section__sub wdz-home__route-note">阅读顺序，不代表单纯继承；每一站都可回到原文查证，也不自动生成现代练习步骤。</p>
    </section>

    <section class="wdz-section wdz-container">
      <div class="wdz-section__head">
        <span class="wdz-section__tag">概念</span>
        <h2 class="wdz-section__title">核心概念入口</h2>
      </div>
      <p class="wdz-section__sub">首页先呈现已经进入公开知识索引的概念卡；完整 V3 网络还连接经典、人物、传统与方法。关系线表示研究关联，不代表固定理论、师承或练习步骤。</p>
      <ConceptMap :concepts="concepts" class="wdz-home__concepts" />
      <p class="wdz-home__method-note">
        查看当前完整的 <a href="/graph/">知识图谱 →</a>
      </p>
    </section>

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
      <p class="wdz-home__method-note">
        完整七层工作流见 <a href="/method/">研究方法</a>；实践前请先看 <a href="/safety/">安全边界</a>。
      </p>
    </section>

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

<style scoped>
.wdz-home-paths {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 24px;
}

.wdz-home-path {
  display: block;
  padding: 28px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  text-decoration: none;
  color: inherit;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 70%, transparent);
  transition: transform .18s ease, border-color .18s ease;
}

.wdz-home-path:hover {
  transform: translateY(-2px);
  border-color: var(--vp-c-text-2);
}

.wdz-home-path--practice {
  background: color-mix(in srgb, var(--vp-c-bg-soft) 82%, transparent);
}

.wdz-home-path__eyebrow {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
  letter-spacing: .12em;
  color: var(--vp-c-text-2);
}

.wdz-home-path strong {
  display: block;
  font-size: 21px;
  line-height: 1.4;
}

.wdz-home-path p {
  margin: 12px 0 18px;
  color: var(--vp-c-text-2);
  line-height: 1.75;
}

.wdz-home-path__link {
  font-weight: 600;
}

@media (max-width: 720px) {
  .wdz-home-paths {
    grid-template-columns: 1fr;
  }

  .wdz-home-path {
    padding: 22px;
  }
}
</style>
