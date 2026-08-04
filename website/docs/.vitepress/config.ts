import { defineConfig } from 'vitepress'
import container from 'markdown-it-container'

/** 注册知识区块容器（对应 components.css 的 .block-*） */
function blockContainer(md, name) {
  md.use(container, name, {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        const strip = new RegExp(`^${name}\\s*`, 'i')
        return `<div class="block block-${name}"><p class="block-title">${tokens[idx].info.trim().replace(strip, '') || ''}</p>`
      }
      return `</div>\n`
    }
  })
}

function markdownConfig(md) {
  for (const n of ['original', 'annotation', 'tradition', 'project', 'hypothesis', 'conclusion', 'source']) {
    blockContainer(md, n)
  }
}

export default defineConfig({
  lang: 'zh-CN',
  title: '问道志',
  description: '传统道家知识的来源整理、概念辨析与现代重构——不急于相信，也不急于否定。',
  // 部署路径：Cloudflare Pages 根地址使用 '/'（默认）
  base: '/',
  cleanUrls: true,
  lastUpdated: true,
  appearance: false,
  markdown: {
    config: markdownConfig
  },
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    // 正式公开前阻止搜索引擎收录；正式上线时移除本行并补充 sitemap
    ['meta', { name: 'robots', content: 'noindex,nofollow' }]
  ],
  // 自定义主题：导航/页尾由 theme/Layout.vue 渲染；local search 由 SearchModal + search-index.data 承担
  themeConfig: {
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    lastUpdatedText: '最后更新'
  }
})
