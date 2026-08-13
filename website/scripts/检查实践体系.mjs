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
const MIGRATION_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-migrations.mjs')
const STATS_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-stats.mjs')
const SAFETY_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-safety.mjs')
const AI_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-ai.mjs')
const STAGE_FILE = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'practice', 'practice-stage.mjs')
const TEST_FILE = path.join(WEBSITE_ROOT, 'tests', 'practice-journal.test.mjs')
const MIGRATION_TEST_FILE = path.join(WEBSITE_ROOT, 'tests', 'practice-migrations.test.mjs')
const PRACTICE_PAGE = path.join(WEBSITE_ROOT, 'docs', 'practice', 'index.md')
const THEME_INDEX = path.join(WEBSITE_ROOT, 'docs', '.vitepress', 'theme', 'index.ts')
const PACKAGE_FILE = path.join(WEBSITE_ROOT, 'package.json')
const GENERATOR_FILE = path.join(WEBSITE_ROOT, 'scripts', '生成网站页面.mjs')
const DAILY_E2E_FILE = path.join(WEBSITE_ROOT, 'scripts', 'e2e-practice-daily.mjs')

const requiredDocs = [
  '33-实践体系/实践系统设计方案-V0.2.md',
  '33-实践体系/实践卡规范-V1.0.md',
  '33-实践体系/基础修持路线-V1.0.md',
  '33-实践体系/记录与复盘规范-V1.0.md',
  '33-实践体系/实践问题与安全分流-V1.0.md',
  '33-实践体系/实践记录数据模型-V1.0.md',
  '33-实践体系/AI实践复盘规范-V1.0.md',
  '33-实践体系/知识与实践关系规范-V1.0.md',
  '33-实践体系/30天与阶段复盘规范-V1.0.md',
  '33-实践体系/实践记录Schema迁移规范-V1.0.md'
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
assert(existsSync(GENERATOR_FILE), '缺少网站页面生成器')
assert(existsSync(DAILY_E2E_FILE), '缺少今日修持 Chromium 回归脚本')
for (const [file, label] of [
  [MODEL_FILE, 'practice-model.mjs'],
  [MIGRATION_FILE, 'practice-migrations.mjs'],
  [STATS_FILE, 'practice-stats.mjs'],
  [SAFETY_FILE, 'practice-safety.mjs'],
  [AI_FILE, 'practice-ai.mjs'],
  [STAGE_FILE, 'practice-stage.mjs'],
  [TEST_FILE, 'practice-journal.test.mjs'],
  [MIGRATION_TEST_FILE, 'practice-migrations.test.mjs']
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
const migration = existsSync(MIGRATION_FILE) ? readFileSync(MIGRATION_FILE, 'utf8') : ''
const stats = existsSync(STATS_FILE) ? readFileSync(STATS_FILE, 'utf8') : ''
const safety = existsSync(SAFETY_FILE) ? readFileSync(SAFETY_FILE, 'utf8') : ''
const ai = existsSync(AI_FILE) ? readFileSync(AI_FILE, 'utf8') : ''
const stage = existsSync(STAGE_FILE) ? readFileSync(STAGE_FILE, 'utf8') : ''
const tests = existsSync(TEST_FILE) ? readFileSync(TEST_FILE, 'utf8') : ''
const migrationTests = existsSync(MIGRATION_TEST_FILE) ? readFileSync(MIGRATION_TEST_FILE, 'utf8') : ''
const generator = existsSync(GENERATOR_FILE) ? readFileSync(GENERATOR_FILE, 'utf8') : ''
const dailyE2E = existsSync(DAILY_E2E_FILE) ? readFileSync(DAILY_E2E_FILE, 'utf8') : ''
const packageJson = existsSync(PACKAGE_FILE) ? JSON.parse(readFileSync(PACKAGE_FILE, 'utf8')) : { scripts: {} }
const clientCode = [component, model, migration, stats, safety, ai, stage].join('\n')

assert(model.includes('wendaozhi.practice.records.v1'), '数据模型缺少版本化本地存储键')
assert(model.includes('SCHEMA_VERSION'), '数据模型缺少 SCHEMA_VERSION')
assert(model.includes('mergeImportPayload'), '数据模型缺少导入合并规则')
assert(model.includes('migrateEnvelope'), 'JSON导入尚未接入schema迁移器')
assert(migration.includes('PRACTICE_MIGRATIONS'), '迁移模块缺少显式迁移注册表')
assert(migration.includes('future_version'), '迁移模块缺少未来版本拒绝规则')
assert(migration.includes('missing_migration'), '迁移模块缺少迁移链断裂保护')
assert(stats.includes('aggregateRecent'), '统计模块缺少 aggregateRecent')
assert(stats.includes('overLimitCount'), '统计模块缺少超审查上限统计')
assert(safety.includes('buildSafetyReview'), '安全模块缺少 buildSafetyReview')
assert(safety.includes('reviewDraftSafety'), '安全模块缺少填写期安全核对')
assert(ai.includes('buildAiPrompt'), 'AI 模块缺少 buildAiPrompt')
assert(ai.includes('buildStageAiPrompt'), 'AI 模块缺少30天阶段复盘提示词')
assert(stage.includes('buildStageReview'), '阶段模块缺少 buildStageReview')
assert(stage.includes('buildThirtyDayDistribution'), '阶段模块缺少30天分布')
assert(stage.includes('discuss_diversion'), '阶段模块缺少“讨论分流而非自动解锁”判断')
assert(tests.includes('30天分布区分实际练习'), '实践测试尚未覆盖30天分布')
assert(tests.includes('不会自动给出分流'), '实践测试尚未覆盖记录不足时禁止自动分流')
assert(tests.includes('只允许讨论分流'), '实践测试尚未覆盖稳定状态下的非自动解锁规则')
assert(migrationTests.includes('未来 schema 版本拒绝自动降级'), 'schema测试尚未覆盖未来版本保护')
assert(migrationTests.includes('缺少逐版本迁移函数'), 'schema测试尚未覆盖迁移链缺失')
assert(migrationTests.includes('不修改输入对象'), 'schema测试尚未覆盖纯函数迁移要求')
assert(!/\bfetch\s*\(|XMLHttpRequest|axios\s*\./.test(clientCode), '实践记录第一阶段不得包含自动网络上传代码')
assert(component.includes('parseAndMigrateStored'), 'PracticeJournal 本地读取尚未接入schema迁移器')
assert(component.includes('exportPayload') && component.includes('mergeImportPayload'), 'PracticeJournal 应使用统一 JSON 数据模型')
assert(component.includes('buildSafetyReview'), 'PracticeJournal 应使用独立安全规则')
assert(component.includes('buildAiPrompt'), 'PracticeJournal 应使用独立 AI 摘要规则')
assert(component.includes('buildStageReview'), 'PracticeJournal 尚未接入30天阶段复盘')
assert(component.includes('30天与阶段'), 'PracticeJournal 缺少30天与阶段入口')
assert(component.includes('applyPracticeEntryFromUrl'), 'PracticeJournal 缺少实践卡反向预选入口')
assert(component.includes('URLSearchParams'), 'PracticeJournal 尚未解析 practice 查询参数')
assert(component.includes('id="practice-journal"'), 'PracticeJournal 缺少反向入口锚点 practice-journal')
assert(component.includes('entrySafety') && component.includes('aggregateRecent(records.value'), '实践卡 URL 入口必须先依据已载入记录计算安全状态')
assert(generator.includes('记录本次实践'), '实践详情生成器缺少“记录本次实践”反向入口')
assert(generator.includes('?practice=') && generator.includes('#practice-journal'), '实践详情生成器缺少 practice 参数或工作台锚点')
assert(dailyE2E.includes('双向实践卡导航'), '今日修持 Chromium 尚未覆盖双向实践卡导航')
assert(dailyE2E.includes('实践卡链接不能绕过安全状态'), '今日修持 Chromium 尚未覆盖 URL 参数安全覆盖')
assert(packageJson.scripts?.['test:practice'], 'package.json 缺少 test:practice')
assert(String(packageJson.scripts?.['test:practice'] || '').includes('practice-*.test.mjs'), 'test:practice 尚未覆盖全部实践测试文件')
assert(String(packageJson.scripts?.test || '').includes('test:practice'), 'npm test 尚未纳入实践场景回归')
assert(packageJson.scripts?.['test:e2e:daily'], 'package.json 缺少 test:e2e:daily')

const practicePage = existsSync(PRACTICE_PAGE) ? readFileSync(PRACTICE_PAGE, 'utf8') : ''
const themeIndex = existsSync(THEME_INDEX) ? readFileSync(THEME_INDEX, 'utf8') : ''
assert(practicePage.includes('<PracticeJournal />'), '实践首页尚未挂载 PracticeJournal')
assert(themeIndex.includes("app.component('PracticeJournal'"), '主题入口尚未全局注册 PracticeJournal')

if (!process.exitCode) {
  console.log(`[实践体系检查] 通过：${files.length} 张实践卡，${relationData.relations.length} 条实践关系，6 个规则模块、30天阶段复盘、schema迁移保护与双向实践导航有效。`)
}
