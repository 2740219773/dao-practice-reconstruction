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

/** 知识卡目录与对应站点栏目（生成页面只处理 library/originals/concepts；其余类型仅参与统计） */
export const CARD_DIRS = [
  { dir: '02-文献卡', slug: 'library', label: '文献库', keyField: '文献类型' },
  { dir: '03-原文卡', slug: 'originals', label: '原文库', keyField: '所属文献' },
  { dir: '04-概念卡', slug: 'concepts', label: '概念库', keyField: '概念类别' },
  { dir: '05-主张卡', slug: 'claims', label: '主张库', keyField: '主张类型' },
  { dir: '06-假说卡', slug: 'hypotheses', label: '假说库', keyField: '假说类型' },
  { dir: '07-争议卡', slug: 'disputes', label: '争议库', keyField: '争议类型' },
  { dir: '08-现代研究卡', slug: 'research', label: '现代研究库', keyField: '研究主题' },
  { dir: '09-风险资料卡', slug: 'risks', label: '风险资料库', keyField: '风险类型' },
  { dir: '10-项目决策', slug: 'decisions', label: '决策库', keyField: '决策类型' },
  { dir: '14-当代传播资料卡', slug: 'contemporary', label: '当代传播资料库', keyField: '资料类型' },
  { dir: '16-导引术资料卡', slug: 'daoyin', label: '导引术资料库', keyField: '名称' },
  { dir: '17-医学观察资料卡', slug: 'medical-observations', label: '医学观察资料库', keyField: '资料名称' },
  { dir: '18-问题地图', slug: 'questions', label: '问题库', keyField: '问题分类' },
  { dir: '19-概念辨析', slug: 'discriminations', label: '概念辨析库', keyField: '概念甲' },
  { dir: '20-社区观察', slug: 'community-observations', label: '社区观察库', keyField: '来源平台' },
  { dir: '21-人工智能审校', slug: 'ai-reviews', label: 'AI审校库', keyField: '内容名称' }
]

/** 知识卡目录中的非卡片文件（如目录 README），扫描时排除 */
const EXCLUDE_FILES = ['README.md']

/** 项目仓库根目录（相对本文件：website/scripts/ → 上两级） */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * 读取全部知识卡
 * @returns {Array<{dir:string, slug:string, label:string, file:string, relPath:string, yaml:object, body:string, slugOf:string}>}
 */
export async function readAllCards() {
  const cards = []
  for (const { dir, slug, label } of CARD_DIRS) {
    // 排除目录内的非卡片说明文件（如 README.md）
    const files = await fg([`${dir}/*.md`, `!${dir}/${EXCLUDE_FILES.join(`,!${dir}/`)}`], {
      cwd: REPO_ROOT, absolute: true, onlyFiles: true
    })
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
      const PREFIX_OK = ['文献-', '原文-', '概念-', '主张-', '假说-', '争议-', '现代研究-', '风险资料-', '决策-', '传播资料-', '导引术-', '医学观察-', '问题-', '辨析卡-', '观察记录-', '审校记录-']
      if (!PREFIX_OK.some((p) => id.startsWith(p))) {
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
