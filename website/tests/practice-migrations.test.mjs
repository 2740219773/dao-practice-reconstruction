import test from 'node:test'
import assert from 'node:assert/strict'

import { SCHEMA_VERSION, createEmptyRecord, normalizeRecord } from '../docs/.vitepress/theme/practice/practice-model.mjs'
import { migrateEnvelope, migrationRegistry, parseAndMigrateStored } from '../docs/.vitepress/theme/practice/practice-migrations.mjs'

function v1Record(overrides = {}) {
  return {
    ...createEmptyRecord(new Date(2026, 7, 12)),
    id: overrides.id || 'migrate-1',
    createdAt: '2026-08-12T03:00:00.000Z',
    date: '2026-08-12',
    practiceId: 'practice.basic.precheck',
    durationMinutes: 2,
    ...overrides
  }
}

test('当前 schema v1 本地数据无需迁移即可读取', () => {
  const result = parseAndMigrateStored(JSON.stringify({ schemaVersion: 1, records: [v1Record()] }), {
    currentVersion: SCHEMA_VERSION,
    normalizeRecord
  })
  assert.equal(result.ok, true)
  assert.equal(result.migrated, false)
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].schemaVersion, 1)
})

test('损坏的本地 JSON 明确失败而不是伪装成无记录', () => {
  const result = parseAndMigrateStored('{broken json', {
    currentVersion: SCHEMA_VERSION,
    normalizeRecord
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'invalid_json')
  assert.match(result.error, /原数据不会被覆盖/)
})

test('未来 schema 版本拒绝自动降级', () => {
  const result = migrateEnvelope({ schemaVersion: 2, records: [v1Record()] }, {
    currentVersion: 1,
    normalizeRecord
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'future_version')
  assert.match(result.error, /不会自动降级/)
})

test('缺少逐版本迁移函数时停止并保留原数据边界', () => {
  const result = migrateEnvelope({ schemaVersion: 1, records: [v1Record()] }, {
    currentVersion: 2,
    normalizeRecord,
    migrations: migrationRegistry([])
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'missing_migration')
  assert.match(result.error, /缺少 schema v1 → v2/)
})

test('显式 v1→v2 迁移可以逐版本执行且不修改输入对象', () => {
  const source = {
    schemaVersion: 1,
    records: [{ id: 'legacy', value: 'old' }]
  }
  const snapshot = structuredClone(source)
  const migrations = migrationRegistry([
    [1, (payload) => ({
      ...payload,
      schemaVersion: 2,
      records: payload.records.map((record) => ({ ...record, addedInV2: true }))
    })]
  ])
  const result = migrateEnvelope(source, {
    currentVersion: 2,
    migrations,
    normalizeRecord: (record) => record
  })
  assert.equal(result.ok, true)
  assert.equal(result.migrated, true)
  assert.equal(result.sourceVersion, 1)
  assert.equal(result.targetVersion, 2)
  assert.equal(result.records[0].addedInV2, true)
  assert.deepEqual(source, snapshot)
})

test('迁移函数输出错误版本时拒绝继续', () => {
  const migrations = migrationRegistry([
    [1, (payload) => ({ ...payload, schemaVersion: 3 })]
  ])
  const result = migrateEnvelope({ schemaVersion: 1, records: [] }, {
    currentVersion: 2,
    migrations,
    normalizeRecord: (record) => record
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'migration_failed')
})
