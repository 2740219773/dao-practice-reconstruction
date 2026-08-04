<script setup lang="ts">
/**
 * InkHero.vue —— 首页首屏（方案 7.2）
 * 左侧：竖排题签 + 朱砂方印 + 标题 + 核心句 + 双按钮 + 文字入口；右侧/背景：淡墨山水。
 */
import { useData } from 'vitepress'
import { data as knowledgeData } from '../data/knowledge.data.ts'

const { frontmatter } = useData()
const stats = knowledgeData.stats
</script>

<template>
  <section class="wdz-hero">
    <!-- 淡墨山水背景 -->
    <div class="wdz-hero__ink" aria-hidden="true" />

    <div class="wdz-container wdz-hero__inner">
      <div>
        <div class="wdz-hero__brand-row">
          <span class="wdz-brand-seal" aria-hidden="true">问道</span>
          <div>
            <h1 class="wdz-hero__title">问道志</h1>
            <div class="wdz-hero__slogan">不急于相信，也不急于否定。</div>
          </div>
        </div>
        <p class="wdz-hero__desc">
          传统道家知识的来源整理、概念辨析与现代重构。
          从原文、解释、证据、争议与风险出发，记录一条可以追溯和修订的求索路径。
        </p>
        <div class="wdz-hero__actions">
          <a class="wdz-btn wdz-btn--primary" href="/question-map/">从一个问开始 →</a>
          <a class="wdz-btn wdz-btn--secondary" href="/topics/jing">阅读「静」专题</a>
          <a class="wdz-btn wdz-btn--text" href="/method/">查看研究方法 →</a>
        </div>
      </div>

      <div class="wdz-hero__aside">
        <p class="wdz-hero__quote">
          「知其所止，方能有所辨。」<br />
          本站不提供即时答案，只提供一条可查证的路径。
        </p>
        <div class="wdz-hero__stats">
          <div class="wdz-hero__stat"><b>{{ stats.knowledgePub }}</b>已公开知识</div>
          <div class="wdz-hero__stat"><b>{{ stats.total }}</b>知识卡在库</div>
          <div class="wdz-hero__stat"><b>{{ stats.pending }}</b>整理中</div>
        </div>
      </div>
    </div>
  </section>
</template>
