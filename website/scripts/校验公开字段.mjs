/**
 * 校验公开字段.mjs
 * 按《项目结构总图》四层分别校验（框架收口 2026-08-03）：
 *  - knowledge（正式知识层）：检查编号/标题、公开字段、章节白名单、风险字段；
 *  - entry（用户入口层）：检查入口必需字段（问题卡/辨析卡各自字段）与公开字段；
 *  - observation（采集观察层）：只检查记录字段，不检查公开字段，不进入公开流程；
 *  - governance（治理审校层）：只检查治理字段，不进入公开流程。
 *
 * 依据《决策-0004》：发布状态只允许五种取值；「可公开草稿／正式公开」必须同时具备
 * 「公开摘要」「公开注意事项」；缺失字段按「不公开」处理。
 * 校验失败返回错误列表，由调用方决定终止构建。
 */
import { z } from 'zod'
import { splitChapters } from './读取知识卡.mjs'

export const PUBLISH_STATUSES = ['不公开', '内部预览', '可公开草稿', '正式公开', '已撤回']
export const PUBLISHABLE = ['可公开草稿', '正式公开'] // 生成器只接受这两种状态

/**
 * 各类型详情页章节白名单（章节号 → 站点章节标题）：
 * 可公开知识卡必须包含 include 中列出的全部章节，缺失即构建失败，防止正文静默丢失
 * 仅适用于正式知识层（knowledge）
 */
export const ALLOWLISTS = {
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
  // 预留（决策：三类独立模块）：导引术页／医学观察页章节白名单，
  // 与 01-知识卡模板/导引术资料卡模板.md、医学观察资料卡模板.md 正文结构对应；
  // 模块尚无公开内容前不进入生成循环，本白名单仅作类型预留
  daoyin: {
    label: '导引术页',
    include: { 1: '名称与定义', 2: '历史来源', 4: '当前采用版本', 8: '传统功效主张', 9: '现代研究', 11: '适用人群', 12: '禁忌与停止条件', 13: '不能直接推出的结论' },
    collapse: { 16: '修改记录' }
  },
  'medical-observations': {
    label: '医学观察页',
    include: { 1: '资料基本信息', 4: '原始观察内容', 5: '作者自己的解释', 7: '现代医学对应候选', 8: '独立验证情况', 9: '可能的替代解释', 10: '可以用于什么', 11: '不能用于什么' },
    collapse: { 14: '修改记录' }
  },
  // 最小网站扩展（TOPIC-001 阶段 6，范围卡第 4 节）：主张/争议/现代研究/风险页
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

/**
 * 校验可公开知识卡是否包含全部必需展示章节（防章节被删除/改名后页面只剩标题与元数据）
 * 仅正式知识层使用
 * @returns {string[]} 缺失章节说明（空数组 = 通过）
 */
export function checkRequiredChapters(card) {
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

// 注意：zod v4 中 enum 的 errorMap 已不生效，须用 message 选项自定义错误文案
const statusSchema = z.enum(PUBLISH_STATUSES, {
  message: `网站发布状态必须为：${PUBLISH_STATUSES.join('／')}`
})

/** 通用基础字段（四层均要求有编号） */
const idField = z.object({
  编号: z.string({ errorMap: () => ({ message: '缺少「编号」' }) })
}).passthrough()

/** 知识层/入口层基础：编号 + 标题 */
const titledField = z.object({
  编号: z.string({ errorMap: () => ({ message: '缺少「编号」' }) }),
  标题: z.string({ errorMap: () => ({ message: '缺少「标题」' }) }),
  网站发布状态: statusSchema.optional(),
  公开摘要: z.string().optional(),
  公开注意事项: z.string().optional()
}).passthrough()

/**
 * 风险字段类型校验（映射表 V0.4 起风险字段拆分，V0.6 起含取值枚举）：
 * 现代研究卡／风险资料卡必须填写「卡片发布风险」「所含实践最高风险」，不得沿用旧「风险等级」；
 * 两个字段的值必须属于 S0—S4（映射表 V0.6 分级定义），防止非法取值通过。
 * 其余卡类型（文献/原文/概念等）仍允许使用「风险等级」，由各自模板约定。
 */
const RISK_SPLIT_CARDS = ['research', 'risks']
const RISK_LEVELS = ['S0', 'S1', 'S2', 'S3', 'S4']

/** 校验现代研究卡/风险资料卡的风险字段，返回错误列表 */
export function checkRiskFields(card) {
  if (!RISK_SPLIT_CARDS.includes(card.slug)) return []
  const y = card.yaml
  const errors = []
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

/** 公开字段校验（知识层/入口层可公开时，必须填写公开摘要与注意事项） */
function checkPublicFields(parsed) {
  const errors = []
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
  }
  return errors
}

/** 正式知识层校验（编号/标题/公开字段/风险字段；章节白名单由 validateAllCards 检查） */
export function validateKnowledgeCard(card) {
  const errors = []
  const parsed = titledField.safeParse(card.yaml)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '字段'}：${issue.message}`)
    }
  }
  // 风险字段类型校验（映射表 V0.4：现代研究卡/风险资料卡必须用拆分后字段）
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

/** 入口必需字段（按类型；问题卡用"问题"、辨析卡用"概念甲/概念乙"作标题字段，不强制通用"标题"） */
const ENTRY_REQUIRED_FIELDS = {
  questions: ['问题', '问题分类'],
  discriminations: ['概念甲', '概念乙']
}

/** 用户入口层校验（入口必需字段 + 公开字段；标题字段按类型，不强制通用"标题"） */
export function validateEntryCard(card) {
  const errors = []
  // 入口层不强制通用「标题」（问题卡用「问题」、辨析卡用「概念甲/概念乙」），仅要求编号
  const parsed = idField.safeParse(card.yaml)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '字段'}：${issue.message}`)
    }
  }
  const required = ENTRY_REQUIRED_FIELDS[card.slug] || []
  for (const f of required) {
    if (!card.yaml[f] || String(card.yaml[f]).trim() === '') {
      errors.push(`缺少入口必需字段「${f}」`)
    }
  }
  // 发布状态合法性
  const status = card.yaml['网站发布状态']
  if (status && !PUBLISH_STATUSES.includes(status)) {
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

/** 采集观察层校验（只检查记录字段，不检查公开字段，不进入公开流程） */
export function validateObservationRecord(card) {
  const errors = []
  const parsed = idField.safeParse(card.yaml)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '字段'}：${issue.message}`)
    }
  }
  for (const f of ['社区问题', '来源平台', '处理状态']) {
    if (!card.yaml[f] || String(card.yaml[f]).trim() === '') {
      errors.push(`缺少记录字段「${f}」`)
    }
  }
  return {
    ok: errors.length === 0,
    status: undefined,
    errors,
    publishable: false // 观察记录不进入公开流程
  }
}

/** 治理层必需字段（按类型） */
const GOVERNANCE_REQUIRED_FIELDS = {
  decisions: ['标题', '决策类型', '提出日期'],
  'ai-reviews': ['内容名称', '审校对象编号', '人工复核人']
}

/** 治理审校层校验（只检查治理字段，不进入公开流程） */
export function validateGovernanceRecord(card) {
  const errors = []
  const parsed = idField.safeParse(card.yaml)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '字段'}：${issue.message}`)
    }
  }
  const required = GOVERNANCE_REQUIRED_FIELDS[card.slug] || []
  for (const f of required) {
    if (!card.yaml[f] || String(card.yaml[f]).trim() === '') {
      errors.push(`缺少治理字段「${f}」`)
    }
  }
  return {
    ok: errors.length === 0,
    status: undefined,
    errors,
    publishable: false // 治理记录不进入公开流程
  }
}

/**
 * 按层分发校验（《项目结构总图》四层）
 */
export function validateCard(card) {
  switch (card.layer) {
    case 'knowledge':
      return validateKnowledgeCard(card)
    case 'entry':
      return validateEntryCard(card)
    case 'observation':
      return validateObservationRecord(card)
    case 'governance':
      return validateGovernanceRecord(card)
    default:
      return { ok: false, status: undefined, errors: [`未知层：${card.layer}`], publishable: false }
  }
}

/**
 * 校验全部记录。发现任何错误即抛出（终止构建）。
 * @returns {Array} 可公开（可公开草稿/正式公开）的记录（知识层与入口层；观察/治理层永不公开）
 */
export function validateAllCards(cards) {
  const failures = []
  const publishableCards = []
  for (const card of cards) {
    const result = validateCard(card)
    if (!result.ok) {
      failures.push({ card, result })
    } else if (result.publishable) {
      // 仅正式知识层可公开卡检查必需展示章节（入口层正文结构不同，暂不生成详情页）
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
