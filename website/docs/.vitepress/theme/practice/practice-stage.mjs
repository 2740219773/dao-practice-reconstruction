import { PRACTICES } from './practice-model.mjs'
import { aggregateRecent, recentRecords } from './practice-stats.mjs'
import { buildSafetyReview } from './practice-safety.mjs'

const STATUS = {
  stable: '记录支持稳定',
  partial: '记录支持部分稳定',
  unstable: '尚未稳定',
  insufficient: '记录不足',
  paused: '因安全原因暂停'
}

function localDateString(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateAtOffset(now, offset) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d
}

function recordsForPractice(records, ids) {
  const allowed = new Set(ids)
  return records.filter((record) => record.startState !== 'skipped' && allowed.has(record.practiceId))
}

function count(records, predicate) {
  return records.filter(predicate).length
}

function statusResult(code, evidence, note) {
  return { code, label: STATUS[code], evidence, note }
}

function assessBody(records, safety) {
  if (safety.level === 'red') return statusResult('paused', 0, '存在红色安全事件，阶段能力判断暂停。')
  const relevant = recordsForPractice(records, [
    'practice.basic.posture',
    'practice.basic.contact_awareness',
    'practice.basic.short_sitting',
    'practice.basic.movement_stillness'
  ])
  if (relevant.length < 3) return statusResult('insufficient', relevant.length, '与调身/身体觉察相关的有效记录少于3次。')

  const problemCount = relevant.filter((r) => (r.issues || []).some((id) => ['posture_pain', 'numbness', 'shoulder_neck_tension'].includes(id))).length
  const stoppedCount = count(relevant, (r) => r.postureState === 'stopped')
  const comfortableCount = count(relevant, (r) => ['comfortable', 'acceptable', 'adjusted'].includes(r.postureState))

  if (problemCount >= 3 || stoppedCount >= 2) return statusResult('unstable', relevant.length, '姿势疼痛/麻木/肩颈紧张或因姿势停止反复出现。')
  if (comfortableCount >= 5 && problemCount === 0) return statusResult('stable', relevant.length, '多次记录显示姿势可接受，且未反复出现姿势问题。')
  return statusResult('partial', relevant.length, '已有一定舒适/可调整记录，但仍需继续观察。')
}

function assessBreath(records, safety) {
  if (safety.level === 'red') return statusResult('paused', 0, '存在红色安全事件，阶段能力判断暂停。')
  const relevant = recordsForPractice(records, [
    'practice.basic.natural_breath',
    'practice.basic.short_sitting'
  ]).filter((r) => r.breathState !== 'not_observed')
  if (relevant.length < 3) return statusResult('insufficient', relevant.length, '有呼吸观察信息的记录少于3次。')

  const clearlyControlled = count(relevant, (r) => r.breathState === 'clearly_controlled')
  const sometimesControlled = count(relevant, (r) => r.breathState === 'sometimes_controlled')
  const natural = count(relevant, (r) => r.breathState === 'mostly_natural')

  if (clearlyControlled >= 2) return statusResult('unstable', relevant.length, '明显主动控制呼吸重复出现，应优先回退而不是加强察息。')
  if (natural >= 5 && clearlyControlled === 0 && sometimesControlled <= 1) return statusResult('stable', relevant.length, '多次记录显示自然呼吸为主，且无重复明显控制。')
  return statusResult('partial', relevant.length, '已有自然呼吸记录，但仍有控制或样本较少。')
}

function assessAttention(records, safety) {
  if (safety.level === 'red') return statusResult('paused', 0, '存在红色安全事件，阶段能力判断暂停。')
  const relevant = recordsForPractice(records, [
    'practice.basic.attention_return',
    'practice.basic.short_sitting',
    'practice.basic.daily_awareness'
  ]).filter((r) => r.attentionState !== 'not_practiced')
  if (relevant.length < 3) return statusResult('insufficient', relevant.length, '有注意返回信息的记录少于3次。')

  const returned = count(relevant, (r) => r.attentionState === 'returned')
  const sometimes = count(relevant, (r) => r.attentionState === 'sometimes_returned')
  const difficult = count(relevant, (r) => r.attentionState === 'difficult')

  if (difficult >= 3 && difficult > returned) return statusResult('unstable', relevant.length, '“注意返回较困难”反复出现，暂不把它解释为已稳定。')
  if (returned >= 5 && difficult <= 1) return statusResult('stable', relevant.length, '多次记录显示能够发现并返回，困难记录较少。')
  if (returned + sometimes >= 3) return statusResult('partial', relevant.length, '已有多次发现/返回记录，但稳定性仍需观察。')
  return statusResult('unstable', relevant.length, '目前记录尚不足以支持注意返回稳定。')
}

function assessDailyLife(records, safety) {
  if (safety.level === 'red') return statusResult('paused', 0, '存在红色安全事件，阶段能力判断暂停。')
  if ((safety.flags || []).some((flag) => flag.code === 'function_impact')) {
    return statusResult('unstable', 0, '存在现实功能受影响记录，优先降低负荷。')
  }

  const relevant = recordsForPractice(records, ['practice.basic.daily_awareness'])
  const normalAfter = count(records, (r) => r.startState !== 'skipped' && r.afterState === 'normal')
  if (relevant.length < 2) {
    return statusResult('insufficient', relevant.length, `日用觉察记录少于2次；同时有 ${normalAfter} 次练后正常回到日常的记录。`)
  }
  if (relevant.length >= 4 && normalAfter >= 6) return statusResult('stable', relevant.length, '已有多次日用觉察，且练后回到日常的记录较充分。')
  return statusResult('partial', relevant.length, '已有日用迁移记录，但还不足以判断长期稳定。')
}

export function buildThirtyDayDistribution(records, { now = new Date(), days = 30 } = {}) {
  const window = recentRecords(records, { now, days })
  const byDate = new Map()
  for (const record of window) {
    if (!byDate.has(record.date)) byDate.set(record.date, [])
    byDate.get(record.date).push(record)
  }

  const output = []
  for (let i = days - 1; i >= 0; i--) {
    const date = localDateString(dateAtOffset(now, -i))
    const rows = byDate.get(date) || []
    const practiced = rows.some((r) => r.startState !== 'skipped')
    const skipped = rows.length > 0 && rows.every((r) => r.startState === 'skipped')
    const red = rows.some((r) => r.severity === 'red')
    const yellow = rows.some((r) => r.severity === 'yellow')
    output.push({
      date,
      status: practiced ? 'practiced' : skipped ? 'skipped' : 'no_record',
      severity: red ? 'red' : yellow ? 'yellow' : 'none',
      records: rows.length
    })
  }
  return output
}

export function buildStageReview(records, { now = new Date() } = {}) {
  const stats = aggregateRecent(records, { now, days: 30 })
  const safety = buildSafetyReview(stats)
  const capabilities = {
    body: assessBody(stats.records, safety),
    breath: assessBreath(stats.records, safety),
    attention: assessAttention(stats.records, safety),
    dailyLife: assessDailyLife(stats.records, safety)
  }

  const values = Object.values(capabilities)
  const stableOrPartial = values.filter((item) => ['stable', 'partial'].includes(item.code)).length
  const unstable = values.filter((item) => item.code === 'unstable').length
  const insufficient = values.filter((item) => item.code === 'insufficient').length

  let decision = {
    code: 'continue_observe',
    label: '继续当前基础阶段并观察',
    reason: '当前数据更适合继续积累，而不是自动升级。'
  }

  if (stats.redCount > 0) {
    decision = {
      code: 'pause_for_safety',
      label: '因安全原因暂停并处理异常',
      reason: '30天窗口中存在红色事件，安全优先于任何阶段进度。'
    }
  } else if (stats.issueCountMap.function_impact > 0 || stats.yellowCount >= 3 || unstable >= 2) {
    decision = {
      code: 'step_back_or_pause',
      label: '优先回退、缩短或暂停相关单元',
      reason: '记录中存在重复黄色/功能影响或多项基础能力尚未稳定。'
    }
  } else if (stats.actualPracticeCount < 8 || insufficient >= 2) {
    decision = {
      code: 'continue_collect',
      label: '继续当前阶段，先补足记录',
      reason: '30天内的有效练习或关键能力记录不足，暂不做升级判断。'
    }
  } else if (stats.overLimitCount >= 3) {
    decision = {
      code: 'return_reviewed_load',
      label: '回到已审查负荷后再评估',
      reason: '多次超过实践卡审查上限，不把超时视为能力提升证据。'
    }
  } else if (stats.actualPracticeCount >= 12 && stableOrPartial === 4 && unstable === 0 && stats.yellowCount === 0 && stats.redCount === 0) {
    decision = {
      code: 'discuss_diversion',
      label: '可以讨论下一阶段或分流',
      reason: '记录显示四类基础能力均已有稳定/部分稳定证据，且30天内未出现黄色或红色事件；这仍不是自动解锁。'
    }
  }

  return {
    stats,
    safety,
    capabilities,
    decision,
    distribution: buildThirtyDayDistribution(records, { now, days: 30 }),
    evidenceNotice: '本评估只根据本机自填记录生成“记录支持状态”，不是医学评估、修炼境界判断或传统师承认证。'
  }
}

export function stageCapabilityRows(review) {
  return [
    ['身体适应', review.capabilities.body],
    ['呼吸自然度', review.capabilities.breath],
    ['注意发现与返回', review.capabilities.attention],
    ['日用迁移', review.capabilities.dailyLife]
  ]
}

export { STATUS as STAGE_STATUS_LABELS }
