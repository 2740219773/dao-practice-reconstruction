<script setup lang="ts">
/**
 * Layout.vue —— 根布局（方案 6.1 / 6.2）
 * 根据 frontmatter.layout 分发页面布局；渲染顶栏（≤6 项导航 + 搜索 + 汉堡）与页尾。
 */
import { computed, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'
import HomeLayout from './layouts/HomeLayout.vue'
import TopicsLayout from './layouts/TopicsLayout.vue'
import ConceptTopicLayout from './layouts/ConceptTopicLayout.vue'
import QuestionLayout from './layouts/QuestionLayout.vue'
import KnowledgeLayout from './layouts/KnowledgeLayout.vue'
import GraphLayout from './layouts/GraphLayout.vue'
import ArticleLayout from './layouts/ArticleLayout.vue'
import SearchModal from './components/SearchModal.vue'

const { frontmatter } = useData()
const route = useRoute()

/** 一级导航：按用户任务组织，控制在 6 项以内 */
const navLinks = [
  { text: '问道', link: '/' },
  { text: '问题地图', link: '/question-map/' },
  { text: '专题研究', link: '/topics/' },
  { text: '典籍与概念', link: '/knowledge/' },
  { text: '知识图谱', link: '/graph/' },
  { text: '研究方法', link: '/method/' }
]

const layoutMap: Record<string, any> = {
  home: HomeLayout,
  topic: ConceptTopicLayout,
  topics: TopicsLayout,
  question: QuestionLayout,
  knowledge: KnowledgeLayout,
  graph: GraphLayout
}
const layoutComp = computed(() => layoutMap[String(frontmatter.value.layout)] || ArticleLayout)

const mobileOpen = ref(false)
const searchOpen = ref(false)

function isActive(link: string): boolean {
  const p = route.path
  if (link === '/') return p === '/'
  return p === link || p.startsWith(link)
}

watch(() => route.path, () => {
  mobileOpen.value = false
  searchOpen.value = false
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') searchOpen.value = false
}
</script>

<template>
  <div class="wdz-shell" @keydown="onKeydown">
    <header class="wdz-nav">
      <div class="wdz-nav__inner">
        <a class="wdz-nav__brand" href="/">
          问道志<small>求索与辨析</small>
        </a>
        <nav class="wdz-nav__links" aria-label="主导航">
          <a
            v-for="l in navLinks"
            :key="l.link"
            class="wdz-nav__link"
            :class="{ 'is-active': isActive(l.link) }"
            :href="l.link"
          >{{ l.text }}</a>
        </nav>
        <div class="wdz-nav__actions">
          <button
            class="wdz-nav__search-btn"
            type="button"
            aria-label="搜索"
            title="搜索（/）"
            @click="searchOpen = true"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          </button>
          <button
            class="wdz-nav__hamburger"
            type="button"
            aria-label="菜单"
            :aria-expanded="mobileOpen"
            @click="mobileOpen = !mobileOpen"
          >
            <svg v-if="!mobileOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>
      <nav v-show="mobileOpen" class="wdz-nav__mobile" :class="{ 'is-open': mobileOpen }" aria-label="移动端导航">
        <a
          v-for="l in navLinks"
          :key="l.link"
          :class="{ 'is-active': isActive(l.link) }"
          :href="l.link"
        >{{ l.text }}</a>
        <a href="/safety/">安全边界</a>
        <a href="/about/">关于问道志</a>
      </nav>
    </header>

    <main class="wdz-main">
      <component :is="layoutComp" />
    </main>

    <footer class="wdz-footer">
      <div class="wdz-footer__inner">
        <div class="wdz-footer__grid">
          <div>
            <div class="wdz-footer__brand">问道志</div>
            <p class="wdz-footer__desc">不急于相信，也不急于否定。<br />传统道家知识的来源整理、概念辨析与现代重构。</p>
          </div>
          <div class="wdz-footer__col">
            <h4>阅读</h4>
            <a href="/question-map/">问题地图</a>
            <a href="/topics/">全部专题</a>
            <a href="/topics/jing">「静」专题</a>
            <a href="/knowledge/">典籍与概念</a>
            <a href="/graph/">知识图谱</a>
            <a href="/method/">研究方法</a>
          </div>
          <div class="wdz-footer__col">
            <h4>项目</h4>
            <a href="/about/">关于问道志</a>
            <a href="/safety/">安全边界</a>
            <a href="/updates/">更新记录</a>
            <a href="https://github.com/2740219773/dao-practice-reconstruction">GitHub 仓库</a>
          </div>
          <div class="wdz-footer__col">
            <h4>边界</h4>
            <a href="/safety/#知识研究">知识研究</a>
            <a href="/safety/#需要专业意见">需要专业意见</a>
            <a href="/safety/#立即停止并求助">应立即停止并求助</a>
          </div>
        </div>
        <div class="wdz-footer__bottom">
          <span>问道志 · 内容持续整理中 · 不构成练习指导或医疗建议</span>
          <span>内容以知识卡与原文为源，修订记录见 GitHub</span>
        </div>
      </div>
    </footer>

    <SearchModal v-model:open="searchOpen" />
  </div>
</template>
