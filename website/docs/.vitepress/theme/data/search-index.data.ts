/**
 * search-index.data.ts —— 客户端全站搜索索引
 *
 * 两层内容同时保留：
 * - 旧知识卡/专题/问题：证据、研究过程与专题内容层；
 * - V3 图谱节点：统一实体与关系导航层。
 *
 * 同名结果不强行去重，通过“图谱·类型”标签区分不同阅读入口。
 */
import { defineLoader } from 'vitepress'
import { loadKnowledgeData } from './knowledge.data.ts'
import { loadTopicsData } from './topics.data.ts'
import { loadQuestionsData } from './questions.data.ts'
import { loadGraphData } from './graph.data.ts'
import { TYPE_LABELS } from './_lib/常量.ts'
import type { SearchEntry } from './_lib/types.ts'

declare const data: SearchEntry[]
export { data }

const GRAPH_TYPE_LABELS: Record<string, string> = {
  concept: '概念',
  classic: '经典',
  person: '人物',
  school: '传统',
  method: '方法',
  stage: '阶段',
  route: '路线',
  research: '研究'
}

export async function loadSearchIndex(): Promise<SearchEntry[]> {
  const [knowledge, topics, questions, graph] = await Promise.all([
    loadKnowledgeData(),
    loadTopicsData(),
    loadQuestionsData(),
    Promise.resolve(loadGraphData())
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

  for (const node of graph.nodes) {
    const typeLabel = GRAPH_TYPE_LABELS[node.type] || node.type
    const tags = Array.isArray(node.tags) ? node.tags.join(' ') : ''
    entries.push({
      id: `graph:${node.id}`,
      title: node.name,
      type: `图谱·${typeLabel}`,
      url: `/graph/node/${encodeURIComponent(node.id)}`,
      keywords: [node.id, node.name, node.summary, tags, typeLabel, node.school_kind || ''].join(' '),
      snippet: `V3 实体 · ${String(node.summary || '').slice(0, 108)}`
    })
  }

  const ids = new Set<string>()
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`搜索索引 ID 重复：${entry.id}`)
    ids.add(entry.id)
  }

  console.log(`[search-index.data] ${entries.length} 条索引（其中 V3 图谱节点 ${graph.nodes.length}）`)
  return entries
}

export default defineLoader({
  load: loadSearchIndex
})
