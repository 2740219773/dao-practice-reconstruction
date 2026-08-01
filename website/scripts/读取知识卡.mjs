/**
 * 读取知识卡.mjs
 * 扫描仓库知识卡目录（02-文献卡 等），用 gray-matter 解析中文 YAML 头部，
 * 返回所有知识卡的结构化数组。只负责"读取"，不做发布过滤与校验。
 *
 * 数据流向：读取知识卡 → 校验公开字段 → 生成网站页面
 */
import fg from 'fast-glob'
import matter from 'gray-matter'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 知识卡目录与对应站点栏目（未来扩展类型时在此追加） */
export const CARD_DIRS = [
  { dir: '02-文献卡', slug: 'library', label: '文献库', keyField: '文献类型' },
  { dir: '03-原文卡', slug: 'originals', label: '原文库', keyField: '所属文献' },
  { dir: '04-概念卡', slug: 'concepts', label: '概念库', keyField: '概念类别' }
]

/** 项目仓库根目录（相对本文件：website/scripts/ → 上两级） */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * 读取全部知识卡
 * @returns {Array<{dir:string, slug:string, label:string, file:string, relPath:string, yaml:object, body:string, slugOf:string}>}
 */
export async function readAllCards() {
  const cards = []
  for (const { dir, slug, label } of CARD_DIRS) {
    const files = await fg(`${dir}/*.md`, { cwd: REPO_ROOT, absolute: true, onlyFiles: true })
    for (const file of files) {
      const relPath = path.relative(REPO_ROOT, file).replace(/\\/g, '/')
      // 注意：gray-matter 直接传文件路径在本环境解析不出 frontmatter，须先读内容再传字符串
      const { data, content } = matter(readFileSync(file, 'utf8'))
      const id = String(data['编号'] ?? '未知编号')
      cards.push({
        dir, slug, label,
        file,
        relPath,
        yaml: data,
        body: content.trim(),
        slugOf: fileNameToSlug(file)
      })
      if (!id.startsWith('文献-') && !id.startsWith('原文-') && !id.startsWith('概念-')) {
        console.warn(`  [警告] ${relPath}：编号「${id}」与所在目录 ${dir} 不符，仍按目录类型处理`)
      }
    }
  }
  return cards
}

/** 卡文件名（如 文献-0001-道德经.md）→ 站点页面名（如 文献-0001-道德经） */
function fileNameToSlug(file) {
  return file.replace(/\\/g, '/').split('/').pop().replace(/\.md$/, '')
}

/**
 * 按「## N. 标题」切分知识卡正文，返回 [{num, title, lines}]
 * 先统一行尾（CRLF→LF）：JS 正则 `.` 不匹配 \r，CRLF 卡会失配导致章节静默丢失
 */
export function splitChapters(body) {
  const chapters = []
  let current = null
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
