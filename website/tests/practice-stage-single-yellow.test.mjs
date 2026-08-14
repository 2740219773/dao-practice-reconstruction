import test from 'node:test'
import assert from 'node:assert/strict'

import { createEmptyRecord, normalizeRecord } from '../docs/.vitepress/theme/practice/practice-model.mjs'
import { buildStageReview } from '../docs/.vitepress/theme/practice/practice-stage.mjs'

const NOW = new Date(2026, 7, 14, 12, 0, 0)

function yellowRecord() {
  return normalizeRecord({
    ...createEmptyRecord(NOW),
    id: 'stage-yellow-once',
    createdAt: '2026-08-14T03:00:00.000Z',
    date: '2026-08-14',
    practiceId: 'practice.basic.natural_breath',
    durationMinutes: 3,
    startState: 'acceptable',
    breathState: 'mostly_natural',
    afterState: 'normal',
    severity: 'yellow'
  })
}

test('30天复盘保留单次黄色安全提醒，不被长期建议覆盖', () => {
  const review = buildStageReview([yellowRecord()], { now: NOW })

  assert.equal(review.stats.yellowCount, 1)
  assert.equal(review.safety.level, 'yellow')
  assert.equal(review.safety.flags[0].code, 'yellow_event')
  assert.notEqual(review.safety.flags[0].code, 'stable')
  assert.match(review.safety.primary, /存在 1 次黄色事件/)
  assert.match(review.safety.primary, /不应因为只出现一次就被当作“状态稳定”/)

  // 记录不足时长期建议仍可以是“继续补记录”，但安全层必须独立保留，供界面优先展示。
  assert.equal(review.decision.code, 'continue_collect')
})