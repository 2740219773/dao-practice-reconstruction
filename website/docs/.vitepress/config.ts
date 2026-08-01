import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '问道志',
  description: '传统道家修炼知识重构与研究计划——研究工作台公开预览版。整理文献、原文、概念、争议与现代研究，证据与风险并重。',
  // 部署路径（网站建设计划 V0.1 五.1）：
  // Cloudflare Pages 根地址或独立域名使用 '/'（默认）；
  // 部署到 GitHub Pages 仓库子路径时改为 '/dao-practice-reconstruction/'
  base: '/',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    // 正式公开前阻止搜索引擎收录（网站建设计划 V0.1 六.小项）；正式上线时移除本行并补充 sitemap
    ['meta', { name: 'robots', content: 'noindex,nofollow' }]
  ],
  themeConfig: {
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '未找到相关结果',
            resetButtonTitle: '清除查询',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    },
    nav: [
      { text: '首页', link: '/' },
      {
        text: '项目',
        items: [
          { text: '项目说明', link: '/project/' },
          { text: '研究方法', link: '/project/method/' },
          { text: '当前进度', link: '/project/progress/' }
        ]
      },
      {
        text: '知识库',
        items: [
          { text: '文献库', link: '/library/' },
          { text: '原文库', link: '/originals/' },
          { text: '概念库', link: '/concepts/' }
        ]
      },
      {
        text: '研究议题',
        items: [
          { text: '"静"专题', link: '/topics/' },
          { text: '争议与开放问题', link: '/disputes/' },
          { text: '当代传播观察', link: '/contemporary/' }
        ]
      },
      { text: '安全边界', link: '/safety/' }
    ],
    sidebar: [
      {
        text: '关于本项目',
        items: [
          { text: '项目说明', link: '/project/' },
          { text: '研究方法', link: '/project/method/' },
          { text: '当前进度', link: '/project/progress/' }
        ]
      },
      {
        text: '内容库',
        items: [
          { text: '文献库', link: '/library/' },
          { text: '原文库', link: '/originals/' },
          { text: '概念库', link: '/concepts/' },
          { text: '"静"专题', link: '/topics/' },
          { text: '争议与开放问题', link: '/disputes/' },
          { text: '当代传播观察', link: '/contemporary/' }
        ]
      },
      {
        text: '安全',
        items: [
          { text: '安全边界', link: '/safety/' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/2740219773/dao-practice-reconstruction' }
    ],
    footer: {
      message: '研究工作台公开预览版 · 内容持续整理中 · 不构成练习指导或医疗建议',
      copyright: '问道志 · 知识库见 GitHub 仓库'
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    lastUpdatedText: '最后更新'
  }
})
