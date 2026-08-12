<script setup lang="ts">
import { computed } from 'vue'
import { Content, useData } from 'vitepress'
import { data as graph } from '../data/graph.data'
import type { GraphRelation } from '../data/graph.data'

const { frontmatter } = useData()
const nodeId = computed(() => String(frontmatter.value.nodeId || ''))
const nodeMap = computed(() => new Map(graph.nodes.map((n) => [n.id, n])))
const node = computed(() => nodeMap.value.get(nodeId.value) || null)
const relations = computed(() => graph.relations.filter((r) => r.source === nodeId.value || r.target === nodeId.value))

const TYPE_LABELS: Record<string, string> = {
  concept: '核心概念', classic: '经典', person: '人物', school: '传统与流派',
  method: '方法与实践', stage: '阶段', route: '路线', research: '研究'
}
const REL_LABELS: Record<string, string> = {
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

function peer(rel: GraphRelation) {
  return nodeMap.value.get(rel.source === nodeId.value ? rel.target : rel.source) || null
}
function relationDirection(rel: GraphRelation) {
  if (SYMMETRIC.has(rel.relation)) return `↔ ${REL_LABELS[rel.relation] || rel.relation}`
  return rel.source === nodeId.value
    ? `→ ${REL_LABELS[rel.relation] || rel.relation}`
    : `← ${REL_LABELS[rel.relation] || rel.relation}`
}
function nodeUrl(id: string) { return `/graph/node/${encodeURIComponent(id)}` }
function peerUrl(rel: GraphRelation) {
  const p = peer(rel)
  return p ? nodeUrl(p.id) : '#'
}
function sourceUrl(path: string) {
  return `https://github.com/2740219773/dao-practice-reconstruction/blob/main/${path.split('/').map(encodeURIComponent).join('/')}`
}
</script>

<template>
  <div v-if="node" class="graph-node-page">
    <div class="node-breadcrumb"><a href="/graph/">知识图谱</a><span>／</span><span>{{ TYPE_LABELS[node.type] || node.type }}</span></div>

    <header class="node-hero">
      <div class="node-hero__main">
        <p class="node-kind">{{ TYPE_LABELS[node.type] || node.type }}</p>
        <h1>{{ node.name }}</h1>
        <p class="node-id">{{ node.id }}</p>
        <p class="node-summary">{{ node.summary }}</p>
        <div class="node-tags">
          <span>状态：{{ node.status }}</span>
          <span v-if="node.school_kind">{{ SCHOOL_KIND[node.school_kind] || node.school_kind }}</span>
          <span>{{ relations.length }} 条直接关系</span>
        </div>
      </div>
      <div class="node-hero__actions">
        <a href="/graph/">返回图谱</a>
        <a :href="sourceUrl(node.source_path)" target="_blank" rel="noopener">查看 GitHub 源文件</a>
      </div>
    </header>

    <div class="node-grid">
      <article class="node-body wdz-prose"><Content /></article>

      <aside class="node-side">
        <section>
          <h2>直接关系</h2>
          <a v-for="rel in relations" :key="rel.id" class="node-rel" :href="peerUrl(rel)">
            <div><strong>{{ peer(rel)?.name || '未知节点' }}</strong><span>{{ relationDirection(rel) }}</span></div>
            <p v-if="rel.scope">{{ rel.scope }}</p>
            <small v-if="rel.evidence || rel.verification">{{ rel.evidence || '—' }} · {{ rel.verification || '未标记' }}</small>
          </a>
        </section>

        <section v-if="node.sources?.length">
          <h2>结构化来源</h2>
          <div v-for="source in node.sources" :key="source.id" class="node-source">
            <strong>{{ source.name || source.id }}</strong>
            <p v-if="source.reference">{{ source.reference }}</p>
            <small>{{ source.evidence || '' }}<template v-if="source.type"> · {{ source.type }}</template></small>
          </div>
        </section>

        <section v-if="node.claims?.length">
          <h2>判断状态</h2>
          <div v-for="(claim, index) in node.claims" :key="index" class="node-claim">
            <p>{{ claim.text }}</p>
            <small>{{ claim.status || '未标记' }}<template v-if="claim.evidence"> · {{ claim.evidence }}</template></small>
          </div>
        </section>
      </aside>
    </div>
  </div>

  <div v-else class="graph-node-missing wdz-container">
    <h1>节点不存在</h1>
    <p>当前节点没有进入 V3 正式图谱，或构建数据尚未更新。</p>
    <a href="/graph/">返回知识图谱</a>
  </div>
</template>

<style scoped>
.graph-node-page{max-width:1320px;margin:0 auto;padding:42px 28px 72px}.node-breadcrumb{display:flex;gap:6px;margin-bottom:24px;color:#8a867e;font-size:13px}.node-breadcrumb a{color:#725a49;text-decoration:none}.node-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:32px;padding:10px 0 30px;border-bottom:1px solid #d9d5ca}.node-kind{margin:0 0 8px;color:#8a5f45;font-size:12px;letter-spacing:.16em}.node-hero h1{margin:0;font-size:clamp(36px,5vw,56px);font-weight:540}.node-id{margin:8px 0 0;color:#979188;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.node-summary{max-width:800px;margin:18px 0 0;color:#625f59;line-height:1.85}.node-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}.node-tags span{padding:5px 9px;border:1px solid #ddd7cc;border-radius:99px;color:#736e66;font-size:12px;background:#ffffff73}.node-hero__actions{display:flex;flex-direction:column;gap:8px;align-self:end}.node-hero__actions a{padding:9px 12px;border:1px solid #d8d2c6;color:#604d40;text-decoration:none;font-size:13px;text-align:center}.node-hero__actions a:hover{background:#f1eee7}.node-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:52px;padding-top:36px}.node-body{min-width:0}.node-side{display:flex;flex-direction:column;gap:28px}.node-side section{border-top:1px solid #d9d5ca;padding-top:16px}.node-side h2{margin:0 0 10px;font-size:14px;font-weight:600;letter-spacing:.08em}.node-rel{display:block;padding:11px 0;border-top:1px solid #ebe7de;color:inherit;text-decoration:none}.node-rel>div{display:flex;justify-content:space-between;gap:10px}.node-rel strong{font-size:14px;font-weight:560}.node-rel span{color:#805e49;font-size:11px;white-space:nowrap}.node-rel p,.node-source p,.node-claim p{margin:6px 0 0;color:#747069;font-size:12px;line-height:1.6}.node-rel small,.node-source small,.node-claim small{display:block;margin-top:5px;color:#99938a;font-size:11px}.node-rel:hover strong{text-decoration:underline;text-underline-offset:3px}.node-source,.node-claim{padding:10px 0;border-top:1px solid #ebe7de}.node-source strong{font-size:13px;font-weight:560}.graph-node-missing{padding:72px 28px}@media(max-width:900px){.node-hero{grid-template-columns:1fr}.node-hero__actions{flex-direction:row;align-self:start}.node-grid{grid-template-columns:1fr;gap:32px}.node-side{border-top:1px solid #d9d5ca;padding-top:18px}}@media(max-width:600px){.graph-node-page{padding:30px 18px 54px}.node-hero__actions{flex-direction:column;width:100%}}
</style>
