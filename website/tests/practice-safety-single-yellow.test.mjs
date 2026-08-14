import test from 'node:test'
import assert from 'node:assert/strict'

import { createEmptyRecord, normalizeRecord } from '../docs/.vitepress/theme/practice/practice-model.mjs'
import { aggregateRecent } from '../docs/.vitepress/theme/practice/practice-stats.mjs'
import { buildSafetyReview } from '../docs/.vitepress/theme/practice/practice-safety.mjs'

const NOW = new Date(2026, 7, 12, 12, 0, 0)

function yellowRecord() {
  return normalizeRecord({
    ...createEmptyRecord(NOW),
    id: 'single-yellow',
    createdAt: '2026-08-12T03:00:00.000Z',
    date: '2026-08-12',
    practiceId: 'practice.basic.natural_breath',
    durationMinutes: 3,
    startState: 'acceptable',
    breathState: 'clearly_controlled',
    issues: ['breath_control'],
    severity: 'yellow'
  })
}

test('单次黄色事件不会被稳定提示覆盖', () => {
  const stats = aggregateRecent([yellowRecord()], { now: NOW, days: 7 })
  const review = buildSafetyReview(stats)

  assert.equal(stats.yellowCount, 1)
  assert.equal(review.level, 'yellow')
  assert.equal(review.flags[0].code, 'yellow_event')
  assert.match(review.primary, /存在 1 次黄色事件/)
  assert.doesNotMatch(review.primary, /没有触发重复安全规则/)
})
