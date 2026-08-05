#!/usr/bin/env node

const args = process.argv.slice(2)
const argBase = args.find((arg) => arg.startsWith('--base-url='))?.slice('--base-url='.length)
const baseUrl = (argBase || process.env.WDZ_SMOKE_BASE_URL || '').replace(/\/$/, '')

if (!baseUrl) {
  console.log('[smoke] 未配置 WDZ_SMOKE_BASE_URL，跳过线上冒烟测试。')
  process.exit(0)
}

const checks = [
  ['首页', '/'],
  ['专题入口', '/topics/'],
  ['静专题', '/topics/jing'],
  ['知识索引', '/knowledge/'],
  ['问题地图', '/question-map/'],
  ['安全边界', '/safety/'],
  ['构建信息', '/build-info.json']
]

async function get(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, { redirect: 'manual', ...options })
}

async function main() {
  const home = await get('/')
  if (home.status !== 200) throw new Error(`首页返回 ${home.status}`)
  const homeText = await home.text()
  if (!homeText.includes('问题地图')) throw new Error('首页未包含“问题地图”')

  const infoResponse = await get('/build-info.json')
  if (infoResponse.status !== 200) throw new Error(`build-info.json 返回 ${infoResponse.status}`)
  const info = await infoResponse.json()
  if (!info.commit || !info.buildTime) throw new Error('build-info.json 缺少 commit 或 buildTime')
  if (!homeText.includes(info.commit)) throw new Error(`首页未包含构建 SHA ${info.commit}`)

  for (const [label, pathname] of checks.slice(1)) {
    const response = await get(pathname)
    if (response.status !== 200) throw new Error(`${label} ${pathname} 返回 ${response.status}`)
  }

  const host = new URL(baseUrl).hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    console.log('[smoke] 本地预览不解释 Cloudflare _redirects，跳过旧 URL 重定向断言。')
  } else {
    const legacy = await get('/library/')
    const location = legacy.headers.get('location') || ''
    if (![301, 302, 307, 308].includes(legacy.status) || !location.includes('/knowledge/')) {
      throw new Error(`旧资料库路径未正确重定向：${legacy.status} ${location}`)
    }
  }

  console.log(`[smoke] 通过：${baseUrl} · ${info.commit} · ${info.buildTime}`)
}

main().catch((error) => {
  console.error(`[smoke] 失败：${error.message}`)
  process.exit(1)
})
