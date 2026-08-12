export const STORAGE_KEY = 'wendaozhi.practice.records.v1'
export const SCHEMA_VERSION = 1

export const PRACTICES = Object.freeze([
  { id: 'practice.basic.precheck', name: '01 准备与安全检查', max: 3 },
  { id: 'practice.basic.posture', name: '02 调身与舒适姿势', max: 5 },
  { id: 'practice.basic.contact_awareness', name: '03 身体接触觉察', max: 5 },
  { id: 'practice.basic.natural_breath', name: '04 自然察息', max: 5 },
  { id: 'practice.basic.attention_return', name: '05 注意返回与收心基础', max: 6 },
  { id: 'practice.basic.short_sitting', name: '06 短时基础安坐', max: 10 },
  { id: 'practice.basic.movement_stillness', name: '07 轻柔动静转换', max: 8 },
  { id: 'practice.basic.daily_awareness', name: '08 日用觉察', max: 3 }
])

export const PRACTICE_BY_ID = new Map(PRACTICES.map((item) => [item.id, item]))
export const PRACTICE_LABELS = Object.fromEntries(PRACTICES.map((item) => [item.id, item.name.replace(/^\d+\s*/, '')]))

export const ISSUE_OPTIONS = Object.freeze([
  ['posture_pain', '姿势疼痛'],
  ['numbness', '麻木'],
  ['shoulder_neck_tension', '肩颈紧张'],
  ['breath_control', '主动控制呼吸'],
  ['dizziness_chest', '头晕、胸闷或明显心慌'],
  ['restlessness', '明显烦躁'],
  ['sleepiness', '困倦'],
  ['special_sensation_chasing', '追求特殊感觉'],
  ['perceptual_reality_change', '异常感知或现实感变化'],
  ['function_impact', '练后影响现实功能'],
  ['other', '其他']
])

export const ISSUE_LABELS = Object.fromEntries(ISSUE_OPTIONS)
export const KNOWN_ISSUES = new Set(ISSUE_OPTIONS.map(([id]) => id))

export function localDateString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function createEmptyRecord(date = new Date()) {
  return {
    id: '',
    schemaVersion: SCHEMA_VERSION,
    createdAt: '',
    date: localDateString(date),
    practiceId: PRACTICES[0].id,
    durationMinutes: 2,
    startState: 'acceptable',
    postureState: 'not_observed',
    breathState: 'not_observed',
    attentionState: 'not_practiced',
    emotionState: 'stable',
    afterState: 'normal',
    issues: [],
    severity: 'none',
    adjustment: '',
    note: '',
    nextStep: 'continue'
  }
}

export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!raw.id || !raw.date || !raw.practiceId || !PRACTICE_BY_ID.has(String(raw.practiceId))) return null

  const durationMinutes = Number(raw.durationMinutes)
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 120) return null

  const severity = ['none', 'yellow', 'red'].includes(raw.severity) ? raw.severity : 'none'
  const issues = Array.isArray(raw.issues)
    ? [...new Set(raw.issues.filter((item) => typeof item === 'string' && KNOWN_ISSUES.has(item)))]
    : []

  return {
    ...createEmptyRecord(),
    ...raw,
    id: String(raw.id),
    schemaVersion: SCHEMA_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    date: String(raw.date),
    practiceId: String(raw.practiceId),
    durationMinutes,
    issues,
    severity,
    adjustment: typeof raw.adjustment === 'string' ? raw.adjustment.slice(0, 160) : '',
    note: typeof raw.note === 'string' ? raw.note.slice(0, 600) : ''
  }
}

export function validateDraft(form) {
  if (!form || !PRACTICE_BY_ID.has(String(form.practiceId))) {
    return { ok: false, error: '实践卡不存在或已失效。' }
  }

  const actual = form.startState === 'skipped' ? 0 : Number(form.durationMinutes)
  if (!Number.isFinite(actual) || actual < 0 || actual > 120) {
    return { ok: false, error: '实际时长需要填写 0—120 分钟之间的数字。超过基础卡上限仍可如实记录，但不建议把超时当作下一次目标。' }
  }
  if (form.startState !== 'skipped' && actual < 1) {
    return { ok: false, error: '如果实际进行了练习，请记录至少 1 分钟；如果决定不练，请把“开始前状态”选为“今天决定不练”。' }
  }

  const reviewedMax = PRACTICE_BY_ID.get(String(form.practiceId)).max
  return { ok: true, actual, reviewedMax, overLimit: actual > reviewedMax }
}

export function createStoredRecord(form, { id, createdAt = new Date().toISOString() }) {
  const check = validateDraft(form)
  if (!check.ok) return { ok: false, error: check.error }

  const record = normalizeRecord({
    ...form,
    id,
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    durationMinutes: check.actual,
    issues: Array.isArray(form.issues) ? [...form.issues] : []
  })
  if (!record) return { ok: false, error: '记录内容无法通过数据校验。' }

  return { ok: true, record, overLimit: check.overLimit, reviewedMax: check.reviewedMax }
}

export function exportPayload(records, exportedAt = new Date().toISOString()) {
  return {
    app: '问道志',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    records: records.map(normalizeRecord).filter(Boolean)
  }
}

export function mergeImportPayload(existingRecords, payload) {
  if (!payload || payload.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.records)) {
    return { ok: false, error: '版本或结构不支持', records: existingRecords, accepted: 0, rejected: 0 }
  }

  const valid = payload.records.map(normalizeRecord).filter(Boolean)
  const rejected = payload.records.length - valid.length
  if (!valid.length && payload.records.length) {
    return { ok: false, error: '没有可识别的记录；未知实践 ID 或非法记录不会导入', records: existingRecords, accepted: 0, rejected }
  }

  const map = new Map(existingRecords.map((record) => [record.id, record]))
  for (const record of valid) map.set(record.id, record)
  const records = [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return { ok: true, records, accepted: valid.length, rejected }
}
