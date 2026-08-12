#!/usr/bin/env node

/**
 * 构建知识图谱.mjs
 *
 * 目标：
 * 1. 读取 knowledge-map-v3.yml 作为唯一构建清单；
 * 2. 扫描 expected_ids 对应目录中的 Markdown Front Matter；
 * 3. 校验节点 ID、类型、school_kind、关系端点、来源 ID 与对称关系重复；
 * 4. 生成 data/nodes.json、data/relations.json、data/graph.json、data/build-report.json；
 * 5. --check 模式只校验，不写文件，用于 CI 质量门。
 *
 * 说明：
 * - YAML 解析复用网站已安装的 gray-matter，不新增第二套解析依赖；
 * - Markdown 是节点内容主来源，独立关系 YAML 是图谱关系主来源；
 * - planned_nodes 允许被关系引用，但不会进入 nodes.json / graph.json 的展示节点。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fg from 'fast-glob'
import matter from 'gray-matter'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WEBSITE_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(WEBSITE_ROOT, '..')
const DATA_DIR = path.join(REPO_ROOT, 'data')
const CHECK_ONLY = process.argv.includes('--check')

const MANIFEST_PATH = path.join(REPO_ROOT, '00-项目规范', 'knowledge-map-v3.yml')

const ALLOWED_NODE_TYPES = new Set([
  'classic',
  'person',
  'school',
  'concept',
  'method',
  'stage',
  'route',
  'research'
])

const ALLOWED_SCHOOL_KINDS = new Set([
  'intellectual_tradition',
  'religious_order',
  'religious_tradition',
  'practice_tradition',
  'historiographic_category'
])

const ALLOWED_RELATIONS = new Set([
  'related_to',
  'source_of',
  'authored',
  'traditional_attribution',
  'founded',
  'influences',
  'develops',
  'belongs_to',
  'contains',
  'practices',
  'contrasts_with',
  'disputed_relation'
])

const SYMMETRIC_RELATIONS = new Set(['related_to', 'contrasts_with'])
const ALLOWED_VERIFICATION = new Set([
  'verified',
  'provisional',
  'partial',
  'disputed',
  'todo'
])

const errors = []
const warnings = []

function relPath(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/')
}

function fail(message) {
  errors.push(message)
}

function warn(message) {
  warnings.push(message)
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
}

/**
 * gray-matter 本身用于 Front Matter；给普通 YAML 文件临时加分隔符即可复用同一 YAML 引擎。
 */
function readYaml(filePath) {
  const raw = readText(filePath)
  try {
    return matter(`---\n${raw}\n---\n`).data
  } catch (err) {
    throw new Error(`${relPath(filePath)} YAML 解析失败：${err.message}`)
  }
}

function readMarkdownMeta(filePath) {
  const raw = readText(filePath)
  try {
    const parsed = matter(raw)
    if (!parsed.data || !parsed.data.id) return null
    return parsed.data
  } catch (err) {
    fail(`${relPath(filePath)} Front Matter 解析失败：${err.message}`)
    return null
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`)
  }
}

function arrayOf(value) {
  return Array.isArray(value) ? value : []
}

function normalizeScope(scope) {
  return String(scope || '').replace(/\s+/g, ' ').trim()
}

function relationKey(rel) {
  let source = rel.source
  let target = rel.target
  if (SYMMETRIC_RELATIONS.has(rel.relation) && source > target) {
    ;[source, target] = [target, source]
  }
  return [rel.relation, source, target, normalizeScope(rel.scope)].join('|')
}

function relationPairKey(rel) {
  let source = rel.source
  let target = rel.target
  if (SYMMETRIC_RELATIONS.has(rel.relation) && source > target) {
    ;[source, target] = [target, source]
  }
  return [rel.relation, source, target].join('|')
}

function collectSourceRefs(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceRefs(item, found)
    return found
  }
  if (!value || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    if (key === 'source_refs' && Array.isArray(child)) {
      for (const ref of child) found.push(String(ref))
    } else {
      collectSourceRefs(child, found)
    }
  }
  return found
}

function compactNode(meta, sourcePath) {
  const {
    relations: _relations,
    ...rest
  } = meta
  return {
    ...rest,
    source_path: sourcePath
  }
}

function writeJson(name, value) {
  mkdirSync(DATA_DIR, { recursive: true })
  const filePath = path.join(DATA_DIR, name)
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`找不到构建清单：${relPath(MANIFEST_PATH)}`)
  }

  const manifest = readYaml(MANIFEST_PATH)
  assertObject(manifest, 'knowledge-map-v3')

  const nodeSources = manifest.node_sources || {}
  const expected = new Map()
  const scanDirs = new Set()

  for (const [groupName, group] of Object.entries(nodeSources)) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.expected_ids)) continue
    if (!group.path) {
      fail(`node_sources.${groupName} 有 expected_ids 但缺少 path`)
      continue
    }
    const groupPath = String(group.path)
    scanDirs.add(groupPath)
    for (const id of group.expected_ids) {
      const nodeId = String(id)
      if (expected.has(nodeId)) {
        fail(`manifest 中正式节点 ID 重复：${nodeId}`)
        continue
      }
      expected.set(nodeId, {
        id: nodeId,
        group: groupName,
        path: groupPath,
        requiredField: group.required_field || null
      })
    }
  }

  const structuredById = new Map()
  const structuredFiles = []

  for (const dir of scanDirs) {
    const pattern = `${dir.replace(/\\/g, '/')}/**/*.md`
    const files = fg.sync(pattern, {
      cwd: REPO_ROOT,
      onlyFiles: true,
      unique: true
    })
    for (const file of files) {
      const abs = path.join(REPO_ROOT, file)
      const meta = readMarkdownMeta(abs)
      if (!meta) continue
      const id = String(meta.id)
      const record = { meta, file: file.split(path.sep).join('/') }
      structuredFiles.push(record)
      if (!structuredById.has(id)) structuredById.set(id, [])
      structuredById.get(id).push(record)
    }
  }

  const formalNodes = []
  const formalIds = new Set()

  for (const spec of expected.values()) {
    const matches = structuredById.get(spec.id) || []
    if (matches.length === 0) {
      fail(`正式节点 ${spec.id} 未在 ${spec.path} 找到带 Front Matter 的文件`)
      continue
    }
    if (matches.length > 1) {
      fail(`正式节点 ID ${spec.id} 出现 ${matches.length} 次：${matches.map((x) => x.file).join('、')}`)
      continue
    }

    const { meta, file } = matches[0]
    const actualDir = file.split('/').slice(0, -1).join('/')
    const expectedDir = spec.path.replace(/\\/g, '/')
    if (!(actualDir === expectedDir || actualDir.startsWith(`${expectedDir}/`))) {
      fail(`节点 ${spec.id} 位于 ${file}，不在 manifest 指定目录 ${spec.path}`)
    }

    if (!meta.type || !ALLOWED_NODE_TYPES.has(String(meta.type))) {
      fail(`${file} 的 type 无效：${meta.type ?? '缺失'}`)
    }
    if (!meta.name) fail(`${file} 缺少 name`)
    if (!meta.status) fail(`${file} 缺少 status`)

    if (String(meta.type) === 'school') {
      if (!meta.school_kind) {
        fail(`${file} 是 school 节点但缺少 school_kind`)
      } else if (!ALLOWED_SCHOOL_KINDS.has(String(meta.school_kind))) {
        fail(`${file} 的 school_kind 无效：${meta.school_kind}`)
      }
    }

    if (spec.requiredField && meta[spec.requiredField] == null) {
      fail(`${file} 缺少 manifest 要求字段 ${spec.requiredField}`)
    }

    formalIds.add(spec.id)
    formalNodes.push(compactNode(meta, file))
  }

  for (const record of structuredFiles) {
    if (!expected.has(String(record.meta.id))) {
      warn(`发现带结构化 id 但未进入 expected_ids 的节点：${record.meta.id}（${record.file}）`)
    }
  }

  const plannedNodes = arrayOf(manifest.planned_nodes).map((node) => ({
    ...node,
    planned: true
  }))
  const plannedIds = new Set()
  for (const node of plannedNodes) {
    const id = String(node.id || '')
    if (!id) {
      fail('planned_nodes 中存在缺少 id 的项目')
      continue
    }
    if (formalIds.has(id)) fail(`节点 ${id} 同时出现在正式节点与 planned_nodes`)
    if (plannedIds.has(id)) fail(`planned_nodes ID 重复：${id}`)
    plannedIds.add(id)
    if (!node.type || !ALLOWED_NODE_TYPES.has(String(node.type))) {
      fail(`planned 节点 ${id} 的 type 无效：${node.type ?? '缺失'}`)
    }
    if (String(node.type) === 'school' && node.school_kind && !ALLOWED_SCHOOL_KINDS.has(String(node.school_kind))) {
      fail(`planned school ${id} 的 school_kind 无效：${node.school_kind}`)
    }
  }

  const allKnownIds = new Set([...formalIds, ...plannedIds])

  // 来源注册表
  const sourceRegistryPath = path.join(REPO_ROOT, manifest.source_registry?.path || '')
  if (!manifest.source_registry?.path || !existsSync(sourceRegistryPath)) {
    fail(`来源注册表不存在：${manifest.source_registry?.path || '未配置'}`)
  }

  const sourceIds = new Set()
  const canonicalSourceIds = new Set()
  let sourceRegistry = { sources: [] }
  if (existsSync(sourceRegistryPath)) {
    sourceRegistry = readYaml(sourceRegistryPath)
    const registryVersion = String(sourceRegistry.version ?? '')
    const expectedVersion = manifest.source_registry?.version == null
      ? ''
      : String(manifest.source_registry.version)
    if (expectedVersion && registryVersion !== expectedVersion) {
      fail(`来源注册表版本不一致：manifest=${expectedVersion}，registry=${registryVersion}`)
    }

    for (const source of arrayOf(sourceRegistry.sources)) {
      const canonical = String(source.canonical_id || '')
      if (!canonical) {
        fail('来源注册表存在缺少 canonical_id 的项目')
        continue
      }
      if (canonicalSourceIds.has(canonical)) fail(`canonical source ID 重复：${canonical}`)
      canonicalSourceIds.add(canonical)
      if (sourceIds.has(canonical)) fail(`来源 ID/别名冲突：${canonical}`)
      sourceIds.add(canonical)
      for (const aliasRaw of arrayOf(source.aliases)) {
        const alias = String(aliasRaw)
        if (sourceIds.has(alias)) fail(`来源别名重复或与主 ID 冲突：${alias}`)
        sourceIds.add(alias)
      }
    }
  }

  // 节点自身声明的 source.id 也允许被本节点 claim / relation 引用。
  for (const node of formalNodes) {
    for (const source of arrayOf(node.sources)) {
      if (source?.id) sourceIds.add(String(source.id))
    }
  }

  // 校验节点 Front Matter 内部引用。
  for (const node of formalNodes) {
    for (const rel of arrayOf(node.relations)) {
      // compactNode 已移除 relations，因此这里只保留兼容；当前不会进入。
      void rel
    }
    for (const ref of collectSourceRefs(node)) {
      if (!sourceIds.has(ref)) fail(`${node.id} 引用了未注册来源：${ref}`)
    }
  }

  // 独立关系文件是图谱关系主来源。
  const relations = []
  const relationIds = new Set()
  const relationKeys = new Map()
  const symmetricPairs = new Map()

  for (const sourceSpec of arrayOf(manifest.relation_sources)) {
    if (!sourceSpec?.path) {
      fail('relation_sources 中存在缺少 path 的项目')
      continue
    }
    const relationPath = path.join(REPO_ROOT, String(sourceSpec.path))
    if (!existsSync(relationPath)) {
      fail(`关系文件不存在：${sourceSpec.path}`)
      continue
    }
    const relationFile = readYaml(relationPath)
    for (const rel of arrayOf(relationFile.relations)) {
      const id = String(rel.id || '')
      const source = String(rel.source || '')
      const target = String(rel.target || '')
      const relation = String(rel.relation || '')
      const originFile = String(sourceSpec.path)

      if (!id) fail(`${originFile} 存在缺少 id 的关系`)
      else if (relationIds.has(id)) fail(`关系 ID 重复：${id}`)
      else relationIds.add(id)

      if (!source) fail(`${id || originFile} 缺少 source`)
      if (!target) fail(`${id || originFile} 缺少 target`)
      if (!relation || !ALLOWED_RELATIONS.has(relation)) {
        fail(`${id || originFile} 的 relation 无效：${relation || '缺失'}`)
      }

      if (source && !allKnownIds.has(source)) fail(`${id} source 端点不存在：${source}`)
      if (target && !allKnownIds.has(target)) fail(`${id} target 端点不存在：${target}`)

      if (rel.verification && !ALLOWED_VERIFICATION.has(String(rel.verification))) {
        fail(`${id} 的 verification 无效：${rel.verification}`)
      }

      for (const ref of arrayOf(rel.source_refs)) {
        if (!sourceIds.has(String(ref))) fail(`${id} 引用了未注册来源：${ref}`)
      }

      const normalized = {
        ...rel,
        id,
        source,
        target,
        relation,
        source_status: formalIds.has(source) ? 'formal' : (plannedIds.has(source) ? 'planned' : 'unknown'),
        target_status: formalIds.has(target) ? 'formal' : (plannedIds.has(target) ? 'planned' : 'unknown'),
        source_file: originFile
      }

      const key = relationKey(normalized)
      if (relationKeys.has(key)) {
        fail(`重复关系：${id} 与 ${relationKeys.get(key)}（${relation} ${source} ↔ ${target}，scope 相同）`)
      } else {
        relationKeys.set(key, id)
      }

      if (SYMMETRIC_RELATIONS.has(relation)) {
        const pairKey = relationPairKey(normalized)
        if (!symmetricPairs.has(pairKey)) symmetricPairs.set(pairKey, [])
        symmetricPairs.get(pairKey).push({ id, scope: normalizeScope(rel.scope) })
      }

      relations.push(normalized)
    }
  }

  for (const [pair, entries] of symmetricPairs) {
    if (entries.length > 1) {
      const distinctScopes = new Set(entries.map((x) => x.scope))
      if (distinctScopes.size > 1) {
        warn(`对称关系同一节点对存在 ${entries.length} 条不同 scope：${pair}（${entries.map((x) => x.id).join('、')}）`)
      }
    }
  }

  formalNodes.sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'))
  relations.sort((a, b) => a.id.localeCompare(b.id, 'en'))

  const graphNodes = formalNodes.map((node) => ({
    id: node.id,
    type: node.type,
    name: node.name,
    summary: node.summary || '',
    status: node.status,
    school_kind: node.school_kind || undefined,
    source_path: node.source_path
  }))

  const graphRelations = relations
    .filter((rel) => rel.source_status === 'formal' && rel.target_status === 'formal')
    .map(({ source_file: _sourceFile, source_status: _ss, target_status: _ts, ...rel }) => rel)

  const buildReport = {
    manifest_version: String(manifest.version || ''),
    source_registry_version: String(sourceRegistry.version || ''),
    formal_nodes: formalNodes.length,
    planned_nodes: plannedNodes.length,
    relations_total: relations.length,
    relations_displayable: graphRelations.length,
    relation_files: arrayOf(manifest.relation_sources).map((x) => x.path),
    warnings
  }

  if (warnings.length) {
    console.warn(`[图谱校验] ${warnings.length} 个警告：`)
    for (const message of warnings) console.warn(`  - ${message}`)
  }

  if (errors.length) {
    console.error(`[图谱校验失败] ${errors.length} 个错误：`)
    for (const message of errors) console.error(`  - ${message}`)
    process.exit(1)
  }

  console.log(`[图谱校验通过] 正式节点 ${formalNodes.length}，计划节点 ${plannedNodes.length}，关系 ${relations.length}，可展示关系 ${graphRelations.length}`)

  if (CHECK_ONLY) {
    console.log('[图谱校验] --check 模式，不写入 data/。')
    return
  }

  writeJson('nodes.json', {
    version: String(manifest.version || ''),
    nodes: formalNodes
  })
  writeJson('relations.json', {
    version: String(manifest.version || ''),
    relations
  })
  writeJson('graph.json', {
    version: String(manifest.version || ''),
    nodes: graphNodes,
    relations: graphRelations
  })
  writeJson('build-report.json', buildReport)

  console.log(`[图谱构建完成] 输出目录：${relPath(DATA_DIR)}/`)
}

try {
  main()
} catch (err) {
  console.error(`[图谱构建失败] ${err.message}`)
  process.exit(1)
}
