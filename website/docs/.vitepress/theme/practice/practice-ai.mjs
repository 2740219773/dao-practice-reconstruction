import { ISSUE_LABELS, PRACTICE_LABELS, localDateString } from './practice-model.mjs'

export function buildReviewSummary(stats, safetyReview, now = new Date()) {
  const topPractice = stats.practiceCounts?.[0]
  const repeated = (stats.issueCounts || []).filter(([, count]) => count >= 2)

  return [
    `时间范围：最近7天（截至 ${localDateString(now)}）`,
    `记录次数：${stats.recordCount || 0}`,
    `实际进行练习：${stats.actualPracticeCount || 0} 次`,
    `主动决定不练：${stats.skippedCount || 0} 次`,
    `实际总时长：${stats.totalMinutes || 0} 分钟`,
    `超过卡片审查上限：${stats.overLimitCount || 0} 次`,
    `主要实践：${topPractice ? `${PRACTICE_LABELS[topPractice[0]] || topPractice[0]} ${topPractice[1]} 次` : '暂无'}`,
    `黄色事件：${stats.yellowCount || 0} 次`,
    `红色事件：${stats.redCount || 0} 次`,
    `重复问题：${repeated.length ? repeated.map(([id, count]) => `${ISSUE_LABELS[id] || id} ${count} 次`).join('；') : '未发现出现2次以上的问题'}`,
    `规则型安全提示：${safetyReview?.primary || '暂无'}`
  ].join('\n')
}

export function buildAiPrompt(summary) {
  return `你正在帮助我复盘“问道志”基础实践记录。\n\n规则：\n1. 只根据我提供的记录总结，不补造经历。\n2. 区分观察事实、我的个人解释和传统理论。\n3. 不诊断疾病，不判断气、经络、丹田、境界。\n4. 不生成闭气、胎息、强呼吸、强意守、周天、火候、采炼、辟谷、丹药等教程。\n5. 有红色安全信号时，优先建议停止相关练习并按安全规范处理。\n6. 同一黄色问题反复出现时，优先建议缩短、回退或暂停。\n7. 没有异常也不要自动增加练习时长。\n8. “主动决定不练”可以是安全判断结果，不把它描述为失败或缺乏意志。\n9. 实际超出审查上限只作为事实和负荷信号，不把超时解释为进步。\n10. 按“本周事实—重复模式—安全提醒—下周建议—不能判断的部分”五段输出。\n\n以下是我的记录摘要：\n${summary}`
}
