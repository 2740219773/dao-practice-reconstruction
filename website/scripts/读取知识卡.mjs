/**
 * 读取知识卡.mjs
 * 扫描仓库各层目录（正式知识/用户入口/采集观察/治理），用 gray-matter 解析中文 YAML 头部，
 * 返回结构化数组。只负责"读取"，不做发布过滤与校验。
 *
 * 数据流向：读取 → 校验公开字段 → 生成网站页面
 *
 * 六层结构（《项目结构总图 V0.1》）：
 *  正式知识层 KNOWLEDGE_DIRS  —— 知识卡（计入"知识卡总计"）
 *  用户入口层 ENTRY_DIRS       —— 入口节点（单独统计）
 *  采集观察层 OBSERVATION_DIRS —— 观察材料（单独统计）
 *  治理审校层 GOVERNANCE_DIRS  —— 治理记录（单独统计，不公开）
 *  专题综合层/展示层 不在此扫描
 */
import fg from 'fast-glob'
import matter from 'gray-matter'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 正式知识层（知识卡）——网站「知识卡总计」只统计本组 */
export const KNOWLEDGE_DIRS = [
  { dir: '02-文献卡', slug: 'library', label: '文献库', keyField: '文献类型' },
  { dir: '03-原文卡', slug: 'originals', label: '原文库', keyField: '所属文献' },
  { dir: '04-概念卡', slug: 'concepts', label: '概念库', keyField: '概念类别' },
  { dir: '05-主张卡', slug: 'claims', label: '主张库', keyField: '主张类型' },
  { dir: '06-假说卡', slug: 'hypotheses', label: '假说库', keyField: '假说类型' },
  { dir: '07-争议卡', slug: 'disputes', label: '争议库', keyField: '争议类型' },
  { dir: '08-现代研究卡', slug: 'research', label: '现代研究库', keyField: '研究主题' },
  { dir: '09-风险资料卡', slug: 'risks', label: '风险资料库', keyField: '风险类型' },
  { dir: '14-当代传播资料卡', slug: 'contemporary', label: '当代传播资料库', keyField: '资料类型' },
  { dir: '16-导引术资料卡', slug: 'daoyin', label: '导引术资料库', keyField: '名称' },
  { dir: '17-医学观察资料卡', slug: 'medical-observations', label: '医学观察资料库', keyField: '资料名称' }
]

/** 用户入口层（入口节点，不作为原始证据） */
export const ENTRY_DIRS = [
  { dir: '18-问题地图', slug: 'questions', label: '问题库', keyField: '问题分类' },
  { dir: '19-概念辨析', slug: 'discriminations', label: '概念辨析库', keyField: '概念甲' }
]

/** 采集观察层（输入数据与需求样本，不作为权威答案） */
export const OBSERVATION_DIRS = [
  { dir: '20-社区观察', slug: 'community-observations', label: '社区观察库', keyField: '来源平台' }
]

/** 治理审校层（决策/审校留痕，不公开、不计入知识卡） */
export const GOVERNANCE_DIRS = [
  { dir: '10-项目决策', slug: 'decisions', label: '决策库', keyField: '决策类型' },
  { dir: '21-人工智能审校', slug: 'ai-reviews', label: 'AI审校库', keyField: '内容名称' }
]

/** 兼容别名：全部层合并（供需要全量扫描的调用方使用） */
export const ALL_DIRS = [...KNOWLEDGE_DIRS, ...ENTRY_DIRS, ...OBSERVATION_DIRS, ...GOVERNANCE_DIRS]

/** 向后兼容：旧名 CARD_DIRS = 正式知识层（统计口径按《项目结构总图》） */
export const CARD_DIRS = KNOWLEDGE_DIRS

/** 知识卡目录中的非卡片文件（如目录 README），扫描时排除 */
const EXCLUDE_FILES = ['README.md']

/** 项目仓库根目录（相对本文件：website/scripts/ → 上两级） */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * 读取全部记录（按层分组读取，合并返回）
 * @returns {Array<{dir:string, slug:string, label:string, layer:string, file:string, relPath:string, yaml:object, body:string, slugOf:string}>}
 */
export async function readAllCards() {
  const cards = []
  const groups = [
    ...KNOWLEDGE_DIRS.map((d) => ({ ...d, layer: 'knowledge' })),
    ...ENTRY_DIRS.map((d) => ({ ...d, layer: 'entry' })),
    ...OBSERVATION_DIRS.map((d) => ({ ...d, layer: 'observation' })),
    ...GOVERNANCE_DIRS.map((d) => ({ ...d, layer: 'governance' }))
  ]
  for (const { dir, slug, label, layer } of groups) {
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
        dir, slug, label, layer,
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
