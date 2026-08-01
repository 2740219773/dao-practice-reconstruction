/**
 * 校验公开字段.mjs
 * 依据《决策-0004》校验知识卡的网站发布字段：
 *  1. 「网站发布状态」只允许五种取值：不公开／内部预览／可公开草稿／正式公开／已撤回；
 *  2. 「可公开草稿／正式公开」两张卡必须同时具备「公开摘要」「公开注意事项」，且不能是占位符「待补录」；
 *  3. 缺失字段一律按「不公开」处理（决策-0004：存量卡缺失按不公开），不报错。
 * 校验失败返回错误列表，由调用方决定终止构建。
 */
import { z } from 'zod'
import { splitChapters } from './读取知识卡.mjs'

export const PUBLISH_STATUSES = ['不公开', '内部预览', '可公开草稿', '正式公开', '已撤回']
export const PUBLISHABLE = ['可公开草稿', '正式公开'] // 生成器只接受这两种状态

/**
 * 各类型详情页章节白名单（章节号 → 站点章节标题）：
 * 可公开卡必须包含 include 中列出的全部章节，缺失即构建失败，防止正文静默丢失
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
  }
}

/**
 * 校验可公开卡是否包含全部必需展示章节（防章节被删除/改名后页面只剩标题与元数据）
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

const cardFields = z.object({
  编号: z.string({ errorMap: () => ({ message: '缺少「编号」' }) }),
  标题: z.string({ errorMap: () => ({ message: '缺少「标题」' }) }),
  网站发布状态: statusSchema.optional(),
  公开摘要: z.string().optional(),
  公开注意事项: z.string().optional()
}).passthrough()

/**
 * 校验单张卡，返回 { ok, status, errors: string[] }
 */
export function validateCard(card) {
  const errors = []
  const parsed = cardFields.safeParse(card.yaml)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '字段'}：${issue.message}`)
    }
  }
  const status = parsed.success ? parsed.data['网站发布状态'] : undefined
  if (parsed.success && status) {
    const summary = parsed.data['公开摘要']
    const notice = parsed.data['公开注意事项']
    if (PUBLISHABLE.includes(status)) {
      if (!summary || summary.trim() === '' || summary.trim() === '待补录') {
        errors.push(`「${status}」状态下必须填写「公开摘要」`)
      }
      if (!notice || notice.trim() === '' || notice.trim() === '待补录') {
        errors.push(`「${status}」状态下必须填写「公开注意事项」`)
      }
    }
  }
  return {
    ok: errors.length === 0,
    status,
    errors,
    publishable: !!status && PUBLISHABLE.includes(status)
  }
}

/**
 * 校验全部卡片。发现任何错误即抛出（终止构建）。
 * @returns {Array} 可公开（可公开草稿/正式公开）的卡片
 */
export function validateAllCards(cards) {
  const failures = []
  const publishableCards = []
  for (const card of cards) {
    const result = validateCard(card)
    if (!result.ok) {
      failures.push({ card, result })
    } else if (result.publishable) {
      // 可公开卡必须包含全部必需展示章节（章节白名单见 ALLOWLISTS）
      const missing = checkRequiredChapters(card)
      if (missing.length > 0) {
        failures.push({ card, result: { errors: missing } })
      } else {
        publishableCards.push(card)
      }
    }
  }
  if (failures.length > 0) {
    const lines = failures.map(({ card, result }) =>
      `  ✗ ${card.relPath}\n     ${result.errors.join('\n     ')}`)
    throw new Error(`知识卡公开字段校验失败（${failures.length} 张卡）：\n${lines.join('\n')}`)
  }
  return publishableCards
}
