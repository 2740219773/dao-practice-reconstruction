import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCHEMA_VERSION,
  createEmptyRecord,
  createStoredRecord,
  exportPayload,
  mergeImportPayload,
  normalizeRecord,
  validateDraft
} from '../docs/.vitepress/theme/practice/practice-model.mjs'
import { aggregateRecent, recentRecords } from '../docs/.vitepress/theme/practice/practice-stats.mjs'
import { buildSafetyReview, reviewDraftSafety } from '../docs/.vitepress/theme/practice/practice-safety.mjs'
import { buildAiPrompt, buildReviewSummary } from '../docs/.vitepress/theme/practice/practice-ai.mjs'

const NOW = new Date(2026, 7, 12, 12, 0, 0)

function record(overrides = {}) {
  return normalizeRecord({
    ...createEmptyRecord(NOW),
    id: overrides.id || `r-${Math.random().toString(16).slice(2)}`,
    createdAt: overrides.createdAt || '2026-08-12T03:00:00.000Z',
    date: overrides.date || '2026-08-12',
    practiceId: overrides.practiceId || 'practice.basic.natural_breath',
    durationMinutes: overrides.durationMinutes ?? 3,
    startState: overrides.startState || 'acceptable',
    issues: overrides.issues || [],
    severity: overrides.severity || 'none',
    afterState: overrides.afterState || 'normal',
    breathState: overrides.breathState || 'mostly_natural',
    note: overrides.note || '',
    ...overrides
  })
}

test('正常记录可以通过模型校验', () => {
  const draft = createEmptyRecord(NOW)
  draft.practiceId = 'practice.basic.posture'
  draft.durationMinutes = 3
  const result = createStoredRecord(draft, { id: 'normal-1', createdAt: '2026-08-12T03:00:00.000Z' })
  assert.equal(result.ok, true)
  assert.equal(result.record.durationMinutes, 3)
  assert.equal(result.overLimit, false)
})

test('主动决定不练允许记录为 0 分钟且不视为失败数据', () => {
  const draft = createEmptyRecord(NOW)
  draft.startState = 'skipped'
  draft.durationMinutes = 99
  const checked = validateDraft(draft)
  assert.equal(checked.ok, true)
  assert.equal(checked.actual, 0)

  const stored = createStoredRecord(draft, { id: 'skip-1' })
  assert.equal(stored.record.durationMinutes, 0)
  assert.equal(stored.record.startState, 'skipped')
})

test('实际超出审查上限仍可如实保存并标记 overLimit', () => {
  const draft = createEmptyRecord(NOW)
  draft.practiceId = 'practice.basic.natural_breath'
  draft.durationMinutes = 8
  const result = createStoredRecord(draft, { id: 'over-1' })
  assert.equal(result.ok, true)
  assert.equal(result.overLimit, true)
  assert.equal(result.reviewedMax, 5)
  assert.equal(result.record.durationMinutes, 8)
})

test('超过记录系统绝对边界的数据被拒绝', () => {
  const draft = createEmptyRecord(NOW)
  draft.durationMinutes = 121
  assert.equal(validateDraft(draft).ok, false)
})

test('导入时过滤未知实践 ID 和未知问题字段，并按 ID 合并', () => {
  const existing = [record({ id: 'same', note: '旧记录' })]
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    records: [
      { ...record({ id: 'same', note: '新记录', issues: ['breath_control'] }), note: '新记录' },
      { ...record({ id: 'new', issues: ['breath_control', 'unknown_issue'] }) },
      { ...record({ id: 'bad' }), practiceId: 'practice.unknown' }
    ]
  }
  const merged = mergeImportPayload(existing, payload)
  assert.equal(merged.ok, true)
  assert.equal(merged.accepted, 2)
  assert.equal(merged.rejected, 1)
  assert.equal(merged.records.length, 2)
  assert.equal(merged.records.find((item) => item.id === 'same').note, '新记录')
  assert.deepEqual(merged.records.find((item) => item.id === 'new').issues, ['breath_control'])
})

test('导出数据只包含可规范化记录', () => {
  const payload = exportPayload([record({ id: 'good' }), null, { id: 'bad' }], '2026-08-12T12:00:00.000Z')
  assert.equal(payload.schemaVersion, SCHEMA_VERSION)
  assert.equal(payload.records.length, 1)
  assert.equal(payload.records[0].id, 'good')
})

test('最近7天只包含 8月6日至8月12日，不包含更早或未来记录', () => {
  const records = [
    record({ id: 'old', date: '2026-08-05' }),
    record({ id: 'start', date: '2026-08-06' }),
    record({ id: 'today', date: '2026-08-12' }),
    record({ id: 'future', date: '2026-08-13' })
  ]
  assert.deepEqual(recentRecords(records, { now: NOW, days: 7 }).map((item) => item.id), ['start', 'today'])
})

test('7天统计分别计算实际练习、主动不练、超时和安全事件', () => {
  const records = [
    record({ id: 'a', date: '2026-08-10', durationMinutes: 8, practiceId: 'practice.basic.natural_breath', severity: 'yellow', issues: ['breath_control'] }),
    record({ id: 'b', date: '2026-08-11', durationMinutes: 7, practiceId: 'practice.basic.natural_breath', severity: 'yellow', issues: ['breath_control'] }),
    record({ id: 'c', date: '2026-08-12', durationMinutes: 0, startState: 'skipped' })
  ]
  const stats = aggregateRecent(records, { now: NOW, days: 7 })
  assert.equal(stats.recordCount, 3)
  assert.equal(stats.actualPracticeCount, 2)
  assert.equal(stats.skippedCount, 1)
  assert.equal(stats.totalMinutes, 15)
  assert.equal(stats.overLimitCount, 2)
  assert.equal(stats.yellowCount, 2)
  assert.equal(stats.issueCountMap.breath_control, 2)
})

test('红色事件永远成为最高优先级规则提示', () => {
  const stats = aggregateRecent([
    record({ id: 'red', severity: 'red', issues: ['function_impact'] }),
    record({ id: 'yellow', severity: 'yellow', issues: ['breath_control'] })
  ], { now: NOW })
  const review = buildSafetyReview(stats)
  assert.equal(review.level, 'red')
  assert.equal(review.flags[0].code, 'red_event')
})

test('重复主动控制呼吸会触发回退提示', () => {
  const stats = aggregateRecent([
    record({ id: 'a', issues: ['breath_control'] }),
    record({ id: 'b', issues: ['breath_control'] })
  ], { now: NOW })
  const review = buildSafetyReview(stats)
  assert.ok(review.flags.some((flag) => flag.code === 'repeated_breath_control'))
  assert.match(review.flags.find((flag) => flag.code === 'repeated_breath_control').text, /暂时跳过察息/)
})

test('反复超出审查时长会提示回到已审查负荷', () => {
  const stats = aggregateRecent([
    record({ id: 'a', durationMinutes: 8 }),
    record({ id: 'b', durationMinutes: 9 })
  ], { now: NOW })
  const review = buildSafetyReview(stats)
  assert.ok(review.flags.some((flag) => flag.code === 'repeated_over_limit'))
})

test('高关注问题却标记无升级事件时提示重新核对分流', () => {
  const notices = reviewDraftSafety(record({ id: 'draft', issues: ['function_impact'], severity: 'none', afterState: 'affected' }))
  assert.equal(notices[0].level, 'yellow')
  assert.match(notices[0].text, /重新核对/)
})

test('自然察息出现明显主动控制时给出回退提醒', () => {
  const notices = reviewDraftSafety(record({ id: 'draft', practiceId: 'practice.basic.natural_breath', breathState: 'clearly_controlled' }))
  assert.ok(notices.some((item) => /身体接触或环境声音/.test(item.text)))
})

test('AI摘要明确保留不练、超时和安全边界，不包含个人长备注', () => {
  const stats = aggregateRecent([
    record({ id: 'a', durationMinutes: 8, note: '秘密备注，不应进入摘要' }),
    record({ id: 'b', startState: 'skipped', durationMinutes: 0 })
  ], { now: NOW })
  const safety = buildSafetyReview(stats)
  const summary = buildReviewSummary(stats, safety, NOW)
  const prompt = buildAiPrompt(summary)
  assert.match(summary, /主动决定不练：1 次/)
  assert.match(summary, /超过卡片审查上限：1 次/)
  assert.match(prompt, /不诊断疾病/)
  assert.match(prompt, /主动决定不练.*不把它描述为失败/)
  assert.doesNotMatch(prompt, /秘密备注/)
})
