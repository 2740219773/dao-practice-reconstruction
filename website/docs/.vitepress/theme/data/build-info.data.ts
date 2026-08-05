import { defineLoader } from 'vitepress'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './_lib/读取知识卡.ts'

export interface BuildInfo {
  commit: string
  buildTime: string
  environment: string
}

declare const data: BuildInfo
export { data }

export default defineLoader({
  watch: [new URL('../../../../../', import.meta.url).pathname],
  load(): BuildInfo {
    const file = path.join(REPO_ROOT, 'website', 'docs', 'public', 'build-info.json')
    if (!existsSync(file)) return { commit: 'unknown', buildTime: '', environment: 'preview' }
    return JSON.parse(readFileSync(file, 'utf8')) as BuildInfo
  }
})
