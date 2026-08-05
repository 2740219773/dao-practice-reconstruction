/**
 * search-index.data.ts —— 客户端搜索索引（方案 14.2 / C 节）
 * 构建期聚合知识条目、专题、问题，输出轻量索引（MiniSearch 客户端检索）。
 * 注意：data loader 之间不能 import 对方的 data 变量，故复用各 loader 的加载函数。
 */
import { defineLoader } from 'vitepress'
import { loadKnowledgeData } from './knowledge.data.ts'
import { loadTopicsData } from './topics.data.ts'
import { loadQuestionsData } from './questions.data.ts'
import { TYPE_LABELS } from './_lib/常量.ts'
import type { SearchEntry } from './_lib/types.ts'

declare const data: SearchEntry[]
export { data }

export default defineLoader({
  async load(): Promise<SearchEntry[]> {
    const [knowledge, topics, questions] = await Promise.all([
      loadKnowledgeData(),
      loadTopicsData(),
      loadQuestionsData()
    ])

    const entries: SearchEntry[] = []

    for (const item of knowledge.items) {
      entries.push({
        id: item.id,
        title: item.title,
        type: TYPE_LABELS[item.type] || item.type,
        url: item.url,
        keywords: [item.id, item.title, TYPE_LABELS[item.type] || '', item.summary, item.relPath].join(' '),
        snippet: item.summary.slice(0, 120)
      })
    }

    for (const t of topics.searchableTopics) {
      entries.push({
        id: t.id,
        title: `专题：${t.name}`,
        type: '专题',
        url: t.url,
        keywords: [t.id, t.name, t.module, t.narrative.what, t.narrative.disputes].join(' '),
        snippet: t.narrative.what.slice(0, 120)
      })
    }

    for (const q of questions.questions) {
      entries.push({
        id: q.id,
        title: `问题：${q.title}`,
        type: '问题',
        url: q.url,
        keywords: [q.id, q.title, q.group, q.briefAnswer].join(' '),
        snippet: q.briefAnswer.slice(0, 120)
      })
    }

    console.log(`[search-index.data] ${entries.length} 条索引`)
    return entries
  }
})
