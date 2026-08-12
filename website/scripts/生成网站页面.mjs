/**
 * 生成网站页面.mjs —— 网站构建前置步骤
 *
 * 当前职责：
 * 1. 扫描并校验旧公开知识卡，生成 /knowledge/*；
 * 2. 读取 V3 data/nodes.json 与节点 source_path，自动生成 /graph/node/*；
 * 3. 扫描 33-实践体系/实践卡，校验并自动生成 /practice/card/*；
 * 4. 网站页面永远是构建产物，仓库 Markdown 仍是正文唯一源。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { readAllCards, REPO_ROOT, splitChapters } from '../docs/.vitepress/theme/data/_lib/读取知识卡.ts'
import { validateAllCards, ALLOWLISTS } from '../docs/.vitepress/theme/data/_lib/校验公开字段.ts'

const DOCS_DIR = path.join(REPO_ROOT, 'website', 'docs')
const PRACTICE_SOURCE_DIR = path.join(REPO_ROOT, '33-实践体系', '实践卡')

function buildSha() {
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA
  if (fromEnv) return fromEnv.slice(0, 8)
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

function writeBuildInfo() {
  const publicDir = path.join(DOCS_DIR, 'public')
  mkdirSync(publicDir, { recursive: true })
  writeFileSync(path.join(publicDir, 'build-info.json'), `${JSON.stringify({
    commit: buildSha(),
    buildTime: new Date().toISOString(),
    environment: process.env.WDZ_BUILD_ENV || 'preview'
  }, null, 2)}\n`, 'utf8')
}

const CHAPTER_BLOCKS = {
  library: { 12: 'conclusion' },
  originals: { 2: 'original', 8: 'annotation', 11: 'conclusion' },
  concepts: {}
}

function bodyChapters(card) {
  const allow = ALLOWLISTS[card.slug]
  if (!allow) return ''
  const blocks = CHAPTER_BLOCKS[card.slug] || {}
  const out = []
  for (const ch of splitChapters(card.body)) {
    const content = ch.lines.join('\n').trim()
    if (allow.include[ch.num]) {
      const block = blocks[ch.num]
      if (block) out.push(`::: ${block} ${allow.include[ch.num]}\n\n${content}\n\n:::`)
      else out.push(`## ${allow.include[ch.num]}\n\n${content}`)
    } else if (allow.collapse[ch.num]) {
      out.push(`<details>\n<summary>${allow.collapse[ch.num]}（折叠）</summary>\n\n${content}\n\n</details>`)
    }
  }
  return out.join('\n\n---\n\n')
}

function renderDetail(card) {
  const y = card.yaml
  const parts = [
    '---',
    `title: ${JSON.stringify(y['标题'] || card.slugOf)}`,
    'layout: article',
    'lastUpdated: false',
    '---',
    `<!-- 本页由 website/scripts/生成网站页面.mjs 自动生成，请勿手工修改；源文件：${card.relPath} -->`
  ]
  const body = bodyChapters(card)
  if (body) parts.push('', body)
  parts.push('', `::: source 来源与修订\n\n本页内容源于项目仓库知识卡 [${card.relPath}](https://github.com/2740219773/dao-practice-reconstruction/blob/main/${card.relPath.split('/').map(encodeURIComponent).join('/')})，持续修订中；网站为展示层，仓库是源头。\n\n:::`)
  return parts.join('\n') + '\n'
}

function cleanGeneratedMarkdown(dir, keep = new Set()) {
  mkdirSync(dir, { recursive: true })
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.md') && !keep.has(f)) rmSync(path.join(dir, f), { force: true })
  }
}

function renderGraphNode(node) {
  const sourceFile = path.join(REPO_ROOT, node.source_path)
  if (!existsSync(sourceFile)) throw new Error(`V3 节点 ${node.id} 源文件不存在：${node.source_path}`)

  const parsed = matter(readFileSync(sourceFile, 'utf8').replace(/^\uFEFF/, ''))
  if (String(parsed.data.id || '') !== String(node.id)) {
    throw new Error(`V3 节点 ${node.id} 与源文件 Front Matter id 不一致：${node.source_path}`)
  }

  const body = parsed.content.replace(/^\s*#\s+[^\n]+\n+/, '').trim()
  const parts = [
    '---',
    `title: ${JSON.stringify(node.name)}`,
    'layout: graph-node',
    `nodeId: ${JSON.stringify(node.id)}`,
    `sourcePath: ${JSON.stringify(node.source_path)}`,
    'lastUpdated: false',
    '---',
    `<!-- 自动生成：源文件 ${node.source_path}；请修改源 Markdown，不要修改本页。 -->`
  ]
  if (body) parts.push('', body)
  return parts.join('\n') + '\n'
}

function generateGraphNodePages() {
  const bundlePath = path.join(REPO_ROOT, 'data', 'nodes.json')
  if (!existsSync(bundlePath)) {
    console.log('[生成] 未发现 data/nodes.json，跳过 V3 节点详情生成（测试/单独运行生成器时允许）。')
    return 0
  }

  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'))
  const nodes = Array.isArray(bundle.nodes) ? bundle.nodes : []
  const nodeDir = path.join(DOCS_DIR, 'graph', 'node')
  cleanGeneratedMarkdown(nodeDir)

  for (const node of nodes) {
    if (!node?.id || !node?.name || !node?.source_path) {
      throw new Error('nodes.json 存在缺少 id/name/source_path 的正式节点')
    }
    const output = path.join(nodeDir, `${node.id}.md`)
    writeFileSync(output, renderGraphNode(node), 'utf8')
  }
  return nodes.length
}

function practiceFiles() {
  if (!existsSync(PRACTICE_SOURCE_DIR)) return []
  return readdirSync(PRACTICE_SOURCE_DIR)
    .filter((f) => /^PRAC-\d+-.+\.md$/u.test(f))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function validatePracticeCard(file, parsed, seenIds, seenSlugs) {
  const y = parsed.data || {}
  const required = [
    'id', 'slug', 'type', 'name', 'summary', 'version', 'status', 'track', 'sequence',
    'practice_kind', 'historical_equivalence', 'risk_level', 'activity_class', 'access_level',
    'duration_minutes', 'goal', 'stop_conditions', 'completion_criteria'
  ]
  const missing = required.filter((k) => y[k] === undefined || y[k] === null || y[k] === '')
  if (missing.length) throw new Error(`实践卡 ${file} 缺少字段：${missing.join(', ')}`)

  if (y.type !== 'practice') throw new Error(`实践卡 ${file} type 必须为 practice`)
  if (y.practice_kind !== 'modern_teaching_unit') throw new Error(`实践卡 ${file} practice_kind 必须为 modern_teaching_unit`)
  if (y.historical_equivalence !== false) throw new Error(`实践卡 ${file} historical_equivalence 必须为 false`)
  if (y.risk_level !== 'S1') throw new Error(`第一批实践卡 ${file} risk_level 必须为 S1`)
  if (y.activity_class !== 'B') throw new Error(`第一批实践卡 ${file} activity_class 必须为 B`)
  if (y.access_level !== 'basic_low_risk') throw new Error(`第一批实践卡 ${file} access_level 必须为 basic_low_risk`)

  const durations = y.duration_minutes || {}
  for (const k of ['min', 'typical', 'max']) {
    if (!Number.isFinite(Number(durations[k]))) throw new Error(`实践卡 ${file} duration_minutes.${k} 必须为数字`)
  }
  if (!(Number(durations.min) <= Number(durations.typical) && Number(durations.typical) <= Number(durations.max))) {
    throw new Error(`实践卡 ${file} 时长必须满足 min <= typical <= max`)
  }
  if (!Array.isArray(y.stop_conditions) || y.stop_conditions.length < 1) throw new Error(`实践卡 ${file} 至少需要1条停止条件`)
  if (!Array.isArray(y.completion_criteria) || y.completion_criteria.length < 1) throw new Error(`实践卡 ${file} 至少需要1条完成标准`)
  if (!String(parsed.content || '').trim()) throw new Error(`实践卡 ${file} 正文为空`)

  const id = String(y.id)
  const slug = String(y.slug)
  if (seenIds.has(id)) throw new Error(`实践卡 ID 重复：${id}`)
  if (seenSlugs.has(slug)) throw new Error(`实践卡 slug 重复：${slug}`)
  seenIds.add(id)
  seenSlugs.add(slug)

  return {
    file,
    relPath: path.posix.join('33-实践体系', '实践卡', file),
    data: y,
    content: parsed.content
  }
}

function renderPracticeCard(card) {
  const y = card.data
  const body = card.content.replace(/^\s*#\s+[^\n]+\n+/, '').trim()
  const parts = [
    '---',
    `title: ${JSON.stringify(y.name)}`,
    'layout: article',
    `practiceId: ${JSON.stringify(y.id)}`,
    `practiceSequence: ${Number(y.sequence)}`,
    `riskLevel: ${JSON.stringify(y.risk_level)}`,
    `sourcePath: ${JSON.stringify(card.relPath)}`,
    'lastUpdated: false',
    '---',
    `<!-- 自动生成：源文件 ${card.relPath}；请修改源 Markdown，不要修改本页。 -->`,
    '',
    `> **实践层说明：** 本卡是问道志现代低风险教学单元，风险等级 **${y.risk_level}**，不等同于任何古代功法复原。开始前请阅读 [安全边界](/safety/)。`
  ]
  if (body) parts.push('', body)
  parts.push('', `::: source 来源与修订\n\n源文件：[${card.relPath}](https://github.com/2740219773/dao-practice-reconstruction/blob/main/${card.relPath.split('/').map(encodeURIComponent).join('/')})。本页由构建器自动生成，仓库 Markdown 是唯一人工维护正文。\n\n返回 [我要实践](/practice/)。\n\n:::`)
  return parts.join('\n') + '\n'
}

function generatePracticePages() {
  const files = practiceFiles()
  const cardDir = path.join(DOCS_DIR, 'practice', 'card')
  cleanGeneratedMarkdown(cardDir)
  if (!files.length) return 0

  const seenIds = new Set()
  const seenSlugs = new Set()
  const cards = []
  for (const file of files) {
    const source = path.join(PRACTICE_SOURCE_DIR, file)
    const parsed = matter(readFileSync(source, 'utf8').replace(/^\uFEFF/, ''))
    cards.push(validatePracticeCard(file, parsed, seenIds, seenSlugs))
  }

  cards.sort((a, b) => Number(a.data.sequence) - Number(b.data.sequence))
  const expected = Array.from({ length: cards.length }, (_, i) => i + 1)
  const actual = cards.map((c) => Number(c.data.sequence))
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`实践卡 sequence 必须从1连续编号，当前：${actual.join(', ')}`)
  }

  for (const card of cards) {
    writeFileSync(path.join(cardDir, `${card.data.slug}.md`), renderPracticeCard(card), 'utf8')
  }
  return cards.length
}

async function main() {
  writeBuildInfo()
  console.log('[生成] 步骤 1/5：扫描知识卡…')
  const cards = await readAllCards()
  console.log(`[生成] 扫描到 ${cards.length} 张卡`)

  console.log('[生成] 步骤 2/5：校验公开字段…')
  const publishable = validateAllCards(cards)
  console.log(`[生成] 可公开 ${publishable.length} 张（可公开草稿/正式公开）`)

  console.log('[生成] 步骤 3/5：生成 /knowledge/ 详情页…')
  const knowledgeCards = publishable.filter((c) => c.layer === 'knowledge')
  const kDir = path.join(DOCS_DIR, 'knowledge')
  cleanGeneratedMarkdown(kDir, new Set(['index.md']))
  for (const card of knowledgeCards) {
    const detailFile = path.join(kDir, `${card.slugOf}.md`)
    writeFileSync(detailFile, renderDetail(card), 'utf8')
    console.log(`  ✓ /knowledge/${card.slugOf}.md（${card.yaml['网站发布状态']}）`)
  }

  console.log('[生成] 步骤 4/5：生成 V3 /graph/node/ 详情页…')
  const graphCount = generateGraphNodePages()
  if (graphCount) console.log(`  ✓ 生成 ${graphCount} 个 V3 节点详情页`)

  console.log('[生成] 步骤 5/5：校验并生成 /practice/card/ 详情页…')
  const practiceCount = generatePracticePages()
  if (practiceCount) console.log(`  ✓ 生成 ${practiceCount} 个基础实践详情页`)

  for (const slug of ['library', 'originals', 'concepts', 'claims', 'disputes', 'research', 'risks', 'contemporary']) {
    const dir = path.join(DOCS_DIR, slug)
    let files = []
    try { files = readdirSync(dir) } catch { continue }
    for (const f of files) {
      if (f === 'index.md') continue
      if (f.endsWith('.md')) rmSync(path.join(dir, f), { force: true })
    }
  }

  console.log('[生成] 完成。')
}

main().catch((err) => {
  console.error('[生成失败] ' + err.message)
  process.exit(1)
})
