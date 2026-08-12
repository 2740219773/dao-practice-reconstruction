import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import fg from 'fast-glob'

const WEBSITE_ROOT = process.cwd()
const REPO_ROOT = path.resolve(WEBSITE_ROOT, '..')
const PRACTICE_DIR = path.join(REPO_ROOT, '33-实践体系', '实践卡')
const RELATION_FILE = path.join(REPO_ROOT, '33-实践体系', '实践关系-v1.json')
const COMPONENT_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'components', 'PracticeJournal.vue')
const PRACTICE_PAGE = path.join(WEBSITE_ROOT, 'docs', 'practice', 'index.md')
const THEME_INDEX = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'index.ts')

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
    } catch (e) {
      fail(`无法读取 V3 源文件 ${rel}：${e?.message || e}`)
    }
  }
  assert(ids.size > 0, '未从 V3 源 Markdown 读取到任何节点 ID')
  return ids
}

for (const rel of requiredDocs) assert(existsSync(path.join(REPO_ROOT, rel)), `缺少规范文件：${rel}`)
assert(existsSync(PRACTICE_DIR), '缺少 33-实践体系/实践卡 目录')
assert(existsSync(RELATION_FILE), '缺少 33-实践体系/实践关系-v1.json')
assert(existsSync(COMPONENT_FILE), '缺少 PracticeJournal.vue')

const files = existsSync(PRACTICE_DIR)
  ? readdirSync(PRACTICE_DIR).filter((f) => /^PRAC-\d+-.+\.md$/u.test(f)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  : []

assert(files.length >= 8, `基础实践卡少于 8 张，当前 ${files.length}`)

const ids = new Set()
const slugs = new Set()
const sequences = []

for (const file of files) {
  const parsed = matter(readFileSync(path.join(PRACTICE_DIR, file), 'utf8').replace(/^\uFEFF/, ''))
  const y = parsed.data || {}
  const missing = requiredFields.filter((k) => y[k] === undefined || y[k] === null || y[k] === '')
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

  const d = y.duration_minutes || {}
  assert(Number.isFinite(Number(d.min)) && Number.isFinite(Number(d.typical)) && Number.isFinite(Number(d.max)), `${file} 时长字段必须为数字`)
  assert(Number(d.min) <= Number(d.typical) && Number(d.typical) <= Number(d.max), `${file} 时长必须满足 min <= typical <= max`)
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
for (const r of relationData.relations || []) {
  assert(r.id && r.source && r.target && r.relation, '存在缺少 id/source/target/relation 的实践关系')
  assert(!relationIds.has(r.id), `实践关系 ID 重复：${r.id}`)
  relationIds.add(r.id)
  assert(allowedRelations.has(r.relation), `不允许的实践关系类型：${r.relation}`)
  assert(!forbiddenRelations.has(r.relation), `实践层禁止使用历史关系：${r.relation}`)
  assert(ids.has(r.source), `实践关系 source 不是已登记实践卡：${r.source}`)

  if (String(r.target).startsWith('practice.')) assert(ids.has(r.target), `实践关系 target 不存在：${r.target}`)
  if (String(r.target).startsWith('concept.') || String(r.target).startsWith('method.') || String(r.target).startsWith('classic.')) {
    assert(knowledgeIds.has(r.target), `实践关系知识端点不在 V3 源节点：${r.target}`)
  }
  if (r.relation === 'safety_constrained_by') assert(String(r.target).startsWith('policy.'), `安全约束目标必须是 policy.*：${r.target}`)

  const key = `${r.source}|${r.relation}|${r.target}`
  assert(!relationKeys.has(key), `重复实践关系：${key}`)
  relationKeys.add(key)
}

const component = existsSync(COMPONENT_FILE) ? readFileSync(COMPONENT_FILE, 'utf8') : ''
assert(component.includes('wendaozhi.practice.records.v1'), 'PracticeJournal 缺少版本化本地存储键')
assert(component.includes('schemaVersion'), 'PracticeJournal 缺少 schemaVersion')
assert(!/\bfetch\s*\(|XMLHttpRequest|axios\s*\./.test(component), 'PracticeJournal 第一阶段不得包含自动网络上传代码')
assert(component.includes('JSON'), 'PracticeJournal 应支持 JSON 数据管理')
assert(component.includes('AI 复盘'), 'PracticeJournal 应包含 AI 复盘材料入口')

const practicePage = existsSync(PRACTICE_PAGE) ? readFileSync(PRACTICE_PAGE, 'utf8') : ''
const themeIndex = existsSync(THEME_INDEX) ? readFileSync(THEME_INDEX, 'utf8') : ''
assert(practicePage.includes('<PracticeJournal />'), '实践首页尚未挂载 PracticeJournal')
assert(themeIndex.includes("app.component('PracticeJournal'"), '主题入口尚未全局注册 PracticeJournal')

if (!process.exitCode) {
  console.log(`[实践体系检查] 通过：${files.length} 张实践卡，${relationData.relations.length} 条实践关系，V3 源端点与本地隐私约束有效。`)
}
