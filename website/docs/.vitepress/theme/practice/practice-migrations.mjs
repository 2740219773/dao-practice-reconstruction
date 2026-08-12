export function migrateEnvelope(payload, {
  currentVersion,
  normalizeRecord,
  migrations = new Map()
} = {}) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.records)) {
    return { ok: false, code: 'invalid_structure', error: '记录结构不支持', records: [], migrated: false }
  }

  const sourceVersion = Number(payload.schemaVersion)
  const targetVersion = Number(currentVersion)
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1 || !Number.isInteger(targetVersion) || targetVersion < 1) {
    return { ok: false, code: 'invalid_version', error: '记录版本无效', records: [], migrated: false }
  }

  if (sourceVersion > targetVersion) {
    return {
      ok: false,
      code: 'future_version',
      error: `记录来自更高版本 schema v${sourceVersion}；当前只支持到 v${targetVersion}。为避免覆盖新数据，本版本不会自动降级。`,
      records: [],
      sourceVersion,
      targetVersion,
      migrated: false
    }
  }

  let working = structuredClone(payload)
  let version = sourceVersion
  while (version < targetVersion) {
    const migrate = migrations.get(version)
    if (typeof migrate !== 'function') {
      return {
        ok: false,
        code: 'missing_migration',
        error: `缺少 schema v${version} → v${version + 1} 的显式迁移规则；原数据不会被覆盖。`,
        records: [],
        sourceVersion,
        targetVersion,
        migrated: false
      }
    }

    working = migrate(structuredClone(working))
    if (!working || Number(working.schemaVersion) !== version + 1 || !Array.isArray(working.records)) {
      return {
        ok: false,
        code: 'migration_failed',
        error: `schema v${version} → v${version + 1} 迁移结果无效；原数据不会被覆盖。`,
        records: [],
        sourceVersion,
        targetVersion,
        migrated: false
      }
    }
    version += 1
  }

  const normalize = typeof normalizeRecord === 'function' ? normalizeRecord : (record) => record
  const records = working.records.map(normalize).filter(Boolean)
  const rejected = working.records.length - records.length

  return {
    ok: true,
    code: 'ok',
    records,
    rejected,
    sourceVersion,
    targetVersion,
    migrated: sourceVersion !== targetVersion,
    envelope: { ...working, schemaVersion: targetVersion, records }
  }
}

export function parseAndMigrateStored(rawText, options = {}) {
  if (!rawText) return { ok: true, code: 'empty', records: [], rejected: 0, migrated: false }
  try {
    const payload = JSON.parse(rawText)
    return migrateEnvelope(payload, options)
  } catch {
    return { ok: false, code: 'invalid_json', error: '本地记录不是有效 JSON；原数据不会被覆盖。', records: [], migrated: false }
  }
}

export function migrationRegistry(entries = []) {
  const map = new Map()
  for (const [fromVersion, migrate] of entries) {
    if (!Number.isInteger(Number(fromVersion)) || typeof migrate !== 'function') throw new Error('迁移注册表必须使用整数版本与函数')
    map.set(Number(fromVersion), migrate)
  }
  return map
}
