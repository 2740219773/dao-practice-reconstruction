/**
 * knowledge.data.ts —— 统一知识索引数据（方案 14.1 / C 节）
 * 构建期扫描仓库正式知识层（02~09/14/16/17），校验后输出展示层条目。
 * 校验失败即抛错，终止构建。
 */
import { defineLoader } from 'vitepress'
import { readAllCards, displayValue } from './_lib/读取知识卡.ts'
import { validateAllCards } from './_lib/校验公开字段.ts'
import { TYPE_LABELS } from './_lib/常量.ts'
import type { KnowledgeItem, KnowledgeType, RawCard } from './_lib/types.ts'

/** 类型显示标签（供 KnowledgeLayout 等组件复用） */
export { TYPE_LABELS }

/** 各类型详情页状态区字段（键 → 显示名，存在才显示） */
const META_FIELDS: Record<string, [string, string][]> = {
  library: [
    ['编号', '编号'], ['其他名称', '其他名称'], ['传统署名', '传统署名'], ['实际作者', '实际作者'],
    ['大致年代', '大致年代'], ['文献类型', '文献类型'], ['资料性质', '资料性质'],
    ['使用版本', '使用版本'], ['文献可靠等级', '文献可靠等级'],
    ['最低解释层级', '最低解释层级'], ['最高推论层级', '最高推论层级'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级'],
    ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  originals: [
    ['编号', '编号'], ['所属文献', '所属文献'], ['章节', '章节'], ['卷次', '卷次'],
    ['使用版本', '使用版本'], ['页码状态', '页码状态'], ['网络文本核对状态', '网络文本核对状态'],
    ['指定底本核对状态', '指定底本核对状态'],
    ['文献可靠等级', '文献可靠等级'], ['最高推论层级', '最高推论层级'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级'],
    ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  concepts: [
    ['编号', '编号'], ['概念类别', '概念类别'], ['主要时期', '主要时期'],
    ['涉及传统', '涉及传统'], ['涉及流派', '涉及流派'], ['当前定义状态', '当前定义状态'],
    ['文献可靠等级', '文献可靠等级'], ['最高推论层级', '最高推论层级'],
    ['现代证据等级', '现代证据等级'], ['对应强度', '对应强度'],
    ['反证状态', '反证状态'], ['风险等级', '风险等级'],
    ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  claims: [
    ['编号', '编号'], ['主张类型', '主张类型'], ['当前判断', '当前判断'],
    ['来源可信等级', '来源可信等级'], ['反证状态', '反证状态'], ['风险等级', '风险等级'],
    ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  disputes: [
    ['编号', '编号'], ['来源可信等级', '来源可信等级'], ['反证状态', '反证状态'], ['风险等级', '风险等级'],
    ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  research: [
    ['编号', '编号'], ['研究主题', '研究主题'], ['现代证据等级', '现代证据等级'], ['对应强度', '对应强度'],
    ['DOI', 'DOI'], ['PMID', 'PMID'], ['全文核对状态', '全文核对状态'], ['卡片发布风险', '卡片发布风险'],
    ['所含实践最高风险', '所含实践最高风险'], ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  risks: [
    ['编号', '编号'], ['风险类型', '风险类型'], ['严重程度', '严重程度'], ['卡片发布风险', '卡片发布风险'],
    ['所含实践最高风险', '所含实践最高风险'], ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  daoyin: [
    ['编号', '编号'], ['名称', '名称'], ['其他名称', '其他名称'], ['资料类型', '资料类型'],
    ['历史时期', '历史时期'], ['最早可核来源', '最早可核来源'], ['当前采用版本', '当前采用版本'],
    ['版本制定机构', '版本制定机构'], ['动作数量', '动作数量'], ['所含实践最高风险', '所含实践最高风险'],
    ['卡片发布风险', '卡片发布风险'], ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ],
  'medical-observations': [
    ['编号', '编号'], ['资料名称', '资料名称'], ['作者或讲述者', '作者或讲述者'],
    ['出版或记录年代', '出版或记录年代'], ['资料类型', '资料类型'], ['观察方式', '观察方式'],
    ['可验证程度', '可验证程度'], ['所含实践最高风险', '所含实践最高风险'],
    ['卡片发布风险', '卡片发布风险'], ['最后修改日期', '最后修改日期'], ['最后修改人员', '最后修改人员']
  ]
}

/** 关联字段 → 类型分组（related 字段收集） */
const RELATED_FIELDS: [string, keyof KnowledgeItem['related']][] = [
  ['关联概念', 'concepts'],
  ['关联原文', 'originals'],
  ['关联主张', 'claims'],
  ['关联争议', 'disputes'],
  ['关联研究', 'research'],
  ['关联风险', 'risks']
]

/** 从 yaml 字段解析关联编号列表（支持逗号/顿号分隔） */
function parseRelated(v: unknown): string[] {
  if (!v) return []
  return String(v)
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter((s) => /^(文献|原文|概念|主张|假说|争议|现代研究|风险资料)-\d+/.test(s))
    .map((s) => s.match(/^((文献|原文|概念|主张|假说|争议|现代研究|风险资料)-\d+)/)?.[1] ?? s)
}

/** 文献资料性质 → 知识层级 */
const LEVEL_MAP: Record<string, string> = {
  '原始文献': 'L1',
  '历代注释': 'L2',
  '近现代传承文献': 'L3',
  '现代学术研究': 'L4'
}

function toItem(card: RawCard): KnowledgeItem {
  const y = card.yaml
  const type = card.slug as KnowledgeType
  const status = (y['网站发布状态'] || '内部预览') as KnowledgeItem['status']
  const meta: Record<string, string> = {}
  for (const [key, label] of META_FIELDS[card.slug] || []) {
    if (y[key]) meta[label] = displayValue(y[key])
  }
  if (card.slug === 'library' && y['资料性质']) {
    meta['知识层级'] = `${LEVEL_MAP[y['资料性质']] || '其他'}（${y['资料性质']}）`
  }

  // 徽章用 tags
  const tags: Record<string, string> = {}
  if (y['当前状态']) tags['状态'] = displayValue(y['当前状态'])
  if (y['文献可靠等级']) tags['证据'] = displayValue(y['文献可靠等级'])
  const risk = y['所含实践最高风险'] || y['卡片发布风险'] || y['风险等级']
  if (risk) tags['风险'] = displayValue(risk)
  if (card.slug === 'library' && y['资料性质']) tags['层级'] = LEVEL_MAP[y['资料性质']] || '其他'

  // 关联字段
  const related: KnowledgeItem['related'] = {
    concepts: [], originals: [], claims: [], disputes: [], research: [], risks: []
  }
  for (const [key, target] of RELATED_FIELDS) {
    const list = parseRelated(y[key])
    // 类型对齐：概念字段归 concepts，原文归 originals…
    related[target] = list
  }
  // 概念卡的 关联原文 → originals
  if (y['关联原文']) related.originals = parseRelated(y['关联原文'])

  return {
    id: y['编号'],
    type,
    slug: card.slugOf,
    title: y['标题'] || card.slugOf,
    url: `/knowledge/${card.slugOf}`,
    summary: y['公开摘要'] || '',
    notice: y['公开注意事项'] || '',
    status,
    evidenceLevel: y['文献可靠等级'] ? displayValue(y['文献可靠等级']) : undefined,
    riskLevel: risk ? displayValue(risk) : undefined,
    tags,
    meta,
    relPath: card.relPath,
    lastModified: y['最后修改日期'] ? displayValue(y['最后修改日期']) : '',
    bodyPreview: card.body.slice(0, 260),
    related
  }
}

export interface KnowledgeData {
  items: KnowledgeItem[]
  byType: Record<string, KnowledgeItem[]>
  stats: {
    total: number
    byStatus: Record<string, number>
    knowledgePub: number
    entryPub: number
    pending: number
    byType: Record<string, number>
  }
  generatedAt: string
}

declare const data: KnowledgeData
export { data }

/** 核心加载逻辑（供本 loader 与 search-index.data.ts 复用） */
export async function loadKnowledgeData(): Promise<KnowledgeData> {
  const cards = await readAllCards()
  // 校验失败抛错 → 终止构建（含章节白名单与风险字段检查）
  const publishable = validateAllCards(cards)

  const items = publishable
    .filter((c) => c.layer === 'knowledge')
    .map(toItem)

  const byType: Record<string, KnowledgeItem[]> = {}
  for (const item of items) {
    const arr = byType[item.type] || []
    arr.push(item)
    byType[item.type] = arr
  }

  const byStatus: Record<string, number> = {}
  for (const c of cards) {
    const s = c.yaml['网站发布状态'] || '（缺失，按不公开）'
    byStatus[s] = (byStatus[s] || 0) + 1
  }

  const knowledgePub = items.length
  const entryPub = publishable.filter((c) => c.layer === 'entry').length
  const total = cards.filter((c) => c.layer === 'knowledge').length

  const byTypeCount: Record<string, number> = {}
  for (const item of items) byTypeCount[item.type] = (byTypeCount[item.type] || 0) + 1

  console.log(`[knowledge.data] ${total} 张知识卡，公开 ${knowledgePub}，入口公开 ${entryPub}`)

  return {
    items,
    byType,
    stats: {
      total,
      byStatus,
      knowledgePub,
      entryPub,
      pending: total - knowledgePub,
      byType: byTypeCount
    },
    generatedAt: new Date().toISOString()
  }
}

export default defineLoader({
  watch: [new URL('../../../../../', import.meta.url).pathname],
  load: loadKnowledgeData
})
