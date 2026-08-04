/**
 * questions.data.ts —— 问题地图数据（方案 8.2 / C 节）
 * 构建期扫描 18-问题地图 + 19-概念辨析，输出分组问题与详情所需字段。
 */
import { defineLoader } from 'vitepress'
import { readAllCards, splitChapters, displayValue } from './_lib/读取知识卡.ts'
import { validateAllCards } from './_lib/校验公开字段.ts'
import { QUESTION_SLUGS } from './_lib/常量.ts'
import type { Question, QuestionGroup, PublishStatus } from './_lib/types.ts'

/** 首页三个高价值问题（供 HomeLayout 复用） */
export { HOMEPAGE_QUESTION_IDS } from './_lib/常量.ts'

/** 问题分类 → 分组描述（实际数据：概念理解/修持实践/现代生活应用） */
const GROUP_DESC: Record<string, string> = {
  '概念理解': '关于道家核心概念「是什么、不是什么」的基础问题，是进入专题的起点。',
  '修持实践': '与具体做法、姿势、方法相关的边界问题，强调「文献没有规定」的边界。',
  '现代生活应用': '把传统概念与现代冥想、现代科学、日常经验对照时产生的问题。'
}

/** 从问题卡正文提取「暂时不能确认/进一步阅读」段落 */
function extractBodyInfo(card: { body: string }, keys: string[]): string {
  const chs = splitChapters(card.body)
  for (const k of keys) {
    const ch = chs.find((c) => c.title.includes(k))
    if (ch) return ch.lines.join('\n').trim()
  }
  return ''
}

export interface QuestionsData {
  groups: QuestionGroup[]
  questions: Question[]
  byId: Record<string, Question>
}

declare const data: QuestionsData
export { data }

/** 核心加载逻辑（供本 loader 与 search-index.data.ts 复用） */
export async function loadQuestionsData(): Promise<QuestionsData> {
  const cards = await readAllCards()
  const publishable = validateAllCards(cards)
  const byId: Record<string, Question> = {}
  const questions: Question[] = []

  // 辨析卡 → 反方材料编号映射（概念甲=静 等）
  const discriminations = publishable.filter((c) => c.slug === 'discriminations')

  for (const card of publishable.filter((c) => c.slug === 'questions')) {
    const y = card.yaml
    const id = String(y['编号'] || '')
    const title = String(y['问题'] || '').replace(/^"|"$/g, '')
    const group = String(y['问题分类'] || '其他')

    // 反方材料：辨析卡中概念乙与本体相关者（简化为全部可公开辨析卡中与静相关的）
    const opposes = discriminations
      .filter((d) => {
        const a = String(d.yaml['概念甲'] || '')
        const b = String(d.yaml['概念乙'] || '')
        return a.includes('静') || b.includes('静') || title.includes('静')
      })
      .map((d) => String(d.yaml['编号'] || ''))

    const supports = Array.isArray(y['答案依据']) ? y['答案依据'].map(String) : []

    const q: Question = {
      id,
      title,
      group,
      briefAnswer: String(y['简要回答'] || y['公开摘要'] || '').replace(/^"|"$/g, ''),
      background: extractBodyInfo(card, ['问题与背景']),
      supports,
      opposes,
      unresolved: extractBodyInfo(card, ['不能确认', '暂时不能', '不确定']) ? [extractBodyInfo(card, ['不能确认', '暂时不能', '不确定'])] : [],
      relatedTopics: ['静'],
      level: String(y['综合答案依据等级'] || ''),
      status: (y['网站发布状态'] || '内部预览') as PublishStatus,
      url: `/question-map/${QUESTION_SLUGS[id] || id}`
    }
    byId[id] = q
    questions.push(q)
  }

  // 分组：保持稳定顺序（概念理解 → 修持实践 → 现代生活应用）
  const order = ['概念理解', '修持实践', '现代生活应用']
  const grouped = new Map<string, Question[]>()
  for (const q of questions) {
    const arr = grouped.get(q.group) || []
    arr.push(q)
    grouped.set(q.group, arr)
  }
  const groups: QuestionGroup[] = order
    .filter((k) => grouped.has(k))
    .map((key) => ({
      key,
      label: key,
      desc: GROUP_DESC[key] || '',
      questions: grouped.get(key)!
    }))

  console.log(`[questions.data] ${questions.length} 个问题，${groups.length} 组`)
  return { groups, questions, byId }
}

export default defineLoader({
  watch: [new URL('../../../../../', import.meta.url).pathname],
  load: loadQuestionsData
})
