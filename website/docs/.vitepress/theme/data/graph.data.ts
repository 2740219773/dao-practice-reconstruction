import { defineLoader } from 'vitepress'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './_lib/读取知识卡.ts'

export interface GraphNode {
  id: string
  type: string
  name: string
  summary: string
  status: string
  school_kind?: string
  source_path: string
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

export default defineLoader({
  watch: [new URL('../../../../../data/graph.json', import.meta.url).pathname],
  load(): GraphData {
    const file = path.join(REPO_ROOT, 'data', 'graph.json')
    if (!existsSync(file)) {
      throw new Error('缺少 data/graph.json，请先运行 npm run graph。')
    }
    return JSON.parse(readFileSync(file, 'utf8')) as GraphData
  }
})
