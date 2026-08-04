/**
 * 读取知识卡.ts（由 scripts/读取知识卡.mjs 迁移，TS 化）
 * 扫描仓库各层目录，用 gray-matter 解析中文 YAML 头部，返回结构化数组。
 * 只负责"读取"，不做发布过滤与校验。
 */
import fg from 'fast-glob'
import matter from 'gray-matter'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RawCard } from './types'

/** 项目仓库根目录：本文件位于 website/docs/.vitepress/theme/data/_lib/ → 上溯 6 级 */
export const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url))

/** 正式知识层（知识卡）——「知识卡总计」只统计本组 */
export const KNOWLEDGE_DIRS = [
  { dir: '02-文献卡', slug: 'library', label: '文献库', keyField: '文献类型', prefix: '文献-' },
  { dir: '03-原文卡', slug: 'originals', label: '原文库', keyField: '所属文献', prefix: '原文-' },
  { dir: '04-概念卡', slug: 'concepts', label: '概念库', keyField: '概念类别', prefix: '概念-' },
  { dir: '05-主张卡', slug: 'claims', label: '主张库', keyField: '主张类型', prefix: '主张-' },
  { dir: '06-假说卡', slug: 'hypotheses', label: '假说库', keyField: '假说类型', prefix: '假说-' },
  { dir: '07-争议卡', slug: 'disputes', label: '争议库', keyField: '争议类型', prefix: '争议-' },
  { dir: '08-现代研究卡', slug: 'research', label: '现代研究库', keyField: '研究主题', prefix: '现代研究-' },
  { dir: '09-风险资料卡', slug: 'risks', label: '风险资料库', keyField: '风险类型', prefix: '风险资料-' },
  { dir: '14-当代传播资料卡', slug: 'contemporary', label: '当代传播资料库', keyField: '资料类型', prefix: '传播资料-' },
  { dir: '16-导引术资料卡', slug: 'daoyin', label: '导引术资料库', keyField: '名称', prefix: '导引术-' },
  { dir: '17-医学观察资料卡', slug: 'medical-observations', label: '医学观察资料库', keyField: '资料名称', prefix: '医学观察-' }
]

/** 用户入口层（入口节点，不作为原始证据） */
export const ENTRY_DIRS = [
  { dir: '18-问题地图', slug: 'questions', label: '问题库', keyField: '问题分类', prefix: '问题-' },
  { dir: '19-概念辨析', slug: 'discriminations', label: '概念辨析库', keyField: '概念甲', prefix: '辨析卡-' }
]

/** 知识卡目录中的非卡片文件 */
const EXCLUDE_FILES = ['README.md']

/** 读取全部记录（按层分组读取，合并返回） */
export async function readAllCards(): Promise<RawCard[]> {
  const cards: RawCard[] = []
  const groups = [
    ...KNOWLEDGE_DIRS.map((d) => ({ ...d, layer: 'knowledge' as const })),
    ...ENTRY_DIRS.map((d) => ({ ...d, layer: 'entry' as const }))
  ]
  for (const { dir, slug, label, layer, prefix } of groups) {
    const files = await fg([`${dir}/*.md`, `!${dir}/${EXCLUDE_FILES.join(`,!${dir}/`)}`], {
      cwd: REPO_ROOT, absolute: true, onlyFiles: true
    })
    for (const file of files) {
      const relPath = path.relative(REPO_ROOT, file).replace(/\\/g, '/')
      // gray-matter 直接传文件路径在本环境解析不出 frontmatter，须先读内容再传字符串
      const { data, content } = matter(readFileSync(file, 'utf8'))
      const id = String(data['编号'] ?? '未知编号')
      if (!id.startsWith(prefix)) {
        throw new Error(`目录—编号不一致：${relPath} 位于 ${dir}，编号「${id}」必须以「${prefix}」开头`)
      }
      cards.push({
        dir, slug, label, layer,
        file,
        relPath,
        yaml: data as Record<string, any>,
        body: content.trim(),
        slugOf: fileNameToSlug(file)
      })
    }
  }
  return cards
}

/** 卡文件名 → 站点页面名 */
function fileNameToSlug(file: string): string {
  return file.replace(/\\/g, '/').split('/').pop()!.replace(/\.md$/, '')
}

/**
 * 按「## N. 标题」切分知识卡正文，返回 [{num, title, lines}]
 * 统一行尾（CRLF→LF），防止 CRLF 卡失配导致章节静默丢失
 */
export function splitChapters(body: string): { num: number; title: string; lines: string[] }[] {
  const chapters: { num: number; title: string; lines: string[] }[] = []
  let current: { num: number; title: string; lines: string[] } | null = null
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(/^## (\d+)\.\s+(.+)$/)
    if (m) {
      current = { num: Number(m[1]), title: m[2], lines: [] }
      chapters.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return chapters
}

/** 值 → 展示文本：js-yaml 会把日期解析为 Date，需格式化为 YYYY-MM-DD */
export function displayValue(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return String(v ?? '').replace(/\n/g, ' ')
}

/** 按「## 中文序号标题」切分专题文档（结论摘要/安全边界等） */
export function splitSections(body: string): { num: string; title: string; lines: string[] }[] {
  const sections: { num: string; title: string; lines: string[] }[] = []
  let current: { num: string; title: string; lines: string[] } | null = null
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(/^##\s+([一二三四五六七八九十]+)、(.+)$/)
    if (m) {
      current = { num: m[1], title: m[2], lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return sections
}
