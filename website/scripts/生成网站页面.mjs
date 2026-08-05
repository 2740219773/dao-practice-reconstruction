/**
 * 生成网站页面.mjs —— 网站构建前置步骤（重构版 V0.2）
 *
 * 流程：扫描仓库知识卡 → 读取中文 YAML → 校验公开字段（复用 theme/data/_lib）
 *       → 生成 /knowledge/* 详情页（正文 + 容器 + 来源）→ 清理旧库生成物
 *
 * 变更说明（2026-08-04 重构）：
 *  - 不再生成 library/originals/... 七个旧库的索引页与详情页（统一知识索引由
 *    KnowledgeLayout + knowledge.data.ts 数据驱动渲染）；
 *  - 不再回写首页统计与最近整理（首页由 HomeLayout + data loader 渲染）；
 *  - 详情页只输出正文章节（头部证据组件由 ArticleLayout 渲染）。
 *
 * 数据校验主职责在 theme/data/_lib（data loader 构建期执行）；本脚本同样调用
 * validateAllCards，校验失败即终止，保证生成物与展示数据一致。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readAllCards, REPO_ROOT, splitChapters } from '../docs/.vitepress/theme/data/_lib/读取知识卡.ts'
import { validateAllCards, ALLOWLISTS } from '../docs/.vitepress/theme/data/_lib/校验公开字段.ts'

/** 输出目录：website/docs */
const DOCS_DIR = path.join(REPO_ROOT, 'website', 'docs')

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

/** 各类型详情页章节 → 区块容器名 */
const CHAPTER_BLOCKS = {
  library: { 12: 'conclusion' },
  originals: { 2: 'original', 8: 'annotation', 11: 'conclusion' },
  concepts: {}
}

/** 详情页正文章节（白名单过滤 + 修改记录折叠 + 区块容器包裹） */
function bodyChapters(card) {
  const allow = ALLOWLISTS[card.slug]
  if (!allow) return ''
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

/** 生成单张知识卡详情页（/knowledge/{slug}.md） */
function renderDetail(card) {
  const y = card.yaml
  const parts = []
  parts.push('---')
  parts.push(`title: ${y['标题'] || card.slugOf}`)
  parts.push('layout: article')
  parts.push('lastUpdated: false')
  parts.push('---')
  parts.push(`<!-- 本页由 website/scripts/生成网站页面.mjs 自动生成，请勿手工修改；源文件：${card.relPath} -->`)
  const body = bodyChapters(card)
  if (body) {
    parts.push('')
    parts.push(body)
  }
  parts.push('')
  parts.push(`::: source 来源与修订\n\n本页内容源于项目仓库知识卡 [${card.relPath}](https://github.com/2740219773/dao-practice-reconstruction/blob/main/${card.relPath.split('/').map(encodeURIComponent).join('/')})，持续修订中；网站为展示层，仓库是源头。\n\n:::`)
  return parts.join('\n') + '\n'
}

async function main() {
  writeBuildInfo()
  console.log('[生成] 步骤 1/3：扫描知识卡…')
  const cards = await readAllCards()
  console.log(`[生成] 扫描到 ${cards.length} 张卡`)

  console.log('[生成] 步骤 2/3：校验公开字段…')
  const publishable = validateAllCards(cards)
  console.log(`[生成] 可公开 ${publishable.length} 张（可公开草稿/正式公开）`)

  console.log('[生成] 步骤 3/3：生成 /knowledge/ 详情页…')
  const knowledgeCards = publishable.filter((c) => c.layer === 'knowledge')

  // 清空旧详情页（撤回/取消公开的卡必须从网站消失）
  const kDir = path.join(DOCS_DIR, 'knowledge')
  mkdirSync(kDir, { recursive: true })
  for (const f of readdirSync(kDir)) {
    if (f.endsWith('.md') && f !== 'index.md') rmSync(path.join(kDir, f))
  }
  for (const card of knowledgeCards) {
    const detailFile = path.join(kDir, `${card.slugOf}.md`)
    writeFileSync(detailFile, renderDetail(card), 'utf8')
    console.log(`  ✓ /knowledge/${card.slugOf}.md（${card.yaml['网站发布状态']}）`)
  }

  // 清理旧库生成物（library/originals/... 保留 index.md 作为跳转页，其余删除）
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
