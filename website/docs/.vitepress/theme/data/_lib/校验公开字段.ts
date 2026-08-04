/**
 * 校验公开字段.ts（由 scripts/校验公开字段.mjs 迁移，TS 化）
 * 按《项目结构总图》校验：知识层/入口层公开字段、章节白名单、风险字段。
 * 校验失败抛出错误，由调用方（data loader）在构建期终止。
 */
import { z } from 'zod'
import { displayValue, splitChapters } from './读取知识卡.ts'
import type { RawCard } from './types.ts'

export const PUBLISH_STATUSES = ['不公开', '内部预览', '可公开草稿', '正式公开', '已撤回'] as const
export const PUBLISHABLE = ['可公开草稿', '正式公开']

/** 各类型详情页章节白名单（与生成脚本一致） */
export const ALLOWLISTS: Record<string, { label: string; include: Record<number, string>; collapse: Record<number, string> }> = {
  library: {
    label: '文献页',
    include: { 2: '文献简介', 3: '成书与作者', 4: '使用版本', 7: '研究范围', 9: '关键原文索引', 12: '不能直接得出的结论', 13: '未解决问题' },
    collapse: { 15: '修改记录' }
  },
  originals: {
    label: '原文页',
    include: { 1: '原文出处', 2: '原文', 4: '逐词说明', 6: '直译', 8: '历代注释', 9: '可能解释', 10: '待检索现代方向', 11: '不能直接推出的结论', 12: '关联概念', 13: '关联原文' },
    collapse: {}
  },
  concepts: {
    label: '概念页',
    include: { 1: '概念说明', 4: '不同文献中的含义', 5: '不同时期的变化', 7: '当前暂定分类', 12: '常见误解', 16: '能确认与不能确认', 18: '关联', 13: '开放争议' },
    collapse: {}
  },
  claims: {
    label: '主张页',
    include: { 1: '主张内容', 2: '主张来源', 4: '支持证据', 5: '反对证据', 10: '当前判断', 11: '判断理由' },
    collapse: { 14: '修改记录' }
  },
  disputes: {
    label: '争议页',
    include: { 2: '争议问题', 4: '观点一', 5: '观点二', 7: '支持证据', 8: '反对证据', 9: '当前判断' },
    collapse: { 13: '修改记录' }
  },
  research: {
    label: '现代研究页',
    include: { 1: '研究基本信息', 5: '主要发现', 7: '能支持什么', 8: '不能支持什么', 10: '结论表达等级' },
    collapse: { 12: '修改记录' }
  },
  risks: {
    label: '风险资料页',
    include: { 1: '风险类型', 3: '表现', 5: '停止条件', 6: '处理原则' },
    collapse: { 10: '修改记录' }
  }
}

/** 校验可公开知识卡是否包含全部必需展示章节 */
export function checkRequiredChapters(card: RawCard): string[] {
  const allow = ALLOWLISTS[card.slug]
  if (!allow) return []
  const have = new Set(splitChapters(card.body).map((c) => c.num))
  const missing = Object.entries(allow.include).filter(([num]) => !have.has(Number(num)))
  if (missing.length === 0) return []
  const nums = splitChapters(card.body).map((c) => c.num)
  const expect = Object.keys(allow.include).map(Number).sort((a, b) => a - b).join('、')
  const actual = nums.length ? nums.join('、') : '（未解析到任何 "## N." 章节，检查标题格式与行尾）'
  return [
    `缺少必需展示章节：${missing.map(([n, t]) => `${n}「${t}」`).join('、')}`,
    `  期望章节号：${expect}；实际章节号：${actual}`
  ]
}

const statusSchema = z.enum(PUBLISH_STATUSES, {
  message: `网站发布状态必须为：${PUBLISH_STATUSES.join('／')}`
})

const titledField = z.object({
  编号: z.string({ errorMap: () => ({ message: '缺少「编号」' }) }),
  标题: z.string({ errorMap: () => ({ message: '缺少「标题」' }) }),
  网站发布状态: statusSchema.optional(),
  公开摘要: z.string().optional(),
  公开注意事项: z.string().optional()
}).passthrough()

const RISK_SPLIT_CARDS = ['research', 'risks']
const RISK_LEVELS = ['S0', 'S1', 'S2', 'S3', 'S4']

export function checkRiskFields(card: RawCard): string[] {
  if (!RISK_SPLIT_CARDS.includes(card.slug)) return []
  const y = card.yaml
  const errors: string[] = []
  if (!y['卡片发布风险']) errors.push('缺少「卡片发布风险」')
  if (!y['所含实践最高风险']) errors.push('缺少「所含实践最高风险」')
  if (y['风险等级']) errors.push('不得使用旧「风险等级」字段（映射表 V0.4 起拆分为「卡片发布风险」＋「所含实践最高风险」）')
  for (const field of ['卡片发布风险', '所含实践最高风险']) {
    const v = y[field]
    if (v && !RISK_LEVELS.includes(v)) {
      errors.push(`「${field}」取值「${v}」非法，必须为 ${RISK_LEVELS.join('／')}（映射表 V0.6）`)
    }
  }
  return errors
}

function checkPublicFields(parsed: { data: Record<string, any> }): string[] {
  const errors: string[] = []
  const status = parsed.data['网站发布状态']
  if (PUBLISHABLE.includes(status)) {
    const summary = parsed.data['公开摘要']
    const notice = parsed.data['公开注意事项']
    if (!summary || summary.trim() === '' || summary.trim() === '待补录') {
      errors.push(`「${status}」状态下必须填写「公开摘要」`)
    }
    if (!notice || notice.trim() === '' || notice.trim() === '待补录') {
      errors.push(`「${status}」状态下必须填写「公开注意事项」`)
    }
    const modified = parsed.data['最后修改日期']
    if (!modified || !/^\d{4}-\d{2}-\d{2}$/.test(displayValue(modified))) {
      errors.push(`「${status}」状态下必须填写有效的「最后修改日期」（YYYY-MM-DD）`)
    }
  }
  return errors
}

interface ValidateResult { ok: boolean; status?: string; errors: string[]; publishable: boolean }

/** 正式知识层校验 */
export function validateKnowledgeCard(card: RawCard): ValidateResult {
  const errors: string[] = []
  const parsed = titledField.safeParse(card.yaml)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '字段'}：${issue.message}`)
    }
  }
  for (const e of checkRiskFields(card)) errors.push(e)
  const status = parsed.success ? parsed.data['网站发布状态'] : undefined
  if (parsed.success) {
    for (const e of checkPublicFields(parsed)) errors.push(e)
  }
  return {
    ok: errors.length === 0,
    status,
    errors,
    publishable: !!status && PUBLISHABLE.includes(status)
  }
}

/** 入口必需字段 */
const ENTRY_REQUIRED_FIELDS: Record<string, string[]> = {
  questions: ['问题', '问题分类'],
  discriminations: ['概念甲', '概念乙']
}

/** 用户入口层校验 */
export function validateEntryCard(card: RawCard): ValidateResult {
  const errors: string[] = []
  if (!card.yaml['编号']) errors.push('缺少「编号」')
  const required = ENTRY_REQUIRED_FIELDS[card.slug] || []
  for (const f of required) {
    if (!card.yaml[f] || String(card.yaml[f]).trim() === '') {
      errors.push(`缺少入口必需字段「${f}」`)
    }
  }
  const status = card.yaml['网站发布状态']
  if (status && !(PUBLISH_STATUSES as readonly string[]).includes(status)) {
    errors.push(`网站发布状态必须为：${PUBLISH_STATUSES.join('／')}`)
  }
  if (status && PUBLISHABLE.includes(status)) {
    const summary = card.yaml['公开摘要']
    const notice = card.yaml['公开注意事项']
    if (!summary || summary.trim() === '' || summary.trim() === '待补录') {
      errors.push(`「${status}」状态下必须填写「公开摘要」`)
    }
    if (!notice || notice.trim() === '' || notice.trim() === '待补录') {
      errors.push(`「${status}」状态下必须填写「公开注意事项」`)
    }
  }
  return {
    ok: errors.length === 0,
    status,
    errors,
    publishable: !!status && PUBLISHABLE.includes(status)
  }
}

export function validateCard(card: RawCard): ValidateResult {
  switch (card.layer) {
    case 'knowledge':
      return validateKnowledgeCard(card)
    case 'entry':
      return validateEntryCard(card)
    default:
      return { ok: false, status: undefined, errors: [`未知层：${card.layer}`], publishable: false }
  }
}

/**
 * 校验全部记录。发现任何错误即抛出（终止构建）。
 * @returns 可公开记录（知识层与入口层）
 */
export function validateAllCards(cards: RawCard[]): RawCard[] {
  const failures: { card: RawCard; result: ValidateResult }[] = []
  const publishableCards: RawCard[] = []
  for (const card of cards) {
    const result = validateCard(card)
    if (!result.ok) {
      failures.push({ card, result })
    } else if (result.publishable) {
      if (card.layer === 'knowledge') {
        const missing = checkRequiredChapters(card)
        if (missing.length > 0) {
          failures.push({ card, result: { errors: missing } })
          continue
        }
      }
      publishableCards.push(card)
    }
  }
  if (failures.length > 0) {
    const lines = failures.map(({ card, result }) =>
      `  ✗ ${card.relPath}\n     ${result.errors.join('\n     ')}`)
    throw new Error(`记录校验失败（${failures.length} 条）：\n${lines.join('\n')}`)
  }
  return publishableCards
}
