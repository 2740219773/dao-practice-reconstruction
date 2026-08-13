import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TRIAL_SCHEMA_VERSION,
  buildTrialSummary,
  normalizeTrialEntry,
  normalizeTrialEnvelope,
  parseTrialStorage,
  upsertTrialEntry
} from '../docs/.vitepress/theme/practice/practice-trial.mjs'

test('试运行观察与修持记录分离：规范化不会生成实践字段', () => {
  const item = normalizeTrialEntry({
    date: '2026-08-13',
    duration: 'under_1m',
    entry: 'today',
    unclearField: true,
    unclearFieldName: '开始前状态',
    lowValueField: false,
    pressureFeeling: true,
    note: '入口清楚'
  })
  assert.equal(item.date, '2026-08-13')
  assert.equal(item.unclearFieldName, '开始前状态')
  assert.equal('practiceId' in item, false)
  assert.equal('severity' in item, false)
  assert.equal('durationMinutes' in item, false)
})

test('未使用工作台时自动清理无意义的耗时、入口和字段摩擦', () => {
  const item = normalizeTrialEntry({
    date: '2026-08-13',
    usedWorkbench: false,
    duration: 'over_2m',
    entry: 'card',
    unclearField: true,
    unclearFieldName: '开始前状态',
    lowValueField: true,
    lowValueFieldName: '补充记录',
    pressureFeeling: true,
    note: '今天没有使用工作台'
  })
  assert.equal(item.usedWorkbench, false)
  assert.equal(item.duration, 'not_saved')
  assert.equal(item.entry, 'not_used')
  assert.equal(item.unclearField, false)
  assert.equal(item.unclearFieldName, '')
  assert.equal(item.lowValueField, false)
  assert.equal(item.lowValueFieldName, '')
  assert.equal(item.pressureFeeling, true)
})

test('同一天重复填写只保留最新一条产品观察', () => {
  const first = upsertTrialEntry([], { date: '2026-08-13', note: '第一次' })
  const second = upsertTrialEntry(first, { date: '2026-08-13', note: '第二次', lowValueField: true, lowValueFieldName: '备注' })
  assert.equal(second.length, 1)
  assert.equal(second[0].note, '第二次')
  assert.equal(second[0].lowValueFieldName, '备注')
})

test('7天摘要只统计产品摩擦，不生成阶段或修炼结论', () => {
  const summary = buildTrialSummary([
    { date: '2026-08-13', entry: 'today', duration: 'under_1m', unclearField: false, lowValueField: false, pressureFeeling: false },
    { date: '2026-08-14', entry: 'card', duration: '1_to_2m', unclearField: true, unclearFieldName: '实践卡', lowValueField: true, lowValueFieldName: '备注', pressureFeeling: true, note: '跳转略绕' },
    { date: '2026-08-15', usedWorkbench: false, entry: 'card', duration: 'over_2m', unclearField: true, lowValueField: true, pressureFeeling: false, note: '今天没用工作台' },
    { date: '2026-08-16', entry: 'today', duration: 'under_1m', unclearField: false, lowValueField: true, lowValueFieldName: '备注', pressureFeeling: false }
  ])
  assert.equal(summary.observationCount, 4)
  assert.equal(summary.workbenchDays, 3)
  assert.equal(summary.unusedDays, 1)
  assert.equal(summary.unclearCount, 1)
  assert.equal(summary.lowValueCount, 2)
  assert.equal(summary.pressureCount, 1)
  assert.equal(summary.mostUsedEntry, 'today')
  assert.equal('stage' in summary, false)
  assert.equal('score' in summary, false)
})

test('未来试运行观察版本拒绝被旧版本覆盖', () => {
  const result = normalizeTrialEnvelope({ schemaVersion: TRIAL_SCHEMA_VERSION + 1, entries: [] })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'future_version')
})

test('非法本地JSON不会伪装成空观察数据', () => {
  const result = parseTrialStorage('{broken')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'invalid_json')
})
