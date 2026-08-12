import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import fg from 'fast-glob'

const WEBSITE_ROOT = process.cwd()
const REPO_ROOT = path.resolve(WEBSITE_ROOT, '..')
const PRACTICE_DIR = path.join(REPO_ROOT, '33-实践体系', '实践卡')
const RELATION_FILE = path.join(REPO_ROOT, '33-实践体系', '实践关系-v1.json')
const COMPONENT_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'components', 'PracticeJournal.vue')
const MODEL_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-model.mjs')
const STATS_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-stats.mjs')
const SAFETY_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-safety.mjs')
const AI_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-ai.mjs')
const TEST_FILE = path.join(WEBSITE_ROOT, 'tests', 'practice-journal.test.mjs')
const PRACTICE_PAGE = path.join(WEBSITE_ROOT, 'docs', 'practice', 'index.md')
const THEME_INDEX = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'index.ts')
const PACKAGE_FILE = path.join(WEBSITE_ROOT, 'package.json')

const requiredDocs = [
  '33-实践体系/实践系统设计方案-V0.2.md',
  '33-实践体系/实践卡规范-V1.0.md',
  '33-实践体系/基础修持路线-V1.0.md',
  '33-实践体系/记录与复盘规范-V1.0.md',
  '33-实践体系/实践问题与安全分流-V1.0.md',
  '33-实践体系/实践记录数据模型-V1.0.md',
  '33-实践体系/AI实践复盘规范-V1.0.md',
  '33-实践体系/知识与实践关系规范-V1.0.md'
]

const requiredFields = [
  'id', 'slug', 'type', 'name', 'summary', 'version', 'status', 'track', 'sequence',
  'practice_kind', 'historical_equivalence', 'risk_level', 'activity_class', 'access_level',
  'duration_minutes', 'goal', 'stop_conditions', 'completion_criteria'
]

const allowedRelations = new Set([
  'prerequisite_for', 'contextualized_by', 'not_equivalent_to', 'safety_constrained_by', 'reviewed_by'
])

const forbiddenRelations = new Set([
  'authored', 'founded', 'develops', 'influences', 'traditional_attribution', 'belongs_to', 'practices'
])

function fail(message) {
  console.error(`[实践体系检查失败] ${message}`)
  process.exitCode = 1
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function loadKnowledgeIdsFromSources() {
  const patterns = [
    '../23-核心概念网络/**/*.md',
    '../24-经典节点/**/*.md',
    '../25-人物节点/**/*.md',
    '../26-流派节点/**/*.md',
    '../27-方法节点/**/*.md',
    '../28-修行阶段/**/*.md',
    '../29-修行路线图/**/*.md',
    '../30-体系总览/**/*.md',
    '../32-争议辨析层/**/*.md'
  ]
  const ids = new Set()
  for (const rel of fg.sync(patterns, { cwd: WEBSITE_ROOT, onlyFiles: true, unique: true })) {
    try {
      const parsed = matter(readFileSync(path.resolve(WEBSITE_ROOT, rel), 'utf8').replace(/^\uFEFF/, ''))
      if (parsed.data?.id) ids.add(String(parsed.data.id))
    } catch (error) {
      fail(`无法读取 V3 源文件 ${rel}：${error?.message || error}`)
    }
  }
  assert(ids.size > 0, '未从 V3 源 Markdown 读取到任何节点 ID')
  return ids
}

for (const rel of requiredDocs) assert(existsSync(path.join(REPO_ROOT, rel)), `缺少规范文件：${rel}`)
assert(existsSync(PRACTICE_DIR), '缺少 33-实践体系/实践卡 目录')
assert(existsSync(RELATION_FILE), '缺少 33-实践体系/实践关系-v1.json')
assert(existsSync(COMPONENT_FILE), '缺少 PracticeJournal.vue')
for (const [file, label] of [
  [MODEL_FILE, 'practice-model.mjs'],
  [STATS_FILE, 'practice-stats.mjs'],
  [SAFETY_FILE, 'practice-safety.mjs'],
  [AI_FILE, 'practice-ai.mjs'],
  [TEST_FILE, 'practice-journal.test.mjs']
]) assert(existsSync(file), `缺少实践模块或测试：${label}`)

const files = existsSync(PRACTICE_DIR)
  ? readdirSync(PRACTICE_DIR).filter((file) => /^PRAC-\d+-.+\.md$/u.test(file)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  : []

assert(files.length >= 8, `基础实践卡少于 8 张，当前 ${files.length}`)

const ids = new Set()
const slugs = new Set()
const sequences = []

for (const file of files) {
  const parsed = matter(readFileSync(path.join(PRACTICE_DIR, file), 'utf8').replace(/^\uFEFF/, ''))
  const y = parsed.data || {}
  const missing = requiredFields.filter((key) => y[key] === undefined || y[key] === null || y[key] === '')
  assert(!missing.length, `${file} 缺少字段：${missing.join(', ')}`)
  assert(y.type === 'practice', `${file} type 必须为 practice`)
  assert(y.practice_kind === 'modern_teaching_unit', `${file} 必须为 modern_teaching_unit`)
  assert(y.historical_equivalence === false, `${file} historical_equivalence 必须为 false`)
  assert(y.risk_level === 'S1', `${file} 第一批公开实践必须为 S1`)
  assert(y.activity_class === 'B', `${file} 第一批公开实践必须为 B 类`)
  assert(y.access_level === 'basic_low_risk', `${file} access_level 必须为 basic_low_risk`)
  assert(Array.isArray(y.stop_conditions) && y.stop_conditions.length > 0, `${file} 至少需要一条停止条件`)
  assert(Array.isArray(y.completion_criteria) && y.completion_criteria.length > 0, `${file} 至少需要一条完成标准`)

  const id = String(y.id || '')
  const slug = String(y.slug || '')
  assert(!ids.has(id), `实践 ID 重复：${id}`)
  assert(!slugs.has(slug), `实践 slug 重复：${slug}`)
  ids.add(id)
  slugs.add(slug)
  sequences.push(Number(y.sequence))

  const duration = y.duration_minutes || {}
  assert(Number.isFinite(Number(duration.min)) && Number.isFinite(Number(duration.typical)) && Number.isFinite(Number(duration.max)), `${file} 时长字段必须为数字`)
  assert(Number(duration.min) <= Number(duration.typical) && Number(duration.typical) <= Number(duration.max), `${file} 时长必须满足 min <= typical <= max`)
}

const sortedSequence = [...sequences].sort((a, b) => a - b)
for (let i = 0; i < sortedSequence.length; i++) assert(sortedSequence[i] === i + 1, `sequence 应从 1 连续编号，当前：${sortedSequence.join(', ')}`)

let relationData = { relations: [] }
try {
  relationData = JSON.parse(readFileSync(RELATION_FILE, 'utf8'))
} catch {
  fail('实践关系-v1.json 无法解析')
}
assert(relationData.scope === 'practice_layer_only', '实践关系文件 scope 必须为 practice_layer_only')
assert(Array.isArray(relationData.relations), '实践关系 relations 必须为数组')

const knowledgeIds = loadKnowledgeIdsFromSources()
const relationIds = new Set()
const relationKeys = new Set()
for (const relation of relationData.relations || []) {
  assert(relation.id && relation.source && relation.target && relation.relation, '存在缺少 id/source/target/relation 的实践关系')
  assert(!relationIds.has(relation.id), `实践关系 ID 重复：${relation.id}`)
  relationIds.add(relation.id)
  assert(allowedRelations.has(relation.relation), `不允许的实践关系类型：${relation.relation}`)
  assert(!forbiddenRelations.has(relation.relation), `实践层禁止使用历史关系：${relation.relation}`)
  assert(ids.has(relation.source), `实践关系 source 不是已登记实践卡：${relation.source}`)

  if (String(relation.target).startsWith('practice.')) assert(ids.has(relation.target), `实践关系 target 不存在：${relation.target}`)
  if (String(relation.target).startsWith('concept.') || String(relation.target).startsWith('method.') || String(relation.target).startsWith('classic.')) {
    assert(knowledgeIds.has(relation.target), `实践关系知识端点不在 V3 源节点：${relation.target}`)
  }
  if (relation.relation === 'safety_constrained_by') assert(String(relation.target).startsWith('policy.'), `安全约束目标必须是 policy.*：${relation.target}`)

  const key = `${relation.source}|${relation.relation}|${relation.target}`
  assert(!relationKeys.has(key), `重复实践关系：${key}`)
  relationKeys.add(key)
}

const component = existsSync(COMPONENT_FILE) ? readFileSync(COMPONENT_FILE, 'utf8') : ''
const model = existsSync(MODEL_FILE) ? readFileSync(MODEL_FILE, 'utf8') : ''
const stats = existsSync(STATS_FILE) ? readFileSync(STATS_FILE, 'utf8') : ''
const safety = existsSync(SAFETY_FILE) ? readFileSync(SAFETY_FILE, 'utf8') : ''
const ai = existsSync(AI_FILE) ? readFileSync(AI_FILE, 'utf8') : ''
const packageJson = existsSync(PACKAGE_FILE) ? JSON.parse(readFileSync(PACKAGE_FILE, 'utf8')) : { scripts: {} }
const clientCode = [component, model, stats, safety, ai].join('\n')

assert(model.includes('wendaozhi.practice.records.v1'), '数据模型缺少版本化本地存储键')
assert(model.includes('SCHEMA_VERSION'), '数据模型缺少 SCHEMA_VERSION')
assert(model.includes('mergeImportPayload'), '数据模型缺少导入合并规则')
assert(stats.includes('aggregateRecent'), '统计模块缺少 aggregateRecent')
assert(stats.includes('overLimitCount'), '统计模块缺少超审查上限统计')
assert(safety.includes('buildSafetyReview'), '安全模块缺少 buildSafetyReview')
assert(safety.includes('reviewDraftSafety'), '安全模块缺少填写期安全核对')
assert(ai.includes('buildAiPrompt'), 'AI 模块缺少 buildAiPrompt')
assert(!/\bfetch\s*\(|XMLHttpRequest|axios\s*\./.test(clientCode), '实践记录第一阶段不得包含自动网络上传代码')
assert(component.includes('exportPayload') && component.includes('mergeImportPayload'), 'PracticeJournal 应使用统一 JSON 数据模型')
assert(component.includes('buildSafetyReview'), 'PracticeJournal 应使用独立安全规则')
assert(component.includes('buildAiPrompt'), 'PracticeJournal 应使用独立 AI 摘要规则')
assert(packageJson.scripts?.['test:practice'], 'package.json 缺少 test:practice')
assert(String(packageJson.scripts?.test || '').includes('test:practice'), 'npm test 尚未纳入实践场景回归')

const practicePage = existsSync(PRACTICE_PAGE) ? readFileSync(PRACTICE_PAGE, 'utf8') : ''
const themeIndex = existsSync(THEME_INDEX) ? readFileSync(THEME_INDEX, 'utf8') : ''
assert(practicePage.includes('<PracticeJournal />'), '实践首页尚未挂载 PracticeJournal')
assert(themeIndex.includes("app.component('PracticeJournal'"), '主题入口尚未全局注册 PracticeJournal')

if (!process.exitCode) {
  console.log(`[实践体系检查] 通过：${files.length} 张实践卡，${relationData.relations.length} 条实践关系，4 个独立规则模块与自动场景测试有效。`)
}
