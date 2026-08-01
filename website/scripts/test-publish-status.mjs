/**
 * test-publish-status.mjs — 发布状态回归测试
 *
 * 覆盖用户审查要求的撤回/发布回归：
 *  A. 可公开草稿 → 详情页生成 + 索引出现
 *  B. 改为已撤回 → 旧详情页删除（404）+ 索引消失
 *  C. 可公开卡缺必需章节 → 构建失败，报告卡片编号与缺失章节
 *  D. 非法发布状态值 → 构建失败（zod 校验）
 *
 * 全程使用临时卡 03-原文卡/原文-9999-回归测试临时卡.md，
 * 测试结束（含失败路径）都会清理临时卡并重跑生成器恢复现场。
 * 运行：npm test
 */
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const WEBSITE_ROOT = fileURLToPath(new URL('..', import.meta.url)) // website/
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const CARD_FILE = path.join(REPO_ROOT, '03-原文卡', '原文-9999-回归测试临时卡.md')
const DETAIL_PAGE = path.join(WEBSITE_ROOT, 'docs', 'originals', '原文-9999-回归测试临时卡.md')
const INDEX_PAGE = path.join(WEBSITE_ROOT, 'docs', 'originals', 'index.md')
const CARD_LINK = '原文-9999-回归测试临时卡'

/** 运行生成器，返回 { ok, output }；ok=false 表示构建失败（exit 非 0） */
function runGenerator() {
  const r = spawnSync(process.execPath, ['scripts/生成网站页面.mjs'], {
    cwd: WEBSITE_ROOT,
    encoding: 'utf8'
  })
  return { ok: r.status === 0, output: (r.stdout || '') + (r.stderr || '') }
}

/** 写入临时卡（status 覆盖 YAML 发布状态；omitChapter 传章节号则删除该章节） */
function writeTempCard(status, omitChapter = null) {
  const chapters = [
    [1, '原文出处'], [2, '原文'], [4, '逐词说明'], [6, '直译'], [8, '历代注释'],
    [9, '可能解释'], [10, '待检索现代方向'], [11, '不能直接推出的结论'], [12, '关联概念'], [13, '关联原文']
  ]
  const body = chapters
    .filter(([n]) => n !== omitChapter)
    .map(([n, t]) => `## ${n}. ${t}\n测试占位内容：第 ${n} 章。\n`)
    .join('\n')
  const yaml = [
    '---',
    '编号: 原文-9999',
    '标题: 回归测试临时卡（勿用）',
    '网站发布状态: ' + status,
    '公开摘要: 回归测试专用临时卡，测试后即删除，不构成任何内容。',
    '公开注意事项: 回归测试专用临时卡，测试后即删除，不构成任何练习指导。',
    '---'
  ].join('\n')
  writeFileSync(CARD_FILE, yaml + '\n\n' + body, 'utf8')
}

let failures = 0
/** 断言：pass=false 时记录失败并继续跑完其余场景 */
function check(name, pass, detail) {
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${pass ? '' : '  — ' + detail}`)
  if (!pass) failures++
}

// 清场：确保测试前仓库无临时卡
if (existsSync(CARD_FILE)) rmSync(CARD_FILE)

// —— 场景 A：可公开草稿 → 生成 + 索引出现 ——
console.log('场景 A：可公开草稿 → 详情页生成 + 索引出现')
writeTempCard('可公开草稿')
{
  const r = runGenerator()
  check('A1 生成器退出码 0', r.ok, r.output.slice(-500))
  check('A2 详情页已生成', existsSync(DETAIL_PAGE), DETAIL_PAGE)
  check('A3 索引页含该卡链接', existsSync(INDEX_PAGE) && readFileSync(INDEX_PAGE, 'utf8').includes(CARD_LINK), '索引页缺链接')
}

// —— 场景 B：已撤回 → 详情页删除 + 索引消失 ——
console.log('场景 B：已撤回 → 旧详情页删除（404）+ 索引消失')
writeTempCard('已撤回')
{
  const r = runGenerator()
  check('B1 生成器退出码 0', r.ok, r.output.slice(-500))
  check('B2 旧详情页已删除', !existsSync(DETAIL_PAGE), '详情页残留：' + DETAIL_PAGE)
  const idx = existsSync(INDEX_PAGE) ? readFileSync(INDEX_PAGE, 'utf8') : ''
  check('B3 索引不再含该卡', !idx.includes(CARD_LINK), '索引仍含该卡链接')
}

// —— 场景 C：可公开卡缺必需章节 → 构建失败 + 明确报告 ——
console.log('场景 C：缺必需章节 → 构建失败并报告卡片与缺失章节')
writeTempCard('可公开草稿', 2)
{
  const r = runGenerator()
  check('C1 生成器退出码非 0', !r.ok, '构建意外成功')
  check('C2 报告卡片编号', r.output.includes('原文-9999'), '未报告卡片编号')
  check('C3 报告缺失章节', r.output.includes('缺少必需展示章节') && r.output.includes('2「原文」'), '未报告缺失章节')
}

// —— 场景 D：非法发布状态 → 构建失败 ——
console.log('场景 D：非法发布状态值 → 构建失败')
writeTempCard('公开')
{
  const r = runGenerator()
  check('D1 生成器退出码非 0', !r.ok, '构建意外成功')
  check('D2 报告状态取值要求', r.output.includes('网站发布状态必须为'), '未报告状态取值要求')
}

// —— 清理并恢复现场 ——
if (existsSync(CARD_FILE)) rmSync(CARD_FILE)
{
  const r = runGenerator()
  check('清理：删除临时卡后生成器恢复现场', r.ok && !existsSync(DETAIL_PAGE), r.output.slice(-500))
}

console.log(failures === 0 ? '全部通过。' : `失败 ${failures} 项。`)
process.exit(failures === 0 ? 0 : 1)
