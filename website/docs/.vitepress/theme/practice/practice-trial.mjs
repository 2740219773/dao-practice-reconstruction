export const TRIAL_STORAGE_KEY = 'wendaozhi.practice.trial.v1'
export const TRIAL_SCHEMA_VERSION = 1

export const TRIAL_DURATION_OPTIONS = ['under_1m', '1_to_2m', 'over_2m', 'not_saved']
export const TRIAL_ENTRY_OPTIONS = ['today', 'card', 'direct', 'skip', 'not_used']

function text(value, max = 160) {
  return String(value ?? '').trim().slice(0, max)
}

function bool(value) {
  return value === true
}

export function normalizeTrialEntry(input = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? String(input.date) : ''
  const usedWorkbench = input.usedWorkbench !== false
  const duration = usedWorkbench && TRIAL_DURATION_OPTIONS.includes(input.duration) ? input.duration : 'not_saved'
  const entry = usedWorkbench && TRIAL_ENTRY_OPTIONS.includes(input.entry) && input.entry !== 'not_used' ? input.entry : 'not_used'
  const unclearField = usedWorkbench && bool(input.unclearField)
  const lowValueField = usedWorkbench && bool(input.lowValueField)
  return {
    date,
    usedWorkbench,
    duration,
    entry,
    unclearField,
    unclearFieldName: unclearField ? text(input.unclearFieldName, 80) : '',
    lowValueField,
    lowValueFieldName: lowValueField ? text(input.lowValueFieldName, 80) : '',
    pressureFeeling: bool(input.pressureFeeling),
    note: text(input.note, 240)
  }
}

export function normalizeTrialEnvelope(input) {
  if (!input || typeof input !== 'object') return { ok: true, data: { schemaVersion: TRIAL_SCHEMA_VERSION, entries: [] } }
  const version = Number(input.schemaVersion ?? TRIAL_SCHEMA_VERSION)
  if (version > TRIAL_SCHEMA_VERSION) return { ok: false, reason: 'future_version', raw: input }
  if (version !== TRIAL_SCHEMA_VERSION) return { ok: false, reason: 'unsupported_version', raw: input }
  const entries = Array.isArray(input.entries) ? input.entries.map(normalizeTrialEntry).filter((item) => item.date) : []
  const byDate = new Map()
  for (const item of entries) byDate.set(item.date, item)
  return {
    ok: true,
    data: {
      schemaVersion: TRIAL_SCHEMA_VERSION,
      entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    }
  }
}

export function upsertTrialEntry(entries = [], rawEntry = {}) {
  const entry = normalizeTrialEntry(rawEntry)
  if (!entry.date) throw new Error('试运行观察缺少有效日期')
  const map = new Map(entries.map((item) => [item.date, normalizeTrialEntry(item)]))
  map.set(entry.date, entry)
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function buildTrialSummary(entries = []) {
  const valid = entries.map(normalizeTrialEntry).filter((item) => item.date)
  const entryCounts = Object.fromEntries(TRIAL_ENTRY_OPTIONS.map((key) => [key, 0]))
  const durationCounts = Object.fromEntries(TRIAL_DURATION_OPTIONS.map((key) => [key, 0]))
  let unclearCount = 0
  let lowValueCount = 0
  let pressureCount = 0
  let workbenchDays = 0
  let unusedDays = 0

  for (const item of valid) {
    entryCounts[item.entry] += 1
    durationCounts[item.duration] += 1
    if (item.unclearField) unclearCount += 1
    if (item.lowValueField) lowValueCount += 1
    if (item.pressureFeeling) pressureCount += 1
    if (item.usedWorkbench) workbenchDays += 1
    else unusedDays += 1
  }

  const mostUsedEntry = Object.entries(entryCounts)
    .filter(([key]) => key !== 'not_used')
    .sort((a, b) => b[1] - a[1])[0]

  return {
    observationCount: valid.length,
    workbenchDays,
    unusedDays,
    unclearCount,
    lowValueCount,
    pressureCount,
    entryCounts,
    durationCounts,
    mostUsedEntry: mostUsedEntry?.[1] ? mostUsedEntry[0] : null,
    notes: valid.map((item) => item.note).filter(Boolean)
  }
}

export function parseTrialStorage(raw) {
  if (!raw) return { ok: true, data: { schemaVersion: TRIAL_SCHEMA_VERSION, entries: [] } }
  try {
    return normalizeTrialEnvelope(JSON.parse(raw))
  } catch {
    return { ok: false, reason: 'invalid_json', raw }
  }
}
