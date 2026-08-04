/**
 * topics.data.ts —— 专题数据（方案 14.1 / C 节）
 * 构建期扫描 11-专题研究/*，解析 manifest.yml + 结论摘要.md + 安全边界.md，
 * 输出六段叙事与核心编号清单（供 TopicLayout 渲染）。
 */
import { defineLoader } from 'vitepress'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { REPO_ROOT, splitSections, displayValue } from './_lib/读取知识卡.ts'
import type { Topic } from './_lib/types.ts'

/** 专题目录 → 站点 URL slug */
const TOPIC_SLUGS: Record<string, string> = {
  'TOPIC-001': 'jing',
  'TOPIC-002': 'xu',
  'DAOYIN-001': 'baduanjin',
  'DAOYIN-002': 'wuqinxi',
  'MEDOBS-001': 'inner-observation'
}

/** 结论摘要章节名 → narrative 键 */
const NARRATIVE_KEYS: Record<string, keyof Topic['narrative']> = {
  '这个概念是什么': 'what',
  '它不是什么': 'notWhat',
  '当前可以确认什么': 'confirm',
  '当前不能确认什么': 'unknown',
  '主要争议': 'disputes',
  '安全边界': 'safety'
}

function parseNarrative(filePath: string): Partial<Topic['narrative']> {
  try {
    const body = readFileSync(filePath, 'utf8')
    const out: Partial<Topic['narrative']> = {}
    for (const sec of splitSections(body)) {
      const key = NARRATIVE_KEYS[sec.title]
      if (key) out[key] = sec.lines.join('\n').trim()
    }
    return out
  } catch {
    return {}
  }
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  return []
}

function toPlainSummary(markdown: string): string {
  return markdown
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
}

export interface TopicsData {
  topics: Topic[]
  byId: Record<string, Topic>
  /** 全部已解析专题（含未公开，供导航/路线图） */
  all: Topic[]
}

declare const data: TopicsData
export { data }

/** 核心加载逻辑（供本 loader 与 search-index.data.ts 复用） */
export async function loadTopicsData(): Promise<TopicsData> {
  const base = path.join(REPO_ROOT, '11-专题研究')
  const topics: Topic[] = []
  const all: Topic[] = []
  const byId: Record<string, Topic> = {}

  const { readdirSync, existsSync } = await import('node:fs')
  if (!existsSync(base)) return { topics, byId, all }

  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestFile = path.join(base, entry.name, 'manifest.yml')
    if (!existsSync(manifestFile)) continue
    const raw = yaml.load(readFileSync(manifestFile, 'utf8')) as Record<string, any>

    const id = String(raw['专题编号'] || '')
    const slug = TOPIC_SLUGS[id] || id.toLowerCase().replace(/_/g, '-')
    const name = String(raw['专题名称'] || entry.name)

    const narrative = parseNarrative(path.join(base, entry.name, `${name}专题结论摘要.md`))

    const topic: Topic = {
      id,
      name,
      module: String(raw['模块'] || ''),
      stage: String(raw['当前阶段'] || ''),
      summary: toPlainSummary(narrative.what || ''),
      coreQuestions: Array.isArray(raw['核心问题'])
        ? raw['核心问题'].map((q: any) => ({ id: String(q.id || ''), question: String(q.question || '') }))
        : [],
      coreIds: {
        原文: parseList(raw['核心原文']),
        概念: parseList(raw['核心概念']),
        主张: parseList(raw['核心主张']),
        争议: parseList(raw['核心争议']),
        研究: parseList(raw['固定现代研究']),
        风险: parseList(raw['风险资料'])
      },
      narrative: {
        what: narrative.what || '',
        notWhat: narrative.notWhat || '',
        confirm: narrative.confirm || '',
        unknown: narrative.unknown || '',
        disputes: narrative.disputes || '',
        safety: narrative.safety || ''
      },
      url: `/topics/${slug}`
    }
    byId[id] = topic
    all.push(topic)
    // 仅"已完成并冻结"或明确进入公开流程的专题进入 topics 列表（静专题当前唯一）
    if (String(raw['状态'] || '').includes('完成') || String(raw['状态'] || '').includes('公开')) {
      topics.push(topic)
    }
  }

  console.log(`[topics.data] ${all.length} 个专题（公开 ${topics.length}）：${all.map((t) => t.name).join('、')}`)
  return { topics, byId, all }
}

export default defineLoader({
  watch: [new URL('../../../../../', import.meta.url).pathname],
  load: loadTopicsData
})
