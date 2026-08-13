import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createEmptyRecord,
  createStoredRecord,
  practiceCardUrl,
  practiceUsesField
} from '../docs/.vitepress/theme/practice/practice-model.mjs'

const NOW = new Date(2026, 7, 13, 9, 30, 0)

function store(draft, id = 'field-test') {
  return createStoredRecord(draft, { id, createdAt: '2026-08-13T01:30:00.000Z' })
}

test('每张实践卡声明自己的最小观察字段', () => {
  assert.equal(practiceUsesField('practice.basic.precheck', 'posture'), false)
  assert.equal(practiceUsesField('practice.basic.natural_breath', 'breath'), true)
  assert.equal(practiceUsesField('practice.basic.natural_breath', 'posture'), false)
  assert.equal(practiceUsesField('practice.basic.attention_return', 'attention'), true)
  assert.equal(practiceUsesField('practice.basic.short_sitting', 'posture'), true)
  assert.equal(practiceUsesField('practice.basic.short_sitting', 'breath'), true)
  assert.equal(practiceUsesField('practice.basic.short_sitting', 'attention'), true)
  assert.equal(practiceUsesField('practice.basic.short_sitting', 'after'), true)
})

test('新记录默认不虚构情绪状态或下次决定', () => {
  const draft = createEmptyRecord(NOW)
  assert.equal(draft.emotionState, 'not_observed')
  assert.equal(draft.nextStep, 'not_decided')

  draft.practiceId = 'practice.basic.posture'
  draft.durationMinutes = 3
  const result = store(draft, 'no-inference-defaults')
  assert.equal(result.ok, true)
  assert.equal(result.record.emotionState, 'not_observed')
  assert.equal(result.record.nextStep, 'not_decided')
})

test('自然察息保存时清理不属于本卡的姿势和注意字段', () => {
  const draft = createEmptyRecord(NOW)
  draft.practiceId = 'practice.basic.natural_breath'
  draft.durationMinutes = 3
  draft.postureState = 'stopped'
  draft.breathState = 'mostly_natural'
  draft.attentionState = 'difficult'
  draft.afterState = 'need_rest'

  const result = store(draft, 'natural-breath-fields')
  assert.equal(result.ok, true)
  assert.equal(result.record.postureState, 'not_observed')
  assert.equal(result.record.breathState, 'mostly_natural')
  assert.equal(result.record.attentionState, 'not_practiced')
  assert.equal(result.record.afterState, 'need_rest')
})

test('短时基础安坐保留姿势、呼吸、注意和练后四类观察', () => {
  const draft = createEmptyRecord(NOW)
  draft.practiceId = 'practice.basic.short_sitting'
  draft.durationMinutes = 5
  draft.postureState = 'adjusted'
  draft.breathState = 'sometimes_controlled'
  draft.attentionState = 'sometimes_returned'
  draft.afterState = 'normal'

  const result = store(draft, 'short-sitting-fields')
  assert.equal(result.ok, true)
  assert.equal(result.record.postureState, 'adjusted')
  assert.equal(result.record.breathState, 'sometimes_controlled')
  assert.equal(result.record.attentionState, 'sometimes_returned')
  assert.equal(result.record.afterState, 'normal')
})

test('主动决定不练时清零练习时长并清理全部练习观察字段', () => {
  const draft = createEmptyRecord(NOW)
  draft.practiceId = 'practice.basic.short_sitting'
  draft.startState = 'skipped'
  draft.durationMinutes = 99
  draft.postureState = 'stopped'
  draft.breathState = 'clearly_controlled'
  draft.attentionState = 'difficult'
  draft.emotionState = 'interfered'
  draft.afterState = 'affected'

  const result = store(draft, 'skip-fields')
  assert.equal(result.ok, true)
  assert.equal(result.record.durationMinutes, 0)
  assert.equal(result.record.postureState, 'not_observed')
  assert.equal(result.record.breathState, 'not_observed')
  assert.equal(result.record.attentionState, 'not_practiced')
  assert.equal(result.record.emotionState, 'not_observed')
  assert.equal(result.record.afterState, 'normal')
})

test('实践卡快捷链接由统一数据模型生成', () => {
  assert.equal(practiceCardUrl('practice.basic.precheck'), '/practice/card/precheck')
  assert.equal(practiceCardUrl('practice.basic.natural_breath'), '/practice/card/natural-breath')
  assert.equal(practiceCardUrl('practice.unknown'), '/practice/')
})
