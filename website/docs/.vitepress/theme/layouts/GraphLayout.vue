<script setup lang="ts">
import { computed, ref } from 'vue'
import { data as graph } from '../data/graph.data'
import type { GraphNode, GraphRelation } from '../data/graph.data'

const W = 1200
const H = 760

const TYPES: Record<string, { label: string; x: number; y: number; r: number }> = {
  concept: { label: '核心概念', x: 600, y: 360, r: 130 },
  classic: { label: '经典', x: 260, y: 215, r: 105 },
  person: { label: '人物', x: 600, y: 125, r: 100 },
  school: { label: '传统与流派', x: 940, y: 215, r: 105 },
  method: { label: '方法与实践', x: 600, y: 630, r: 125 },
  stage: { label: '阶段', x: 280, y: 565, r: 90 },
  route: { label: '路线', x: 920, y: 565, r: 90 },
  research: { label: '研究', x: 1020, y: 430, r: 80 }
}

const REL: Record<string, string> = {
  related_to: '一般关联', source_of: '文本来源', authored: '著作关系',
  traditional_attribution: '传统归属', founded: '创建', influences: '历史影响',
  develops: '发展/展开', belongs_to: '归属', contains: '包含', practices: '实践',
  contrasts_with: '对照', disputed_relation: '争议关系'
}

const SCHOOL_KIND: Record<string, string> = {
  intellectual_tradition: '思想传统', religious_order: '宗教宗派',
  religious_tradition: '宗教传统', practice_tradition: '修炼传统',
  historiographic_category: '研究分类'
}

const SYMMETRIC = new Set(['related_to', 'contrasts_with'])
const query = ref('')
const selectedId = ref('')
const activeTypes = ref(new Set(graph.nodes.map((n) => n.type)))

const nodeMap = computed(() => new Map(graph.nodes.map((n) => [n.id, n])))
const typeCounts = computed(() => {
  const m = new Map<string, number>()
  graph.nodes.forEach((n) => m.set(n.type, (m.get(n.type) || 0) + 1))
  return m
})
const availableTypes = computed(() => [...typeCounts.value.keys()])

const positions = computed(() => {
  const out = new Map<string, { x: number; y: number }>()
  const groups = new Map<string, GraphNode[]>()
  graph.nodes.forEach((n) => {
    if (!groups.has(n.type)) groups.set(n.type, [])
    groups.get(n.type)!.push(n)
  })
  for (const [type, nodes] of groups) {
    nodes.sort((a, b) => a.id.localeCompare(b.id, 'en'))
    const meta = TYPES[type] || { label: type, x: 600, y: 380, r: 100 }
    if (nodes.length === 1) {
      out.set(nodes[0].id, { x: meta.x, y: meta.y })
      continue
    }
    nodes.forEach((n, i) => {
      const angle = -Math.PI / 2 + Math.PI * 2 * i / nodes.length
      const radius = meta.r * (nodes.length > 7 && i % 2 ? .72 : 1)
      out.set(n.id, { x: meta.x + Math.cos(angle) * radius, y: meta.y + Math.sin(angle) * radius })
    })
  }
  return out
})

const visibleNodes = computed(() => graph.nodes.filter((n) => activeTypes.value.has(n.type)))
const visibleIds = computed(() => new Set(visibleNodes.value.map((n) => n.id)))
const visibleRelations = computed(() => graph.relations.filter((r) => visibleIds.value.has(r.source) && visibleIds.value.has(r.target)))
const selectedNode = computed(() => nodeMap.value.get(selectedId.value) || null)
const selectedRelations = computed(() => selectedId.value
  ? graph.relations.filter((r) => r.source === selectedId.value || r.target === selectedId.value)
  : [])
const neighbors = computed(() => new Set(selectedRelations.value.map((r) => r.source === selectedId.value ? r.target : r.source)))
const searchMatches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return graph.nodes.filter((n) => `${n.name} ${n.summary} ${n.id}`.toLowerCase().includes(q)).slice(0, 8)
})

function typeLabel(type: string) { return TYPES[type]?.label || type }
function relationLabel(type: string) { return REL[type] || type }
function shortName(name: string) { return name.length > 6 ? `${name.slice(0, 5)}…` : name }
function peer(rel: GraphRelation) { return nodeMap.value.get(rel.source === selectedId.value ? rel.target : rel.source) || null }
function openPeer(rel: GraphRelation) { const p = peer(rel); if (p) selectNode(p.id) }
function directionLabel(rel: GraphRelation) {
  if (SYMMETRIC.has(rel.relation)) return `↔ ${relationLabel(rel.relation)}`
  return rel.source === selectedId.value ? `→ ${relationLabel(rel.relation)}` : `← ${relationLabel(rel.relation)}`
}
function toggleType(type: string) {
  const next = new Set(activeTypes.value)
  next.has(type) ? next.delete(type) : next.add(type)
  activeTypes.value = next
  if (selectedNode.value && !next.has(selectedNode.value.type)) selectedId.value = ''
}
function selectNode(id: string) {
  selectedId.value = id
  query.value = ''
  const n = nodeMap.value.get(id)
  if (n && !activeTypes.value.has(n.type)) activeTypes.value = new Set([...activeTypes.value, n.type])
}
function resetView() {
  activeTypes.value = new Set(graph.nodes.map((n) => n.type))
  selectedId.value = ''
  query.value = ''
}
function nodeDimmed(n: GraphNode) {
  if (selectedId.value) return n.id !== selectedId.value && !neighbors.value.has(n.id)
  const q = query.value.trim().toLowerCase()
  return q ? !`${n.name} ${n.summary} ${n.id}`.toLowerCase().includes(q) : false
}
function edgeDimmed(r: GraphRelation) { return !!selectedId.value && r.source !== selectedId.value && r.target !== selectedId.value }
function sourceUrl(p: string) { return `https://github.com/2740219773/dao-practice-reconstruction/blob/main/${p.split('/').map(encodeURIComponent).join('/')}` }
</script>

<template>
  <section class="graph-page">
    <header class="graph-hero">
      <div>
        <p class="eyebrow">知识网络 · V{{ graph.version }}</p>
        <h1>知识图谱</h1>
        <p class="intro">从概念、经典、人物、传统与方法之间的关系进入问道志。连线表示经过关系规范审校的知识关系，不自动等同于师承、因果或修炼步骤。</p>
      </div>
      <div class="stats">
        <div><strong>{{ graph.nodes.length }}</strong><span>正式节点</span></div>
        <div><strong>{{ graph.relations.length }}</strong><span>规范关系</span></div>
        <div><strong>{{ availableTypes.length }}</strong><span>节点类别</span></div>
      </div>
    </header>

    <div class="toolbar">
      <div class="search">
        <label for="graph-search">查找节点</label>
        <input id="graph-search" v-model="query" type="search" placeholder="输入：静、庄子、内丹……" autocomplete="off" />
        <div v-if="query && searchMatches.length" class="search-results">
          <button v-for="n in searchMatches" :key="n.id" type="button" @click="selectNode(n.id)"><span>{{ n.name }}</span><small>{{ typeLabel(n.type) }}</small></button>
        </div>
      </div>
      <div class="filters">
        <button v-for="type in availableTypes" :key="type" type="button" :class="['filter', `is-${type}`, { off: !activeTypes.has(type) }]" @click="toggleType(type)">
          <i />{{ typeLabel(type) }} <small>{{ typeCounts.get(type) }}</small>
        </button>
      </div>
      <button class="reset" type="button" @click="resetView">重置视图</button>
    </div>

    <div class="workspace">
      <div class="canvas-card">
        <div class="canvas-head"><span>点击节点查看一阶关系</span><span>当前 {{ visibleNodes.length }} 个节点 / {{ visibleRelations.length }} 条关系</span></div>
        <div class="canvas-scroll">
          <svg class="graph-svg" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="问道志知识图谱">
            <g aria-hidden="true">
              <template v-for="type in availableTypes" :key="type">
                <g v-if="activeTypes.has(type) && TYPES[type]">
                  <circle :cx="TYPES[type].x" :cy="TYPES[type].y" :r="TYPES[type].r + 54" :class="['halo', `is-${type}`]" />
                  <text :x="TYPES[type].x" :y="TYPES[type].y - TYPES[type].r - 34" class="cluster-label">{{ TYPES[type].label }}</text>
                </g>
              </template>
            </g>
            <g>
              <line v-for="r in visibleRelations" :key="r.id"
                :x1="positions.get(r.source)?.x" :y1="positions.get(r.source)?.y"
                :x2="positions.get(r.target)?.x" :y2="positions.get(r.target)?.y"
                :class="['edge', { dim: edgeDimmed(r), active: selectedId && !edgeDimmed(r) }]">
                <title>{{ nodeMap.get(r.source)?.name }} — {{ relationLabel(r.relation) }} — {{ nodeMap.get(r.target)?.name }}</title>
              </line>
            </g>
            <g>
              <g v-for="n in visibleNodes" :key="n.id"
                :transform="`translate(${positions.get(n.id)?.x || 0},${positions.get(n.id)?.y || 0})`"
                :class="['node', `is-${n.type}`, { selected: selectedId === n.id, neighbor: neighbors.has(n.id), dim: nodeDimmed(n) }]"
                role="button" tabindex="0" :aria-label="`${n.name}，${typeLabel(n.type)}`"
                @click="selectNode(n.id)" @keydown.enter.prevent="selectNode(n.id)" @keydown.space.prevent="selectNode(n.id)">
                <circle :r="selectedId === n.id ? 30 : 24" />
                <text text-anchor="middle" dy="4">{{ shortName(n.name) }}</text>
                <title>{{ n.name }}：{{ n.summary }}</title>
              </g>
            </g>
          </svg>
        </div>
      </div>

      <aside class="detail" aria-live="polite">
        <template v-if="selectedNode">
          <div class="detail-type">{{ typeLabel(selectedNode.type) }}</div>
          <h2>{{ selectedNode.name }}</h2>
          <p class="summary">{{ selectedNode.summary || '该节点摘要正在整理。' }}</p>
          <dl class="meta">
            <div><dt>节点 ID</dt><dd>{{ selectedNode.id }}</dd></div>
            <div v-if="selectedNode.school_kind"><dt>传统类型</dt><dd>{{ SCHOOL_KIND[selectedNode.school_kind] || selectedNode.school_kind }}</dd></div>
            <div><dt>关联数量</dt><dd>{{ selectedRelations.length }}</dd></div>
          </dl>
          <div class="relations">
            <h3>直接关系</h3>
            <button v-for="r in selectedRelations" :key="r.id" type="button" class="relation-row" @click="openPeer(r)">
              <span class="peer">{{ peer(r)?.name || '未知节点' }}</span>
              <span class="kind">{{ directionLabel(r) }}</span>
              <small v-if="r.scope">{{ r.scope }}</small>
            </button>
          </div>
          <a class="source-link" :href="sourceUrl(selectedNode.source_path)" target="_blank" rel="noopener">查看仓库中的节点原文 →</a>
        </template>
        <template v-else>
          <div class="empty-mark">图</div>
          <h2>从一个节点开始</h2>
          <p>选择图中的概念、经典、人物、传统或方法，右侧会显示它的直接关系与关系方向。</p>
          <div class="guide"><strong>如何读这张图</strong><span>↔ 表示对称关系。</span><span>→ / ← 保留有向关系方向。</span><span>关系范围以右侧说明和来源为准。</span></div>
        </template>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.graph-page{max-width:1480px;margin:auto;padding:54px 28px 72px}.graph-hero{display:grid;grid-template-columns:1fr auto;gap:44px;align-items:end;padding:22px 0 30px;border-bottom:1px solid #d9d5ca}.eyebrow{margin:0 0 10px;color:#8a5f45;font-size:13px;letter-spacing:.18em}.graph-hero h1{margin:0;font-size:clamp(34px,5vw,56px);font-weight:540;letter-spacing:.04em}.intro{max-width:760px;margin:16px 0 0;color:#66645e;line-height:1.85}.stats{display:flex;gap:10px}.stats div{min-width:92px;padding:14px 16px;border:1px solid #ddd8cc;background:#ffffff7a;text-align:center}.stats strong{display:block;font-size:24px;font-weight:560}.stats span{display:block;margin-top:3px;color:#817e76;font-size:12px}.toolbar{display:grid;grid-template-columns:minmax(260px,360px) 1fr auto;gap:18px;align-items:end;padding:22px 0 18px}.search{position:relative}.search label{display:block;margin-bottom:7px;color:#78746b;font-size:12px}.search input{width:100%;box-sizing:border-box;border:1px solid #d9d4c8;border-radius:3px;padding:10px 12px;background:#ffffffb8;color:inherit;font:inherit;outline:none}.search input:focus{border-color:#8d7666;box-shadow:0 0 0 2px #8d76661a}.search-results{position:absolute;z-index:10;left:0;right:0;top:calc(100% + 6px);padding:6px;border:1px solid #d7d1c4;background:#fbfaf6;box-shadow:0 12px 30px #362f271f}.search-results button{display:flex;width:100%;justify-content:space-between;gap:12px;padding:9px 10px;border:0;background:transparent;color:inherit;cursor:pointer;text-align:left}.search-results button:hover{background:#f0eee7}.search-results small{color:#8a867e}.filters{display:flex;gap:7px;flex-wrap:wrap}.filter,.reset{border:1px solid #dad5ca;background:#ffffff8c;color:#4f4c46;border-radius:99px;padding:8px 11px;cursor:pointer;font:inherit;font-size:13px}.filter{display:inline-flex;align-items:center;gap:6px}.filter small{color:#8a867c}.filter.off{opacity:.38;filter:grayscale(1)}.filter i{width:8px;height:8px;border-radius:50%;background:#6e756f}.filter.is-classic i{background:#7d6a57}.filter.is-person i{background:#876c65}.filter.is-school i{background:#667778}.filter.is-method i{background:#748063}.filter.is-concept i{background:#596b72}.reset{border-radius:3px;white-space:nowrap}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px}.canvas-card,.detail{border:1px solid #dcd7cc;background:#ffffff6b}.canvas-head{display:flex;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid #e2ded5;color:#7a766e;font-size:12px}.canvas-scroll{overflow:auto}.graph-svg{display:block;width:100%;min-width:820px;min-height:610px;background:radial-gradient(circle,#ffffff80,#f7f5ef6b)}.halo{fill:transparent;stroke-width:1;stroke-dasharray:3 8;opacity:.32}.halo.is-concept{stroke:#596b72}.halo.is-classic{stroke:#7d6a57}.halo.is-person{stroke:#876c65}.halo.is-school{stroke:#667778}.halo.is-method{stroke:#748063}.cluster-label{fill:#8a867d;font-size:13px;text-anchor:middle;letter-spacing:.12em}.edge{stroke:#aaa79f;stroke-width:1.15;opacity:.42;transition:.16s}.edge.active{stroke:#76695f;stroke-width:2;opacity:.86}.edge.dim{opacity:.07}.node{cursor:pointer;outline:none;transition:opacity .16s}.node circle{fill:#f4f3ef;stroke:#6e756f;stroke-width:1.5;transition:.16s}.node text{fill:#353632;font-size:11px;font-weight:560;pointer-events:none}.node.is-classic circle{stroke:#7d6a57;fill:#f4efe8}.node.is-person circle{stroke:#876c65;fill:#f3ece9}.node.is-school circle{stroke:#667778;fill:#ebf0ef}.node.is-method circle{stroke:#748063;fill:#eef1e9}.node.is-concept circle{stroke:#596b72;fill:#eaf0f2}.node.selected circle{stroke-width:3;fill:#fffdf7}.node.neighbor circle{stroke-width:2.4}.node.dim{opacity:.18}.node:focus circle{stroke-width:3}.detail{min-height:610px;padding:24px 22px;box-sizing:border-box}.detail-type{color:#876653;font-size:12px;letter-spacing:.14em}.detail h2{margin:7px 0 12px;font-size:28px;font-weight:540}.summary{color:#65625c;line-height:1.8;font-size:14px}.meta{margin:18px 0;border-top:1px solid #e0dcd2;border-bottom:1px solid #e0dcd2}.meta div{display:grid;grid-template-columns:72px 1fr;gap:10px;padding:9px 0}.meta div+div{border-top:1px solid #ece8df}.meta dt{color:#8a867e;font-size:12px}.meta dd{margin:0;word-break:break-all;font-size:12px}.relations h3{margin:0 0 8px;font-size:14px;font-weight:560}.relation-row{width:100%;display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:10px 0;border:0;border-top:1px solid #ebe7df;background:transparent;color:inherit;text-align:left;cursor:pointer}.relation-row:hover .peer{text-decoration:underline;text-underline-offset:3px}.peer{font-size:14px}.kind{color:#805e49;font-size:11px}.relation-row small{grid-column:1/-1;color:#858078;line-height:1.55}.source-link{display:inline-block;margin-top:20px;color:#6f5140;font-size:13px;text-decoration:none}.source-link:hover{text-decoration:underline}.empty-mark{width:54px;height:54px;display:grid;place-items:center;margin-bottom:20px;border:1px solid #8e8175;border-radius:50%;color:#796555;font-family:serif;font-size:24px}.guide{display:grid;gap:10px;margin-top:24px;padding-top:18px;border-top:1px solid #e0dcd2;color:#77736c;font-size:13px;line-height:1.65}.guide strong{color:#4c4944;font-weight:560}@media(max-width:980px){.graph-page{padding:36px 18px 54px}.graph-hero{grid-template-columns:1fr;gap:22px}.toolbar{grid-template-columns:1fr}.workspace{grid-template-columns:1fr}.detail{min-height:auto}}@media(max-width:600px){.stats{width:100%}.stats div{min-width:0;flex:1;padding:11px 8px}.canvas-head{flex-direction:column;gap:3px}}
</style>
