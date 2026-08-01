/**
 * 校验公开字段.mjs
 * 依据《决策-0004》校验知识卡的网站发布字段：
 *  1. 「网站发布状态」只允许五种取值：不公开／内部预览／可公开草稿／正式公开／已撤回；
 *  2. 「可公开草稿／正式公开」两张卡必须同时具备「公开摘要」「公开注意事项」，且不能是占位符「待补录」；
 *  3. 缺失字段一律按「不公开」处理（决策-0004：存量卡缺失按不公开），不报错。
 * 校验失败返回错误列表，由调用方决定终止构建。
 */
import { z } from 'zod'

export const PUBLISH_STATUSES = ['不公开', '内部预览', '可公开草稿', '正式公开', '已撤回']
export const PUBLISHABLE = ['可公开草稿', '正式公开'] // 生成器只接受这两种状态

const statusSchema = z.enum(PUBLISH_STATUSES, {
  errorMap: () => ({ message: `网站发布状态必须为：${PUBLISH_STATUSES.join('／')}` })
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
      publishableCards.push(card)
    }
  }
  if (failures.length > 0) {
    const lines = failures.map(({ card, result }) =>
      `  ✗ ${card.relPath}\n     ${result.errors.join('\n     ')}`)
    throw new Error(`知识卡公开字段校验失败（${failures.length} 张卡）：\n${lines.join('\n')}`)
  }
  return publishableCards
}
