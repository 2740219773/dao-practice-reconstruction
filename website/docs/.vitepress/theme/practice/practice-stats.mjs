import { PRACTICE_BY_ID } from './practice-model.mjs'

function localMidnight(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  date.setHours(0, 0, 0, 0)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function recentRecords(records, { now = new Date(), days = 7 } = {}) {
  const end = localMidnight(now)
  const start = new Date(end)
  start.setDate(start.getDate() - Math.max(1, Number(days) || 7) + 1)

  return records.filter((record) => {
    const date = parseLocalDate(record.date)
    return date && date >= start && date <= end
  })
}

function sortedCounts(records, selector) {
  const counts = {}
  for (const record of records) {
    for (const key of selector(record)) counts[key] = (counts[key] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
}

export function aggregateRecent(records, options = {}) {
  const windowRecords = recentRecords(records, options)
  const issueCounts = sortedCounts(windowRecords, (record) => Array.isArray(record.issues) ? record.issues : [])
  const practiceCounts = sortedCounts(windowRecords, (record) => [record.practiceId])

  const totalMinutes = windowRecords.reduce((sum, record) => sum + Number(record.durationMinutes || 0), 0)
  const yellowCount = windowRecords.filter((record) => record.severity === 'yellow').length
  const redCount = windowRecords.filter((record) => record.severity === 'red').length
  const skippedCount = windowRecords.filter((record) => record.startState === 'skipped').length
  const actualPracticeCount = windowRecords.length - skippedCount
  const overLimitCount = windowRecords.filter((record) => {
    const practice = PRACTICE_BY_ID.get(record.practiceId)
    return practice && Number(record.durationMinutes || 0) > practice.max
  }).length

  return {
    records: windowRecords,
    recordCount: windowRecords.length,
    actualPracticeCount,
    skippedCount,
    totalMinutes,
    yellowCount,
    redCount,
    overLimitCount,
    issueCounts,
    practiceCounts,
    issueCountMap: Object.fromEntries(issueCounts),
    practiceCountMap: Object.fromEntries(practiceCounts)
  }
}
