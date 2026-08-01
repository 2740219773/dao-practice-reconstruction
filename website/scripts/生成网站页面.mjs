/**
 * 生成网站页面.mjs —— 网站构建前置步骤（决策-0004 发布机制）
 *
 * 流程：扫描仓库知识卡 → 读取中文 YAML → 校验公开字段 → 按发布状态过滤
 *       → 生成索引页与详情页 →（随后）VitePress 构建
 *
 * 生成规则：
 *  - 只接受「可公开草稿」「正式公开」；其余状态（不公开／内部预览／已撤回／缺少字段）一律不生成页面；
 *  - 公开字段校验失败（非法状态值、可公开卡缺公开摘要/注意事项）→ 终止构建；
 *  - 生成物（docs/library|originals|concepts/ 下由本脚本写出的文件）视为构建产物，
 *    已加入 .gitignore；知识卡原件与 Git 历史始终是源头。
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readAllCards, REPO_ROOT } from './读取知识卡.mjs'
import { validateAllCards, PUBLISHABLE } from './校验公开字段.mjs'

/** 输出目录：website/docs/{slug} */
const DOCS_DIR = path.join(REPO_ROOT, 'website', 'docs')

/** 文献库索引按「资料性质」分组（其他取值归入"其他"） */
const LIBRARY_GROUPS = [
  { key: '原始文献', label: '原始文献（L1）' },
  { key: '历代注释', label: '历代注释（L2）' },
  { key: '近现代传承文献', label: '近现代传承与实践解释（L3）' },
  { key: '现代学术研究', label: '现代学术研究（L4）' }
]

/**
 * 各类型详情页章节白名单（只输出白名单内章节，防止内部审计内容外泄）：
 *  - include：正常输出；collapse：折叠输出（<details>）
 * 知识卡章节号 → 站点章节标题（用户审查意见确定的三类样板页结构）
 */
const ALLOWLISTS = {
  library: {
    label: '文献页',
    include: { 2: '文献简介', 3: '成书与作者', 4: '使用版本', 7: '研究范围', 9: '关键原文索引', 12: '不能直接得出的结论', 13: '未解决问题' },
    collapse: { 15: '修改记录' }
  },
  originals: {
    label: '原文页',
    include: { 1: '原文出处', 2: '原文', 4: '逐词说明', 6: '直译', 8: '历代注释', 9: '可能解释', 10: '待检索现代方向', 11: '不能直接推出的结论', 12: '关联概念', 13: '关联原文' },
    collapse: {}
  },
  concepts: {
    label: '概念页',
    include: { 1: '概念说明', 4: '不同文献中的含义', 5: '不同时期的变化', 7: '当前暂定分类', 12: '常见误解', 16: '能确认与不能确认', 18: '关联', 13: '开放争议' },
    collapse: {}
  }
}

/** 各类型详情页状态区字段（键 → 显示名，YAML 中存在才显示） */
const META_FIELDS = {
  library: [
    ['编号', '编号'], ['其他名称', '其他名称'], ['传统署名', '传统署名'], ['实际作者', '实际作者'],
    ['大致年代', '大致年代'], ['文献类型', '文献类型'], ['资料性质', '资料性质'],
    ['使用版本', '使用版本'], ['文献可靠等级', '文献可靠等级'],
    ['最低解释层级', '最低解释层级'], ['最高推论层级', '最高推论层级'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级']
  ],
  originals: [
    ['编号', '编号'], ['所属文献', '所属文献'], ['章节', '章节'], ['卷次', '卷次'],
    ['使用版本', '使用版本'], ['页码状态', '页码状态'], ['引文核对状态', '引文核对状态'],
    ['文献可靠等级', '文献可靠等级'], ['最高推论层级', '最高推论层级'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级']
  ],
  concepts: [
    ['编号', '编号'], ['概念类别', '概念类别'], ['主要时期', '主要时期'],
    ['涉及传统', '涉及传统'], ['涉及流派', '涉及流派'], ['当前定义状态', '当前定义状态'],
    ['文献可靠等级', '文献可靠等级'], ['最高推论层级', '最高推论层级'],
    ['现代证据等级', '现代证据等级'], ['对应强度', '对应强度'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级']
  ]
}

/** 按「## N. 标题」切分知识卡正文 */
function splitChapters(body) {
  const chapters = []
  let current = null
  for (const line of body.split('\n')) {
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

/** 详情页顶部状态警示条 */
function statusBanner(card, status) {
  const y = card.yaml
  const isDraft = status === '可公开草稿'
  let s = `::: ${isDraft ? 'warning' : 'tip'} **${status}**\n\n`
  if (isDraft) {
    s += '本页为项目工作草稿：内容已经人工整理，但尚未完成逐字核对与最终审核；正式公开前将逐项复核。'
  } else {
    s += '本页内容已通过项目审核，正式公开。'
  }
  if (card.slug === 'originals') {
    s += '\n\n- 引文核对状态：' + (y['引文核对状态'] || '未知')
    if (y['页码状态'] && y['页码状态'] !== '已核对') s += '\n- 页码状态：' + y['页码状态']
    s += '\n- 最高推论层级：' + (y['最高推论层级'] || '未知')
  }
  return s + '\n:::\n'
}

/** 文献资料性质 → 知识七层分层（决策-0002）映射，用于文献页 L1-L4 标记 */
const LEVEL_MAP = {
  '原始文献': 'L1',
  '历代注释': 'L2',
  '近现代传承文献': 'L3',
  '现代学术研究': 'L4'
}

/** 详情页元信息表 */
function metaTable(card) {
  const y = card.yaml
  const rows = META_FIELDS[card.slug]
    .map(([key, label]) => (y[key] ? `| ${label} | ${String(y[key]).replace(/\n/g, ' ') } |` : null))
    .filter(Boolean)
  if (card.slug === 'library' && y['资料性质']) {
    const level = LEVEL_MAP[y['资料性质']] || '其他'
    rows.unshift(`| 知识层级 | ${level}（${y['资料性质']}） |`)
  }
  return '| 字段 | 内容 |\n| ---- | ---- |\n' + rows.join('\n')
}

/** 详情页正文章节（白名单过滤 + 修改记录折叠） */
function bodyChapters(card) {
  const allow = ALLOWLISTS[card.slug]
  const out = []
  for (const ch of splitChapters(card.body)) {
    if (allow.include[ch.num]) {
      out.push(`## ${allow.include[ch.num]}\n\n${ch.lines.join('\n').trim()}`)
    } else if (allow.collapse[ch.num]) {
      out.push(`<details>\n<summary>${allow.collapse[ch.num]}（折叠）</summary>\n\n${ch.lines.join('\n').trim()}\n\n</details>`)
    }
  }
  return out.join('\n\n---\n\n')
}

/** 生成单张详情页 */
function renderDetail(card, status) {
  const y = card.yaml
  const parts = []
  parts.push('---')
  parts.push(`title: ${y['标题'] || card.slugOf}`)
  parts.push('---')
  parts.push(`<!-- 本页由 website/scripts/生成网站页面.mjs 自动生成，请勿手工修改；源文件：${card.relPath} -->`)
  parts.push('')
  parts.push(`# ${y['标题'] || card.slugOf}`)
  parts.push('')
  parts.push(statusBanner(card, status))
  parts.push(metaTable(card))
  parts.push('')
  parts.push('## 公开摘要')
  parts.push('')
  parts.push(y['公开摘要'] || '（待补录）')
  parts.push('')
  parts.push('::: info 公开注意事项')
  parts.push((y['公开注意事项'] || '').replace(/^:::\s*$/, '').trim())
  parts.push(':::')
  const body = bodyChapters(card)
  if (body) {
    parts.push('')
    parts.push(body)
  }
  parts.push('')
  parts.push(`> 来源：[${card.relPath}](https://github.com/2740219773/dao-practice-reconstruction/blob/main/${card.relPath.split('/').map(encodeURIComponent).join('/')})（项目仓库，持续修订中）`)
  return parts.join('\n') + '\n'
}

/** 生成索引页 */
function renderIndex(slug, cards) {
  const title = { library: '文献库', originals: '原文库', concepts: '概念库' }[slug]
  const parts = []
  parts.push('---')
  parts.push(`title: ${title}`)
  parts.push('---')
  parts.push(`# ${title}`)
  parts.push('')
  parts.push('> 本站只展示经过选择并公开的内容（发布状态为「可公开草稿」或「正式公开」）。未审核、内部预览、已撤回或缺少发布字段的卡片不生成页面；知识卡原件与修订历史完整保留在[项目仓库](https://github.com/2740219773/dao-practice-reconstruction)。')
  parts.push('')
  if (slug === 'library') {
    const byGroup = new Map(LIBRARY_GROUPS.map((g) => [g.key, []]))
    const others = []
    for (const c of cards) byGroup.get(c.yaml['资料性质']) ? byGroup.get(c.yaml['资料性质']).push(c) : others.push(c)
    for (const g of LIBRARY_GROUPS) {
      const list = byGroup.get(g.key)
      if (!list || list.length === 0) continue
      parts.push(`## ${g.label}`)
      parts.push('')
      parts.push(rows(slug, list))
      parts.push('')
    }
    if (others.length) {
      parts.push('## 其他')
      parts.push('')
      parts.push(rows(slug, others))
      parts.push('')
    }
  } else {
    parts.push(rows(slug, cards))
  }
  if (cards.length === 0) {
    parts.push('> 暂无公开内容。知识卡正在整理与核对中，通过审核的内容将按批次上线。')
  }
  parts.push('')
  parts.push(`<!-- 本页由 website/scripts/生成网站页面.mjs 自动生成，请勿手工修改 -->`)
  return parts.join('\n') + '\n'
}

/** 索引表格行 */
function rows(slug, cards) {
  const head = {
    library: ['编号', '文献', '发布状态'],
    originals: ['编号', '标题', '引文核对', '发布状态'],
    concepts: ['编号', '概念', '发布状态']
  }[slug]
  const line = (c) => {
    const y = c.yaml
    const link = `[${y['标题'] || c.slugOf}](./${c.slugOf})`
    if (slug === 'originals') {
      return `| ${y['编号']} | ${link} | ${y['引文核对状态'] || '未知'} | ${y['网站发布状态']} |`
    }
    return `| ${y['编号']} | ${link} | ${y['网站发布状态']} |`
  }
  return `| ${head.join(' | ')} |\n| ${head.map(() => '----').join(' | ')} |\n` + cards.map(line).join('\n')
}

async function main() {
  console.log('[生成] 步骤 1/3：扫描知识卡…')
  const cards = await readAllCards()
  console.log(`[生成] 扫描到 ${cards.length} 张卡（文献/原文/概念）`)

  console.log('[生成] 步骤 2/3：校验公开字段…')
  const publishable = validateAllCards(cards)
  const statusCount = {}
  for (const c of cards) {
    const s = c.yaml['网站发布状态'] || '（缺失，按不公开）'
    statusCount[s] = (statusCount[s] || 0) + 1
  }
  console.log('[生成] 发布状态分布：' + Object.entries(statusCount).map(([k, v]) => `${k} ${v}`).join('，'))
  console.log(`[生成] 可公开 ${publishable.length} 张（${PUBLISHABLE.join('／')}）`)

  console.log('[生成] 步骤 3/3：清理旧生成页并生成索引页与详情页…')
  for (const slug of ['library', 'originals', 'concepts']) {
    // 先清空旧生成详情页（撤回/取消公开的卡必须从网站消失），index.md 随后整体重写
    const dir = path.join(DOCS_DIR, slug)
    mkdirSync(dir, { recursive: true })
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.md') && f !== 'index.md') rmSync(path.join(dir, f))
    }
    const list = publishable.filter((c) => c.slug === slug)
    const indexFile = path.join(DOCS_DIR, slug, 'index.md')
    mkdirSync(path.dirname(indexFile), { recursive: true })
    writeFileSync(indexFile, renderIndex(slug, list), 'utf8')
    for (const card of list) {
      const detailFile = path.join(DOCS_DIR, slug, `${card.slugOf}.md`)
      writeFileSync(detailFile, renderDetail(card, card.yaml['网站发布状态']), 'utf8')
      console.log(`  ✓ 生成 ${card.slugOf}.md（${card.yaml['网站发布状态']}）`)
    }
    console.log(`  ✓ ${slug}/index.md（${list.length} 张公开卡）`)
  }
  console.log('[生成] 完成。')
}

main().catch((err) => {
  console.error('[生成失败] ' + err.message)
  process.exit(1)
})
