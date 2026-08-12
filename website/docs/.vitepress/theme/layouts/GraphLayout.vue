<script setup lang="ts">
import { computed, ref } from 'vue'
import { data as graph } from '../data/graph.data'
import type { GraphNode, GraphRelation } from '../data/graph.data'

const VIEW_W = 1200
const VIEW_H = 760

const TYPE_META: Record<string, { label: string; x: number; y: number; radius: number }> = {
  concept: { label: '核心概念', x: 600, y: 360, radius: 130 },
  classic: { label: '经典', x: 260, y: 215, radius: 105 },
  person: { label: '人物', x: 600, y: 125, radius: 100 },
  school: { label: '传统与流派', x: 940, y: 215, radius: 105 },
  method: { label: '方法与实践', x: 600, y: 630, radius: 125 },
  stage: { label: '阶段', x: 280, y: 565, radius: 90 },
  route: { label: '路线', x: 920, y: 565, radius: 90 },
  research: { label: '研究', x: 1020, y: 430, radius: 80 }
}

const RELATION_LABELS: Record<string, string> = {
  related_to: '一般关联',
  source_of: '文本来源',
  authored: '著作关系',
  traditional_attribution: '传统归属',
  founded: '创建',
  influences: '历史影响',
  develops: '发展/展开',
  belongs_to: '归属',
  contains: '包含',
  practices: '实践',
  contrasts_with: '对照',
  disputed_relation: '争议关系'
}

const SCHOOL_KIND_LABELS: Record<string, string> = {
  intellectual_tradition: '思想传统',
  religious_order: '宗教宗派',
  religious_tradition: '宗教传统',
  practice_tradition: '修炼传统',
  historiographic_category: '研究分类'
}

const query = ref('')
const selectedId = ref<string>('')
const activeTypes = ref(new Set(graph.nodes.map((n) => n.type)))

const nodeMap = computed(() => new Map(graph.nodes.map((n) => [n.id, n])))

const typeCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const node of graph.nodes) counts.set(node.type, (counts.get(node.type) || 0) + 1)
  return counts
})

const availableTypes = computed(() =>
  [...typeCounts.value.keys()]
    .sort((a, b) => (TYPE_META[a]?.label || a).localeCompare(TYPE_META[b]?.label || b, 'zh-CN'))
)

const positions = computed(() => {
  const map = new Map<string, { x: number; y: number }>()
  const groups = new Map<string, GraphNode[]>()

  for (const node of graph.nodes) {
    if (!groups.has(node.type)) groups.set(node.type, [])
    groups.get(node.type)!.push(node)
  }

  for (const [type, nodes] of groups) {
    nodes.sort((a, b) => a.id.localeCompare(b.id, 'en'))
    const meta = TYPE_META[type] || { label: type, x: 600, y: 380, radius: 100 }
    const count = nodes.length

    if (count === 1) {
      map.set(nodes[0].id, { x: meta.x, y: meta.y })
      continue
    }

    nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count
      const radius = meta.radius * (count > 7 && index % 2 ? 0.72 : 1)
      map.set(node.id, {
        x: meta.x + Math.cos(angle) * radius,
        y: meta.y + Math.sin(angle) * radius
      })
    })
  }

  return map
})

const visibleNodes = computed(() => graph.nodes.filter((node) => activeTypes.value.has(node.type)))
const visibleIds = computed(() => new Set(visibleNodes.value.map((node) => node.id)))
const visibleRelations = computed(() => graph.relations.filter((rel) => visibleIds.value.has(rel.source) && visibleIds.value.has(rel.target)))

const selectedNode = computed(() => nodeMap.value.get(selectedId.value) || null)
const selectedRelations = computed(() => {
  if (!selectedId.value) return []
  return graph.relations.filter((rel) => rel.source === selectedId.value || rel.target === selectedId.value)
})
const neighborIds = computed(() => {
  const ids = new Set<string>()
  for (const rel of selectedRelations.value) {
    ids.add(rel.source === selectedId.value ? rel.target : rel.source)
  }
  return ids
})

const searchMatches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return graph.nodes
    .filter((node) => `${node.name} ${node.summary} ${node.id}`.toLowerCase().includes(q))
    .slice(0, 8)
})

function typeLabel(type: string) {
  return TYPE_META[type]?.label || type
}

function relationLabel(relation: string) {
  return RELATION_LABELS[relation] || relation
}

function shortName(name: string) {
  return name.length > 6 ? `${name.slice(0, 5)}…` : name
}

function toggleType(type: string) {
  const next = new Set(activeTypes.value)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  activeTypes.value = next
  if (selectedNode.value && !next.has(selectedNode.value.type)) selectedId.value = ''
}

function selectNode(id: string) {
  selectedId.value = id
  query.value = ''
  const node = nodeMap.value.get(id)
  if (node && !activeTypes.value.has(node.type)) {
    activeTypes.value = new Set([...activeTypes.value, node.type])
  }
}

function resetView() {
  activeTypes.value = new Set(graph.nodes.map((n) => n.type))
  selectedId.value = ''
  query.value = ''
}

function isNodeDimmed(node: GraphNode) {
  if (selectedId.value) return node.id !== selectedId.value && !neighborIds.value.has(node.id)
  const q = query.value.trim().toLowerCase()
  if (!q) return false
  return !`${node.name} ${node.summary} ${node.id}`.toLowerCase().includes(q)
}

function isRelationDimmed(rel: GraphRelation) {
  if (!selectedId.value) return false
  return rel.source !== selectedId.value && rel.target !== selectedId.value
}

function sourceUrl(path: string) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/2740219773/dao-practice-reconstruction/blob/main/${encoded}`
}

function relationPeer(rel: GraphRelation) {
  const peerId = rel.source === selectedId.value ? rel.target : rel.source
  return nodeMap.value.get(peerId)
}
</script>

<template>
  <section class="graph-page">
    <header class="graph-hero">
      <div>
        <p class="graph-eyebrow">知识网络 · V{{ graph.version }}</p>
        <h1>知识图谱</h1>
        <p class="graph-intro">
          从概念、经典、人物、传统与方法之间的关系进入问道志。图中的连线表示经过关系规范审校的知识关系，不自动等同于师承、因果或修炼步骤。
        </p>
      </div>
      <div class="graph-stats" aria-label="图谱统计">
        <div><strong>{{ graph.nodes.length }}</strong><span>正式节点</span></div>
        <div><strong>{{ graph.relations.length }}</strong><span>规范关系</span></div>
        <div><strong>{{ availableTypes.length }}</strong><span>节点类别</span></div>
      </div>
    </header>

    <div class="graph-toolbar">
      <div class="graph-search-wrap">
        <label for="graph-search">查找节点</label>
        <input id="graph-search" v-model="query" type="search" placeholder="输入：静、庄子、内丹……" autocomplete="off" />
        <div v-if="query && searchMatches.length" class="graph-search-results">
          <button v-for="node in searchMatches" :key="node.id" type="button" @click="selectNode(node.id)">
            <span>{{ node.name }}</span><small>{{ typeLabel(node.type) }}</small>
          </button>
        </div>
      </div>

      <div class="graph-filters" aria-label="节点类型筛选">
        <button
          v-for="type in availableTypes"
          :key="type"
          type="button"
          :class="['graph-filter', `is-${type}`, { 'is-off': !activeTypes.has(type) }]"
          @click="toggleType(type)"
        >
          <span class="graph-filter__dot" />
          {{ typeLabel(type) }}
          <small>{{ typeCounts.get(type) }}</small>
        </button>
      </div>

      <button class="graph-reset" type="button" @click="resetView">重置视图</button>
    </div>

    <div class="graph-workspace">
      <div class="graph-canvas-card">
        <div class="graph-canvas-head">
          <span>点击任一节点查看它与周围节点的具体关系</span>
          <span>当前显示 {{ visibleNodes.length }} 个节点 / {{ visibleRelations.length }} 条关系</span>
        </div>

        <div class="graph-canvas-scroll">
          <svg class="graph-svg" :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`" role="img" aria-label="问道志知识图谱">
            <g class="graph-clusters" aria-hidden="true">
              <template v-for="type in availableTypes" :key="type">
                <g v-if="activeTypes.has(type) && TYPE_META[type]">
                  <circle
                    :cx="TYPE_META[type].x"
                    :cy="TYPE_META[type].y"
                    :r="TYPE_META[type].radius + 54"
                    :class="['cluster-halo', `is-${type}`]"
                  />
                  <text :x="TYPE_META[type].x" :y="TYPE_META[type].y - TYPE_META[type].radius - 34" class="cluster-label">
                    {{ TYPE_META[type].label }}
                  </text>
                </g>
              </template>
            </g>

            <g class="graph-edges">
              <line
                v-for="rel in visibleRelations"
                :key="rel.id"
                :x1="positions.get(rel.source)?.x"
                :y1="positions.get(rel.source)?.y"
                :x2="positions.get(rel.target)?.x"
                :y2="positions.get(rel.target)?.y"
                :class="['graph-edge', { 'is-dimmed': isRelationDimmed(rel), 'is-active': selectedId && !isRelationDimmed(rel) }]"
              >
                <title>{{ nodeMap.get(rel.source)?.name }} — {{ relationLabel(rel.relation) }} — {{ nodeMap.get(rel.target)?.name }}</title>
              </line>
            </g>

            <g class="graph-nodes">
              <g
                v-for="node in visibleNodes"
                :key="node.id"
                :transform="`translate(${positions.get(node.id)?.x || 0}, ${positions.get(node.id)?.y || 0})`"
                :class="['graph-node', `is-${node.type}`, { 'is-selected': selectedId === node.id, 'is-neighbor': neighborIds.has(node.id), 'is-dimmed': isNodeDimmed(node) }]"
                role="button"
                tabindex="0"
                :aria-label="`${node.name}，${typeLabel(node.type)}`"
                @click="selectNode(node.id)"
                @keydown.enter.prevent="selectNode(node.id)"
                @keydown.space.prevent="selectNode(node.id)"
              >
                <circle r="24" />
                <text text-anchor="middle" dy="4">{{ shortName(node.name) }}</text>
                <title>{{ node.name }}：{{ node.summary }}</title>
              </g>
            </g>
          </svg>
        </div>
      </div>

      <aside class="graph-detail" aria-live="polite">
        <template v-if="selectedNode">
          <div class="graph-detail__type">{{ typeLabel(selectedNode.type) }}</div>
          <h2>{{ selectedNode.name }}</h2>
          <p class="graph-detail__summary">{{ selectedNode.summary || '该节点摘要正在整理。' }}</p>

          <dl class="graph-detail__meta">
            <div><dt>节点 ID</dt><dd>{{ selectedNode.id }}</dd></div>
            <div v-if="selectedNode.school_kind"><dt>传统类型</dt><dd>{{ SCHOOL_KIND_LABELS[selectedNode.school_kind] || selectedNode.school_kind }}</dd></div>
            <div><dt>关联数量</dt><dd>{{ selectedRelations.length }}</dd></div>
          </dl>

          <div class="graph-detail__relations">
            <h3>直接关系</h3>
            <button
              v-for="rel in selectedRelations"
              :key="rel.id"
              type="button"
              class="graph-relation-row"
              @click="relationPeer(rel) && selectNode(relationPeer(rel)!.id)"
            >
              <span class="graph-relation-row__name">{{ relationPeer(rel)?.name || '未知节点' }}</span>
              <span class="graph-relation-row__kind">{{ relationLabel(rel.relation) }}</span>
              <small v-if="rel.scope">{{ rel.scope }}</small>
            </button>
          </div>

          <a class="graph-source-link" :href="sourceUrl(selectedNode.source_path)" target="_blank" rel="noopener">
            查看仓库中的节点原文 →
          </a>
        </template>

        <template v-else>
          <div class="graph-detail__empty-mark">图</div>
          <h2>从一个节点开始</h2>
          <p>选择图中的概念、经典、人物、传统或方法，右侧会显示它的直接关系与关系语义。</p>
          <div class="graph-detail__guide">
            <strong>如何读这张图</strong>
            <span>连线是知识关系，不默认表示传承。</span>
            <span>点击节点后，仅高亮它的一阶关系。</span>
            <span>关系的具体适用范围以右侧说明和来源为准。</span>
          </div>
        </template>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.graph-page { max-width: 1480px; margin: 0 auto; padding: 54px 28px 72px; }
.graph-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 44px; align-items: end; padding: 22px 0 30px; border-bottom: 1px solid var(--wdz-border, #d9d5ca); }
.graph-eyebrow { margin: 0 0 10px; color: #8a5f45; font-size: 13px; letter-spacing: .18em; }
.graph-hero h1 { margin: 0; font-size: clamp(34px, 5vw, 56px); font-weight: 540; letter-spacing: .04em; }
.graph-intro { max-width: 760px; margin: 16px 0 0; color: #66645e; line-height: 1.85; }
.graph-stats { display: flex; gap: 10px; }
.graph-stats div { min-width: 92px; padding: 14px 16px; border: 1px solid #ddd8cc; background: rgba(255,255,255,.48); text-align: center; }
.graph-stats strong { display: block; font-size: 24px; font-weight: 560; }
.graph-stats span { display: block; margin-top: 3px; color: #817e76; font-size: 12px; }

.graph-toolbar { display: grid; grid-template-columns: minmax(260px, 360px) 1fr auto; gap: 18px; align-items: end; padding: 22px 0 18px; }
.graph-search-wrap { position: relative; }
.graph-search-wrap label { display: block; margin-bottom: 7px; color: #78746b; font-size: 12px; }
.graph-search-wrap input { width: 100%; box-sizing: border-box; border: 1px solid #d9d4c8; border-radius: 3px; padding: 10px 12px; background: rgba(255,255,255,.72); color: inherit; font: inherit; outline: none; }
.graph-search-wrap input:focus { border-color: #8d7666; box-shadow: 0 0 0 2px rgba(141,118,102,.1); }
.graph-search-results { position: absolute; z-index: 10; left: 0; right: 0; top: calc(100% + 6px); padding: 6px; border: 1px solid #d7d1c4; background: #fbfaf6; box-shadow: 0 12px 30px rgba(54,48,39,.12); }
.graph-search-results button { display: flex; width: 100%; justify-content: space-between; gap: 12px; padding: 9px 10px; border: 0; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.graph-search-results button:hover { background: #f0eee7; }
.graph-search-results small { color: #8a867e; }
.graph-filters { display: flex; gap: 7px; flex-wrap: wrap; }
.graph-filter, .graph-reset { border: 1px solid #dad5ca; background: rgba(255,255,255,.55); color: #4f4c46; border-radius: 99px; padding: 8px 11px; cursor: pointer; font: inherit; font-size: 13px; }
.graph-filter { display: inline-flex; align-items: center; gap: 6px; }
.graph-filter small { color: #8a867c; }
.graph-filter.is-off { opacity: .38; filter: grayscale(1); }
.graph-filter__dot { width: 8px; height: 8px; border-radius: 50%; background: #6e756f; }
.graph-filter.is-classic .graph-filter__dot { background: #7d6a57; }
.graph-filter.is-person .graph-filter__dot { background: #876c65; }
.graph-filter.is-school .graph-filter__dot { background: #667778; }
.graph-filter.is-method .graph-filter__dot { background: #748063; }
.graph-filter.is-concept .graph-filter__dot { background: #596b72; }
.graph-reset { border-radius: 3px; white-space: nowrap; }

.graph-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: stretch; }
.graph-canvas-card, .graph-detail { border: 1px solid #dcd7cc; background: rgba(255,255,255,.42); }
.graph-canvas-head { display: flex; justify-content: space-between; gap: 16px; padding: 12px 16px; border-bottom: 1px solid #e2ded5; color: #7a766e; font-size: 12px; }
.graph-canvas-scroll { overflow: auto; }
.graph-svg { display: block; width: 100%; min-width: 820px; min-height: 610px; background: radial-gradient(circle at center, rgba(255,255,255,.5), rgba(247,245,239,.42)); }
.cluster-halo { fill: transparent; stroke-width: 1; stroke-dasharray: 3 8; opacity: .32; }
.cluster-halo.is-concept { stroke: #596b72; }
.cluster-halo.is-classic { stroke: #7d6a57; }
.cluster-halo.is-person { stroke: #876c65; }
.cluster-halo.is-school { stroke: #667778; }
.cluster-halo.is-method { stroke: #748063; }
.cluster-label { fill: #8a867d; font-size: 13px; text-anchor: middle; letter-spacing: .12em; }
.graph-edge { stroke: #aaa79f; stroke-width: 1.15; opacity: .42; transition: opacity .16s, stroke-width .16s; }
.graph-edge.is-active { stroke: #76695f; stroke-width: 2; opacity: .86; }
.graph-edge.is-dimmed { opacity: .07; }
.graph-node { cursor: pointer; outline: none; transition: opacity .16s; }
.graph-node circle { fill: #f4f3ef; stroke: #6e756f; stroke-width: 1.5; transition: r .16s, stroke-width .16s, fill .16s; }
.graph-node text { fill: #353632; font-size: 11px; font-weight: 560; pointer-events: none; }
.graph-node.is-classic circle { stroke: #7d6a57; fill: #f4efe8; }
.graph-node.is-person circle { stroke: #876c65; fill: #f3ece9; }
.graph-node.is-school circle { stroke: #667778; fill: #ebf0ef; }
.graph-node.is-method circle { stroke: #748063; fill: #eef1e9; }
.graph-node.is-concept circle { stroke: #596b72; fill: #eaf0f2; }
.graph-node.is-selected circle { r: 30px; stroke-width: 3; fill: #fffdf7; }
.graph-node.is-neighbor circle { stroke-width: 2.4; }
.graph-node.is-dimmed { opacity: .18; }
.graph-node:focus circle { stroke-width: 3; }

.graph-detail { min-height: 610px; padding: 24px 22px; box-sizing: border-box; }
.graph-detail__type { color: #876653; font-size: 12px; letter-spacing: .14em; }
.graph-detail h2 { margin: 7px 0 12px; font-size: 28px; font-weight: 540; }
.graph-detail__summary { color: #65625c; line-height: 1.8; font-size: 14px; }
.graph-detail__meta { margin: 18px 0; border-top: 1px solid #e0dcd2; border-bottom: 1px solid #e0dcd2; }
.graph-detail__meta div { display: grid; grid-template-columns: 72px 1fr; gap: 10px; padding: 9px 0; }
.graph-detail__meta div + div { border-top: 1px solid #ece8df; }
.graph-detail__meta dt { color: #8a867e; font-size: 12px; }
.graph-detail__meta dd { margin: 0; word-break: break-all; font-size: 12px; }
.graph-detail__relations h3 { margin: 0 0 8px; font-size: 14px; font-weight: 560; }
.graph-relation-row { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 10px 0; border: 0; border-top: 1px solid #ebe7df; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.graph-relation-row:hover .graph-relation-row__name { text-decoration: underline; text-underline-offset: 3px; }
.graph-relation-row__name { font-size: 14px; }
.graph-relation-row__kind { color: #805e49; font-size: 11px; }
.graph-relation-row small { grid-column: 1 / -1; color: #858078; line-height: 1.55; }
.graph-source-link { display: inline-block; margin-top: 20px; color: #6f5140; font-size: 13px; text-decoration: none; }
.graph-source-link:hover { text-decoration: underline; }
.graph-detail__empty-mark { width: 54px; height: 54px; display: grid; place-items: center; margin-bottom: 20px; border: 1px solid #8e8175; border-radius: 50%; color: #796555; font-family: serif; font-size: 24px; }
.graph-detail__guide { display: grid; gap: 10px; margin-top: 24px; padding-top: 18px; border-top: 1px solid #e0dcd2; color: #77736c; font-size: 13px; line-height: 1.65; }
.graph-detail__guide strong { color: #4c4944; font-weight: 560; }

@media (max-width: 980px) {
  .graph-page { padding: 36px 18px 54px; }
  .graph-hero { grid-template-columns: 1fr; gap: 22px; }
  .graph-stats { justify-content: flex-start; }
  .graph-toolbar { grid-template-columns: 1fr; }
  .graph-workspace { grid-template-columns: 1fr; }
  .graph-detail { min-height: auto; }
}

@media (max-width: 600px) {
  .graph-stats { width: 100%; }
  .graph-stats div { min-width: 0; flex: 1; padding: 11px 8px; }
  .graph-canvas-head { flex-direction: column; gap: 3px; }
}
</style>
