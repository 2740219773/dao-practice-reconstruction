/**
 * practice.data.ts —— 实践卡索引数据
 * 仓库 33-实践体系/实践卡 为唯一内容源；这里只读取 frontmatter。
 */
import { defineLoader } from 'vitepress'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { REPO_ROOT } from './_lib/读取知识卡.ts'

export interface PracticeIndexItem {
  id: string
  slug: string
  name: string
  summary: string
  sequence: number
  status: string
  riskLevel: string
  accessLevel: string
  url: string
}

export interface PracticeIndexData {
  items: PracticeIndexItem[]
}

declare const data: PracticeIndexData
export { data }

const PRACTICE_DIR = path.join(REPO_ROOT, '33-实践体系', '实践卡')

export function loadPracticeData(): PracticeIndexData {
  if (!existsSync(PRACTICE_DIR)) return { items: [] }

  const items = readdirSync(PRACTICE_DIR)
    .filter((f) => /^PRAC-\d+-.+\.md$/u.test(f))
    .map((file) => {
      const parsed = matter(readFileSync(path.join(PRACTICE_DIR, file), 'utf8').replace(/^\uFEFF/, ''))
      const y = parsed.data || {}
      return {
        id: String(y.id || ''),
        slug: String(y.slug || ''),
        name: String(y.name || ''),
        summary: String(y.summary || ''),
        sequence: Number(y.sequence || 0),
        status: String(y.status || ''),
        riskLevel: String(y.risk_level || ''),
        accessLevel: String(y.access_level || ''),
        url: `/practice/card/${encodeURIComponent(String(y.slug || ''))}`
      }
    })
    .sort((a, b) => a.sequence - b.sequence)

  const ids = new Set<string>()
  const slugs = new Set<string>()
  for (const item of items) {
    if (!item.id || !item.slug || !item.name || !item.summary) throw new Error('实践搜索数据存在缺失字段')
    if (ids.has(item.id)) throw new Error(`实践搜索数据 ID 重复：${item.id}`)
    if (slugs.has(item.slug)) throw new Error(`实践搜索数据 slug 重复：${item.slug}`)
    ids.add(item.id)
    slugs.add(item.slug)
  }

  return { items }
}

export default defineLoader({ load: loadPracticeData })
