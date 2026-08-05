/**
 * 专题公开数据 loader。
 * manifest.yml 是研究源，public.yml 是网站展示契约；两者不互相覆盖。
 */
import { defineLoader } from 'vitepress'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { REPO_ROOT, displayValue, splitSections } from './_lib/读取知识卡.ts'
import type { Topic } from './_lib/types.ts'

const PUBLIC_STATUSES = new Set(['已完成', '研究中', '待开始', '暂不公开'])
const KIND_MAP: Record<string, Topic['kind']> = {
  概念型: 'concept', 概念与思想: 'concept',
  导引术: 'daoyin', '导引术与身体训练': 'daoyin',
  医学观察: 'medical-observation', '医学观察与身体经验': 'medical-observation'
}
const NARRATIVE_KEYS: Record<string, keyof Topic['narrative']> = {
  '这个概念是什么': 'what', '它不是什么': 'notWhat',
  '当前可以确认什么': 'confirm', '当前不能确认什么': 'unknown',
  '主要争议': 'disputes', '安全边界': 'safety'
}

function parseNarrative(filePath: string): Partial<Topic['narrative']> {
  if (!existsSync(filePath)) return {}
  const out: Partial<Topic['narrative']> = {}
  for (const section of splitSections(readFileSync(filePath, 'utf8'))) {
    const key = NARRATIVE_KEYS[section.title]
    if (key) out[key] = section.lines.join('\n').trim()
  }
  return out
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  return value ? String(value).split(/[,，、]/).map((item) => item.trim()).filter(Boolean) : []
}

function boolValue(value: unknown): boolean {
  return value === true || value === 'true' || value === '是'
}

function plainText(value: unknown, limit = 180): string {
  return displayValue(value)
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
}

function topicFromDirectory(entryName: string, manifest: Record<string, any>, publicData: Record<string, any>, narrative: Partial<Topic['narrative']>): Topic {
  const id = String(publicData['专题编号'] || manifest['专题编号'] || '')
  const name = String(publicData['专题名称'] || manifest['专题名称'] || entryName.replace(/^.*?-/, ''))
  const slug = String(publicData['站点路径'] || '')
  const publicStatus = String(publicData['公开状态'] || '暂不公开') as Topic['publicStatus']
  const detailVisible = boolValue(publicData['详情可见'])
  const searchVisible = boolValue(publicData['搜索可见'])
  const listed = boolValue(publicData['列表可见'])
  const coreIds = {
    原文: listValue(manifest['核心原文']), 概念: listValue(manifest['核心概念']),
    主张: listValue(manifest['核心主张']), 争议: listValue(manifest['核心争议']),
    研究: listValue(manifest['固定现代研究'] || manifest['现代研究范围']),
    风险: listValue(manifest['风险资料'])
  }
  const title = plainText(publicData['标题'] || `“${name}”专题`)
  return {
    id, slug, name,
    module: String(publicData['模块'] || manifest['模块'] || ''),
    kind: KIND_MAP[String(publicData['专题类型'] || manifest['专题类型'] || '概念型')] || 'concept',
    stage: String(manifest['当前阶段'] || ''), publicStatus, listed, detailVisible, searchVisible,
    order: Number(publicData['排序'] || 999), title,
    summary: plainText(publicData['一句话理解'] || narrative.what),
    scopeSummary: plainText(publicData['研究范围摘要']),
    statusSummary: plainText(publicData['当前状态摘要']),
    boundarySummary: plainText(publicData['主要边界']),
    conclusionRange: plainText(publicData['结论编号范围']),
    verificationSummary: plainText(publicData['版本核对摘要']),
    safetyHighlight: plainText(publicData['专题专属安全提示']),
    homepageVisible: boolValue(publicData['首页展示']),
    homepageStatus: plainText(publicData['首页状态文字']),
    coreQuestions: Array.isArray(manifest['核心问题'])
      ? manifest['核心问题'].map((q: any) => ({ id: displayValue(q.id), question: displayValue(q.question) })) : [],
    coreIds,
    narrative: {
      what: narrative.what || '', notWhat: narrative.notWhat || '', confirm: narrative.confirm || '',
      unknown: narrative.unknown || '', disputes: narrative.disputes || '', safety: narrative.safety || ''
    },
    url: slug ? `/topics/${slug}` : ''
  }
}

function validateTopics(topics: Topic[]) {
  const ids = new Set<string>()
  const slugs = new Set<string>()
  for (const topic of topics) {
    if (!topic.id) throw new Error('专题缺少专题编号')
    if (ids.has(topic.id)) throw new Error(`专题编号重复：${topic.id}`)
    ids.add(topic.id)
    if (!PUBLIC_STATUSES.has(topic.publicStatus)) throw new Error(`专题 ${topic.id} 的公开状态非法：${topic.publicStatus}`)
    if (topic.listed && (!topic.slug || !topic.title || !topic.summary)) throw new Error(`公开专题 ${topic.id} 缺少 slug、标题或一句话理解`)
    if (topic.slug) {
      if (slugs.has(topic.slug)) throw new Error(`专题 slug 重复：${topic.slug}`)
      slugs.add(topic.slug)
    }
    if (topic.searchVisible && !topic.detailVisible) throw new Error(`专题 ${topic.id} 的搜索可见必须同时详情可见`)
    if (topic.detailVisible) {
      const page = path.join(REPO_ROOT, 'website', 'docs', 'topics', `${topic.slug}.md`)
      if (!existsSync(page)) throw new Error(`专题 ${topic.id} 详情可见但缺少页面：${page}`)
    }
  }
}

export interface TopicsData {
  topics: Topic[]
  all: Topic[]
  listedTopics: Topic[]
  detailTopics: Topic[]
  searchableTopics: Topic[]
  byId: Record<string, Topic>
  bySlug: Record<string, Topic>
}

declare const data: TopicsData
export { data }

export async function loadTopicsData(): Promise<TopicsData> {
  const base = path.join(REPO_ROOT, '11-专题研究')
  const all: Topic[] = []
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(base, entry.name)
      const manifestPath = path.join(dir, 'manifest.yml')
      const publicPath = path.join(dir, 'public.yml')
      if (!existsSync(manifestPath) && !existsSync(publicPath)) continue
      const manifest = existsSync(manifestPath) ? yaml.load(readFileSync(manifestPath, 'utf8')) as Record<string, any> : {}
      if (existsSync(manifestPath) && !existsSync(publicPath) && /完成|公开/.test(String(manifest['状态'] || ''))) {
        throw new Error(`公开专题缺少 public.yml：${entry.name}`)
      }
      const publicData = existsSync(publicPath) ? yaml.load(readFileSync(publicPath, 'utf8')) as Record<string, any> : {}
      const name = String(publicData['专题名称'] || manifest['专题名称'] || entry.name)
      const narrative = parseNarrative(path.join(dir, `${name}专题结论摘要.md`))
      all.push(topicFromDirectory(entry.name, manifest, publicData, narrative))
    }
  }
  validateTopics(all)
  const byId: Record<string, Topic> = {}
  const bySlug: Record<string, Topic> = {}
  for (const topic of all) { byId[topic.id] = topic; if (topic.slug) bySlug[topic.slug] = topic }
  const listedTopics = all.filter((topic) => topic.listed).sort((a, b) => a.order - b.order)
  const detailTopics = listedTopics.filter((topic) => topic.detailVisible)
  const searchableTopics = detailTopics.filter((topic) => topic.searchVisible)
  console.log(`[topics.data] ${all.length} 个专题（列表 ${listedTopics.length}，详情 ${detailTopics.length}，搜索 ${searchableTopics.length}）`)
  return { topics: detailTopics, all, listedTopics, detailTopics, searchableTopics, byId, bySlug }
}

export default defineLoader({
  watch: [new URL('../../../../../', import.meta.url).pathname],
  load: loadTopicsData
})
