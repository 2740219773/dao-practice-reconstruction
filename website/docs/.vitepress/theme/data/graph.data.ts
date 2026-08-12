import { defineLoader } from 'vitepress'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './_lib/读取知识卡.ts'

export interface GraphSource {
  id: string
  type?: string
  name?: string
  reference?: string
  evidence?: string
}

export interface GraphClaim {
  text: string
  evidence?: string
  source_refs?: string[]
  status?: string
}

export interface GraphNode {
  id: string
  type: string
  name: string
  summary: string
  status: string
  school_kind?: string
  source_path: string
  tags?: string[]
  sources?: GraphSource[]
  claims?: GraphClaim[]
  [key: string]: unknown
}

export interface GraphRelation {
  id: string
  source: string
  target: string
  relation: string
  scope?: string
  evidence?: string
  verification?: string
  source_refs?: string[]
}

export interface GraphData {
  version: string
  nodes: GraphNode[]
  relations: GraphRelation[]
}

declare const data: GraphData
export { data }

function readJson(file: string) {
  if (!existsSync(file)) throw new Error(`缺少 ${path.relative(REPO_ROOT, file)}，请先运行 npm run graph。`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function loadGraphData(): GraphData {
  const graphFile = path.join(REPO_ROOT, 'data', 'graph.json')
  const nodesFile = path.join(REPO_ROOT, 'data', 'nodes.json')
  const graph = readJson(graphFile) as GraphData
  const nodeBundle = readJson(nodesFile) as { version: string; nodes: GraphNode[] }
  const fullById = new Map(nodeBundle.nodes.map((node) => [node.id, node]))

  return {
    version: graph.version,
    nodes: graph.nodes.map((node) => ({ ...node, ...(fullById.get(node.id) || {}) })),
    relations: graph.relations
  }
}

export default defineLoader({
  watch: [
    new URL('../../../../../data/graph.json', import.meta.url).pathname,
    new URL('../../../../../data/nodes.json', import.meta.url).pathname
  ],
  load: loadGraphData
})
