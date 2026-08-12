<script setup lang="ts">
/**
 * Layout.vue —— 根布局
 * 根据 frontmatter.layout 分发页面布局；渲染顶栏（≤6 项导航 + 搜索 + 主题 + 汉堡）与页尾。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'
import HomeLayout from './layouts/HomeLayout.vue'
import TopicsLayout from './layouts/TopicsLayout.vue'
import ConceptTopicLayout from './layouts/ConceptTopicLayout.vue'
import QuestionLayout from './layouts/QuestionLayout.vue'
import KnowledgeLayout from './layouts/KnowledgeLayout.vue'
import GraphLayout from './layouts/GraphLayout.vue'
import GraphNodeLayout from './layouts/GraphNodeLayout.vue'
import ArticleLayout from './layouts/ArticleLayout.vue'
import SearchModal from './components/SearchModal.vue'

const { frontmatter } = useData()
const route = useRoute()

const THEME_KEY = 'wendaozhi.reading.theme'
const navLinks = [
  { text: '问道', link: '/' },
  { text: '我要学习', link: '/question-map/' },
  { text: '我要实践', link: '/practice/' },
  { text: '专题研究', link: '/topics/' },
  { text: '典籍与概念', link: '/knowledge/' },
  { text: '知识图谱', link: '/graph/' }
]

const layoutMap: Record<string, any> = {
  home: HomeLayout,
  topic: ConceptTopicLayout,
  topics: TopicsLayout,
  question: QuestionLayout,
  knowledge: KnowledgeLayout,
  graph: GraphLayout,
  'graph-node': GraphNodeLayout
}
const layoutComp = computed(() => layoutMap[String(frontmatter.value.layout)] || ArticleLayout)

const mobileOpen = ref(false)
const searchOpen = ref(false)
const readingTheme = ref<'light' | 'dark'>('light')
const themeLabel = computed(() => readingTheme.value === 'dark' ? '切换到日读' : '切换到夜读')

function applyTheme(next: 'light' | 'dark', persist = true) {
  readingTheme.value = next
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.wdzTheme = next
    document.documentElement.style.colorScheme = next
  }
  if (persist && typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, next)
}

function toggleTheme() {
  applyTheme(readingTheme.value === 'dark' ? 'light' : 'dark')
}

onMounted(() => {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') {
    applyTheme(stored, false)
    return
  }
  const systemDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
  applyTheme(systemDark ? 'dark' : 'light', false)
})

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
        <a class="wdz-nav__brand" href="/">问道志<small>求索与辨析</small></a>
        <nav class="wdz-nav__links" aria-label="主导航">
          <a v-for="l in navLinks" :key="l.link" class="wdz-nav__link" :class="{ 'is-active': isActive(l.link) }" :href="l.link">{{ l.text }}</a>
        </nav>
        <div class="wdz-nav__actions">
          <button class="wdz-nav__theme-btn" type="button" :aria-label="themeLabel" :title="themeLabel" :aria-pressed="readingTheme === 'dark'" @click="toggleTheme">
            <svg v-if="readingTheme === 'dark'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>
          </button>
          <button class="wdz-nav__search-btn" type="button" aria-label="搜索" title="搜索（/）" @click="searchOpen = true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          </button>
          <button class="wdz-nav__hamburger" type="button" aria-label="菜单" :aria-expanded="mobileOpen" @click="mobileOpen = !mobileOpen">
            <svg v-if="!mobileOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>
      <nav v-show="mobileOpen" class="wdz-nav__mobile" :class="{ 'is-open': mobileOpen }" aria-label="移动端导航">
        <a v-for="l in navLinks" :key="l.link" :class="{ 'is-active': isActive(l.link) }" :href="l.link">{{ l.text }}</a>
        <a href="/method/">研究方法</a>
        <a href="/safety/">安全边界</a>
        <a href="/about/">关于问道志</a>
      </nav>
    </header>

    <main class="wdz-main"><component :is="layoutComp" /></main>

    <footer class="wdz-footer">
      <div class="wdz-footer__inner">
        <div class="wdz-footer__grid">
          <div><div class="wdz-footer__brand">问道志</div><p class="wdz-footer__desc">不急于相信，也不急于否定。<br />以可靠研究支撑学习、辨析与低风险基础实践。</p></div>
          <div class="wdz-footer__col"><h4>学习</h4><a href="/question-map/">我要学习</a><a href="/topics/">专题研究</a><a href="/knowledge/">典籍与概念</a><a href="/graph/">知识图谱</a><a href="/method/">研究方法</a></div>
          <div class="wdz-footer__col"><h4>实践</h4><a href="/practice/">我要实践</a><a href="/practice/card/precheck">开始前安全检查</a><a href="/practice/card/natural-breath">自然察息</a><a href="/practice/card/short-sitting">短时基础安坐</a><a href="/safety/">安全边界</a></div>
          <div class="wdz-footer__col"><h4>项目</h4><a href="/about/">关于问道志</a><a href="/updates/">更新记录</a><a href="https://github.com/2740219773/dao-practice-reconstruction">GitHub 仓库</a></div>
        </div>
        <div class="wdz-footer__bottom"><span>问道志 · 研究与实践均持续修订 · 不构成医疗建议</span><span>知识与实践正文以仓库为源；中高风险内容不生成自动教程</span></div>
      </div>
    </footer>

    <SearchModal v-model:open="searchOpen" />
  </div>
</template>
