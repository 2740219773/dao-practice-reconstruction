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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import yaml from 'js-yaml'
import { readAllCards, REPO_ROOT, splitChapters } from './读取知识卡.mjs'
import { validateAllCards, PUBLISHABLE, ALLOWLISTS } from './校验公开字段.mjs'

/** 输出目录：website/docs/{slug} */
const DOCS_DIR = path.join(REPO_ROOT, 'website', 'docs')

/** 统计显示顺序与名称（与 读取知识卡.mjs 的 CARD_DIRS 对应） */
const STAT_ORDER = ['library', 'originals', 'concepts', 'claims', 'hypotheses', 'disputes', 'research', 'risks', 'decisions', 'contemporary', 'daoyin', 'medical-observations', 'questions', 'discriminations', 'community-observations', 'ai-reviews']
const TYPE_LABELS = {
  library: '文献卡', originals: '原文卡', concepts: '概念卡', claims: '主张卡',
  hypotheses: '假说卡', disputes: '争议卡', research: '现代研究卡',
  risks: '风险资料卡', decisions: '决策卡', contemporary: '当代传播资料卡',
  daoyin: '导引术资料卡', 'medical-observations': '医学观察资料卡',
  questions: '问题卡', discriminations: '辨析卡',
  'community-observations': '社区观察卡', 'ai-reviews': 'AI审校记录卡'
}

/** 文献库索引按「资料性质」分组（其他取值归入"其他"） */
const LIBRARY_GROUPS = [
  { key: '原始文献', label: '原始文献（L1）' },
  { key: '历代注释', label: '历代注释（L2）' },
  { key: '近现代传承文献', label: '近现代传承与实践解释（L3）' },
  { key: '现代学术研究', label: '现代学术研究（L4）' }
]

/**
 * 各类型详情页章节白名单定义在 校验公开字段.mjs（ALLOWLISTS）：
 *  - include：正常输出；collapse：折叠输出（<details>）
 * 可公开卡缺失 include 章节会由校验阶段终止构建
 */

/** 各类型详情页状态区字段（键 → 显示名，YAML 中存在才显示） */
const META_FIELDS = {
  library: [
    ['编号', '编号'], ['其他名称', '其他名称'], ['传统署名', '传统署名'], ['实际作者', '实际作者'],
    ['大致年代', '大致年代'], ['文献类型', '文献类型'], ['资料性质', '资料性质'],
    ['使用版本', '使用版本'], ['文献可靠等级', '文献可靠等级'],
    ['最低解释层级', '最低解释层级'], ['最高推论层级', '最高推论层级'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级'],
    ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  originals: [
    ['编号', '编号'], ['所属文献', '所属文献'], ['章节', '章节'], ['卷次', '卷次'],
    ['使用版本', '使用版本'], ['页码状态', '页码状态'], ['网络文本核对状态', '网络文本核对状态'],
    ['指定底本核对状态', '指定底本核对状态'],
    ['文献可靠等级', '文献可靠等级'], ['最高推论层级', '最高推论层级'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级'],
    ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  concepts: [
    ['编号', '编号'], ['概念类别', '概念类别'], ['主要时期', '主要时期'],
    ['涉及传统', '涉及传统'], ['涉及流派', '涉及流派'], ['当前定义状态', '当前定义状态'],
    ['文献可靠等级', '文献可靠等级'], ['最高推论层级', '最高推论层级'],
    ['现代证据等级', '现代证据等级'], ['对应强度', '对应强度'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级'],
    ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  // 预留（决策：三类独立模块）：导引术与医学观察页面类型，待对应模块有公开内容后启用生成
  daoyin: [
    ['编号', '编号'], ['名称', '名称'], ['其他名称', '其他名称'], ['资料类型', '资料类型'],
    ['历史时期', '历史时期'], ['最早可核来源', '最早可核来源'], ['当前采用版本', '当前采用版本'],
    ['版本制定机构', '版本制定机构'], ['动作数量', '动作数量'], ['所含实践最高风险', '所含实践最高风险'],
    ['卡片发布风险', '卡片发布风险'], ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  'medical-observations': [
    ['编号', '编号'], ['资料名称', '资料名称'], ['作者或讲述者', '作者或讲述者'],
    ['出版或记录年代', '出版或记录年代'], ['资料类型', '资料类型'], ['观察方式', '观察方式'],
    ['可验证程度', '可验证程度'], ['所含实践最高风险', '所含实践最高风险'],
    ['卡片发布风险', '卡片发布风险'], ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ]
}

/** 详情页顶部状态警示条 */
function statusBanner(card, status) {
  const y = card.yaml
  const isDraft = status === '可公开草稿'
  let s = `::: ${isDraft ? 'warning' : 'tip'} **${status}**\n\n`
  if (isDraft) {
    // 原文卡网络文本已核对时如实反映（网络文本核对状态取自知识卡 YAML；指定底本待实物复核）
    if (card.slug === 'originals' && y['网络文本核对状态'] === '已逐字核对') {
      s += '本页为项目工作草稿：正文已与网络文本（王弼本传本系统）及帛书释文逐字核对，指定底本（楼宇烈校释本）待实物复核；正式公开前将逐项复核。'
    } else {
      s += '本页为项目工作草稿：内容已经人工整理，但尚未完成逐字核对与最终审核；正式公开前将逐项复核。'
    }
  } else {
    s += '本页内容已通过项目审核，正式公开。'
  }
  if (card.slug === 'originals') {
    s += '\n\n- 引文核对状态：' + citationSummary(y)
    if (y['指定底本核对状态'] && y['指定底本核对状态'] !== '已复核') s += '\n- 指定底本核对状态：' + y['指定底本核对状态']
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

/** 值 → 展示文本：js-yaml 会把 2026-08-01 解析为 Date，需格式化为 YYYY-MM-DD */
function displayValue(v) {
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return String(v).replace(/\n/g, ' ')
}

/** 详情页元信息表 */
function metaTable(card) {
  const y = card.yaml
  const rows = META_FIELDS[card.slug]
    .map(([key, label]) => (y[key] ? `| ${label} | ${displayValue(y[key])} |` : null))
    .filter(Boolean)
  if (card.slug === 'library' && y['资料性质']) {
    const level = LEVEL_MAP[y['资料性质']] || '其他'
    rows.unshift(`| 知识层级 | ${level}（${y['资料性质']}） |`)
  }
  return '| 字段 | 内容 |\n| ---- | ---- |\n' + rows.join('\n')
}

/** 章节号 → 区块容器名（未列出的章节普通输出；容器语法见 config.ts markdownConfig） */
const CHAPTER_BLOCKS = {
  library: { 12: 'conclusion' },
  originals: { 2: 'original', 8: 'annotation', 11: 'conclusion' },
  concepts: {}
}

/** 详情页正文章节（白名单过滤 + 修改记录折叠 + 区块容器包裹） */
function bodyChapters(card) {
  const allow = ALLOWLISTS[card.slug]
  const blocks = CHAPTER_BLOCKS[card.slug] || {}
  const out = []
  for (const ch of splitChapters(card.body)) {
    const content = ch.lines.join('\n').trim()
    if (allow.include[ch.num]) {
      const block = blocks[ch.num]
      if (block) {
        out.push(`::: ${block} ${allow.include[ch.num]}\n\n${content}\n\n:::`)
      } else {
        out.push(`## ${allow.include[ch.num]}\n\n${content}`)
      }
    } else if (allow.collapse[ch.num]) {
      out.push(`<details>\n<summary>${allow.collapse[ch.num]}（折叠）</summary>\n\n${content}\n\n</details>`)
    }
  }
  return out.join('\n\n---\n\n')
}

/** 徽章行：网站状态 / 知识层级 / 审核状态 / 证据等级 / 风险等级 */
function tagRow(card, status) {
  const y = card.yaml
  const tags = []
  const cls = status === '正式公开' ? 'tag-publish-public' : status === '可公开草稿' ? 'tag-publish-draft' : 'tag-publish-other'
  tags.push(`<span class="tag ${cls}">${status}</span>`)
  if (card.slug === 'library' && y['资料性质']) {
    tags.push(`<span class="tag tag-level">${LEVEL_MAP[y['资料性质']] || '其他'} ${y['资料性质']}</span>`)
  }
  if (y['当前状态']) tags.push(`<span class="tag tag-status">审核：${y['当前状态']}</span>`)
  if (y['文献可靠等级']) tags.push(`<span class="tag tag-evidence">证据：${y['文献可靠等级']}</span>`)
  if (y['风险等级']) tags.push(`<span class="tag tag-risk">风险：${y['风险等级']}</span>`)
  return `<p class="tag-row">${tags.join(' ')}</p>`
}

/** 核对状态组合展示（单一数据源：网络文本核对状态 + 指定底本核对状态，程序自动组合） */
function citationSummary(y) {
  const net = y['网络文本核对状态']
  const ed = y['指定底本核对状态']
  if (!net && !ed) return '未知'
  const a = net === '已逐字核对' ? '网络文本已核对' : net === '未核对' ? '网络文本未核对' : net
  const b = ed === '已复核' ? '指定底本已复核' : ed === '未复核' ? '指定底本待复核' : ed
  if (a && b) return `${a}，${b}`
  return a || b
}

/** 详情页书卷式题签页眉（WEB-001 原文页样板 → WEB-002 通用化：文献/概念页同体系） */
function docHeader(card) {
  const y = card.yaml
  const row = (label, v) => (v ? `<span class="wd-oh-item"><b>${label}</b>${v}</span>` : '')
  const fields = {
    originals: ['所属文献', '章节', '卷次', '使用版本'],
    library: ['其他名称', '传统署名', '大致年代', '文献类型', '资料性质', '使用版本'],
    concepts: ['概念类别', '主要时期', '涉及传统', '当前定义状态']
  }[card.slug] || []
  const meta = fields.map((f) => row(f, y[f])).join('')
  // 原文页保留页码/页码状态两字段（WEB-001 收尾约定）
  const extra = card.slug === 'originals'
    ? `${row('页码', y['页码'] || '待补录')}${row('页码状态', y['页码状态'] && y['页码状态'] !== '待补录' ? y['页码状态'] : '')}`
    : ''
  return [
    '<div class="wd-original-header">',
    `<div class="wd-oh-seal">${y['编号'] || card.slug}</div>`,
    '<div class="wd-oh-main">',
    `<div class="wd-oh-meta">${meta}${extra}</div>`,
    '</div>',
    '</div>'
  ].join('\n')
}

/** 生成单张详情页 */
function renderDetail(card, status) {
  const y = card.yaml
  const parts = []
  parts.push('---')
  parts.push(`title: ${y['标题'] || card.slugOf}`)
  // 生成页不在 Git 中，VitePress 的 lastUpdated 无意义；更新时间以知识卡 YAML「最后修改日期/人员」为准（见元信息表）
  parts.push('lastUpdated: false')
  parts.push('---')
  parts.push(`<!-- 本页由 website/scripts/生成网站页面.mjs 自动生成，请勿手工修改；源文件：${card.relPath} -->`)
  parts.push('')
  parts.push('<div class="wd-original-title">')
  parts.push(`<h1>${y['标题'] || card.slugOf}</h1>`)
  parts.push('</div>')
  parts.push('')
  parts.push(docHeader(card))
  parts.push('')
  parts.push(statusBanner(card, status))
  parts.push(tagRow(card, status))
  parts.push('<details class="wd-meta-detail">')
  parts.push('<summary>查看完整元信息</summary>')
  parts.push('')
  parts.push(metaTable(card))
  parts.push('')
  parts.push('</details>')
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
  parts.push(`::: source 来源与修订\n\n本页内容源于项目仓库知识卡 [${card.relPath}](https://github.com/2740219773/dao-practice-reconstruction/blob/main/${card.relPath.split('/').map(encodeURIComponent).join('/')})，持续修订中；网站为展示层，仓库是源头。\n\n:::`)
  return parts.join('\n') + '\n'
}

/** 生成索引页 */
function renderIndex(slug, cards) {
  const title = {
    library: '文献库', originals: '原文库', concepts: '概念库',
    daoyin: '导引术', 'medical-observations': '医学观察' // 预留（三类独立模块）
  }[slug]
  const parts = []
  parts.push('---')
  parts.push(`title: ${title}`)
  // 索引页为构建时生成物，不在 Git 中，关闭 VitePress 的 lastUpdated
  parts.push('lastUpdated: false')
  parts.push('---')
  // 题签式标题区（WEB-003：与详情页书卷式体系一致）
  parts.push('<div class="wd-index-header">')
  parts.push(`<div class="wd-oh-seal">${title}</div>`)
  parts.push('<div class="wd-index-header-main">')
  parts.push(`<h1>${title}</h1>`)
  parts.push('<p class="wd-index-note">本站只展示经过选择并公开的内容（发布状态为「可公开草稿」或「正式公开」）。未审核、内部预览、已撤回或缺少发布字段的卡片不生成页面；知识卡原件与修订历史完整保留在[项目仓库](https://github.com/2740219773/dao-practice-reconstruction)。</p>')
  parts.push('</div>')
  parts.push('</div>')
  parts.push('')
  if (slug === 'library') {
    const byGroup = new Map(LIBRARY_GROUPS.map((g) => [g.key, []]))
    const others = []
    for (const c of cards) byGroup.get(c.yaml['资料性质']) ? byGroup.get(c.yaml['资料性质']).push(c) : others.push(c)
    for (const g of LIBRARY_GROUPS) {
      const list = byGroup.get(g.key)
      if (!list || list.length === 0) continue
      parts.push(`<h2 class="wd-index-group">${g.label}</h2>`)
      parts.push('')
      parts.push(rows(slug, list))
      parts.push('')
    }
    if (others.length) {
      parts.push('<h2 class="wd-index-group">其他</h2>')
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

/** 首页「内容统计」区块（占位符内容，由构建脚本生成） */
function renderStatsSection(cards, publishable) {
  const count = (list) => {
    const m = {}
    for (const c of list) m[c.slug] = (m[c.slug] || 0) + 1
    return m
  }
  const statItems = (m) =>
    STAT_ORDER.filter((slug) => (m[slug] || 0) > 0)
      .map((slug) =>
        `\n<div class="wd-stat-item">\n<div class="wd-stat-num">${m[slug]}</div>\n<div class="wd-stat-label">${TYPE_LABELS[slug]}</div>\n</div>`)
      .join('')
  const all = count(cards)
  const pub = count(publishable)
  const pubDetail = {}
  for (const c of publishable) {
    const s = c.yaml['网站发布状态']
    pubDetail[s] = (pubDetail[s] || 0) + 1
  }
  const total = Object.values(pub).reduce((a, b) => a + b, 0)
  const totalAll = Object.values(all).reduce((a, b) => a + b, 0)
  const pending = totalAll - total
  return [
    '<!-- 紧凑数字栏：对普通访问者只显示三个总数，详细分类折叠 -->',
    '<div class="wd-stat-compact">',
    `<div class="wd-stat-item"><div class="wd-stat-num">${totalAll}</div><div class="wd-stat-label">知识卡总计</div></div>`,
    `<div class="wd-stat-item"><div class="wd-stat-num">${total}</div><div class="wd-stat-label">已公开</div></div>`,
    `<div class="wd-stat-item"><div class="wd-stat-num">${pending}</div><div class="wd-stat-label">整理中（未公开）</div></div>`,
    '</div>',
    '',
    '<details class="wd-stat-detail">',
    '<summary>按类型查看（知识卡 ' + totalAll + ' 张，构建时自动统计）</summary>',
    '',
    '### 仓库已建立内容',
    '',
    '<div class="wd-stat">' + statItems(all) + '\n</div>',
    '',
    '### 网站已公开内容',
    '',
    '发布状态为「可公开草稿／正式公开」：' + (Object.entries(pubDetail).map(([s, n]) => `${s} ${n} 张`).join('，') || '暂无'),
    '',
    '<div class="wd-stat">' + statItems(pub) +
      '\n<div class="wd-stat-item">\n<div class="wd-stat-num">' + total + '</div>\n<div class="wd-stat-label">公开页合计</div>\n</div>\n</div>',
    '',
    '</details>'
  ].join('\n')
}

/** 首页「最近整理」区块：研究事件时间线（最多 6 条，每条链接到对应提交）
 *  数据源优先：website/data/research-events.yml（手工登记，防浅克隆丢历史）；
 *  兜底：git log，仅保留内容整理类提交（docs(原文/文献/概念/主张/假说/研究/审查/专题)），
 *  过滤 fix/test/chore 等技术性提交。 */
const RECENT_EVENTS_FILE = path.join(REPO_ROOT, 'website', 'data', 'research-events.yml')
/** 内容整理类提交前缀（白名单）；技术性提交（fix(项目)/fix(YAML)/test/chore 等）一律不展示 */
const CONTENT_COMMIT_RE = /^docs\((原文|文献|概念|主张|假说|研究|审查|专题)/

/** 读取手工登记的研究事件（research-events.yml），返回 {date, hash, title}[] 或 null */
function readRecentEventsFile() {
  try {
    const raw = readFileSync(RECENT_EVENTS_FILE, 'utf8')
    const data = yaml.load(raw)
    if (!Array.isArray(data)) return null
    return data.filter((e) => e && e.date && e.title).map((e) => ({ date: e.date, hash: String(e.hash || ''), title: String(e.title).trim() }))
  } catch {
    return null
  }
}

/** git log 兜底：只保留内容整理类提交，取最近 6 条 */
function readRecentEventsFromGit() {
  if (!existsSync(path.join(REPO_ROOT, '.git'))) return []
  let out
  try {
    out = execSync(
      "git log -n 50 --date=format:%m-%d --pretty=format:%h%x1f%ad%x1f%s",
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
  } catch {
    return []
  }
  return out.split('\n')
    .map((line) => line.split('\x1f'))
    .filter(([, , s]) => CONTENT_COMMIT_RE.test(String(s)))
    .slice(0, 6)
    .map(([hash, date, subject]) => ({ hash, date, title: String(subject).replace(/^docs\([^)]*\):\s*/, '') }))
}

function renderRecentSection() {
  const fileEvents = readRecentEventsFile()
  const events = (fileEvents && fileEvents.length > 0 ? fileEvents : readRecentEventsFromGit()).slice(0, 6)
  if (events.length === 0) return '（暂无整理事件）'
  const repoUrl = 'https://github.com/2740219773/dao-practice-reconstruction'
  return events.map(({ date, hash, title }) =>
    hash
      ? `- **${date}**　[${title}](${repoUrl}/commit/${hash})`
      : `- **${date}**　${title}`
  ).join('\n')
}

/** 替换首页占位符区块（<!-- GEN:BEGIN X --> … <!-- GEN:END X -->）之间的内容 */
function replaceSection(text, name, content) {
  const beginTag = `<!-- GEN:BEGIN ${name} -->`
  const endTag = `<!-- GEN:END ${name} -->`
  const b = text.indexOf(beginTag)
  const e = text.indexOf(endTag)
  if (b < 0 || e < 0) throw new Error(`首页 index.md 缺少占位符：${beginTag} / ${endTag}`)
  return text.slice(0, b + beginTag.length) + '\n\n' + content.trim() + '\n\n' + text.slice(e)
}

/** 更新首页统计与最近整理（docs/index.md 为手工维护的源文件，只替换占位符区块） */
function updateHomeSections(cards, publishable) {
  const indexFile = path.join(DOCS_DIR, 'index.md')
  const raw = readFileSync(indexFile, 'utf8')
  const nl = raw.includes('\r\n') ? '\r\n' : '\n'
  let text = raw
  text = replaceSection(text, '内容统计', renderStatsSection(cards, publishable))
  text = replaceSection(text, '最近整理', renderRecentSection())
  // 卡片数据未变化时输出保持稳定，避免无谓的 git 差异
  writeFileSync(indexFile, text.replace(/\r?\n/g, nl), 'utf8')
}

/** 索引表格行 */
function rows(slug, cards) {
  const line = (c) => {
    const y = c.yaml
    const cls = y['网站发布状态'] === '正式公开' ? 'tag-publish-public' : 'tag-publish-draft'
    const status = y['网站发布状态'] || '未知'
    const quote = slug === 'originals'
      ? `\n<div class="wd-index-quote">引文：${citationSummary(y)}</div>`
      : ''
    return [
      '<div class="wd-index-item">',
      `<div class="wd-index-seal">${y['编号'] || c.slugOf}</div>`,
      '<div class="wd-index-main">',
      `<a class="wd-index-title" href="./${c.slugOf}">${y['标题'] || c.slugOf}</a>${quote}`,
      '</div>',
      `<span class="tag ${cls}">${status}</span>`,
      '</div>'
    ].join('\n')
  }
  return cards.map(line).join('\n')
}

async function main() {
  console.log('[生成] 步骤 1/3：扫描知识卡…')
  const cards = await readAllCards()
  console.log(`[生成] 扫描到 ${cards.length} 张卡（全部知识卡类型）`)

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
  // 页面类型预留（决策：三类独立模块）：daoyin（导引术）、medical-observations（医学观察）
  // 已登记于 CARD_DIRS／STAT_ORDER／TYPE_LABELS／META_FIELDS／renderIndex 标题表；
  // 对应模块尚无公开内容前不进入生成循环（不上线空页面），待首批可公开卡出现后加入下方数组。
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

  console.log('[生成] 步骤 4/4：更新首页内容统计与最近整理…')
  updateHomeSections(cards, publishable)
  console.log('  ✓ docs/index.md（内容统计 + 最近整理）')
  console.log('[生成] 完成。')
}

main().catch((err) => {
  console.error('[生成失败] ' + err.message)
  process.exit(1)
})
