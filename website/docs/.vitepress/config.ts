import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '问道志',
  description: '传统道家修炼知识重构与研究计划——研究工作台公开预览版',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '项目说明', link: '/project' },
      { text: '研究方法', link: '/method' },
      { text: '文献库', link: '/library/' },
      { text: '原文库', link: '/originals/' },
      { text: '概念库', link: '/concepts/' },
      { text: '争议与开放问题', link: '/disputes' },
      { text: '当代传播观察', link: '/contemporary' },
      { text: '安全边界', link: '/safety' }
    ],
    sidebar: [
      {
        text: '关于本项目',
        items: [
          { text: '项目说明', link: '/project' },
          { text: '研究方法', link: '/method' },
          { text: '当前进度', link: '/progress' }
        ]
      },
      {
        text: '内容库',
        items: [
          { text: '文献库', link: '/library/' },
          { text: '原文库', link: '/originals/' },
          { text: '概念库', link: '/concepts/' },
          { text: '争议与开放问题', link: '/disputes' },
          { text: '当代传播观察', link: '/contemporary' }
        ]
      },
      {
        text: '安全',
        items: [
          { text: '安全边界', link: '/safety' }
        ]
      }
    ],
    footer: {
      message: '研究工作台公开预览版 · 内容持续整理中 · 不构成练习指导或医疗建议',
      copyright: '问道志'
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    lastUpdatedText: '最后更新'
  }
})
