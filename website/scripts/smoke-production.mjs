#!/usr/bin/env node

const args = process.argv.slice(2)
const argBase = args.find((arg) => arg.startsWith('--base-url='))?.slice('--base-url='.length)
const baseUrl = (argBase || process.env.WDZ_SMOKE_BASE_URL || 'https://wendaozhi.pages.dev').replace(/\/$/, '')
const expectedCommit = String(process.env.WDZ_EXPECT_COMMIT || '').slice(0, 8)
const maxAttempts = Math.max(1, Number(process.env.WDZ_SMOKE_ATTEMPTS || 36))
const retryMs = Math.max(250, Number(process.env.WDZ_SMOKE_RETRY_MS || 10000))

const checks = [
  ['首页', '/'],
  ['专题入口', '/topics/'],
  ['静专题', '/topics/jing'],
  ['知识索引', '/knowledge/'],
  ['问题地图', '/question-map/'],
  ['安全边界', '/safety/'],
  ['实践工作台', '/practice/'],
  ['自然察息实践卡', '/practice/card/natural-breath'],
  ['构建信息', '/build-info.json']
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function get(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    redirect: 'manual',
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache', ...(options.headers || {}) },
    ...options
  })
}

async function readBuildInfo() {
  const response = await get(`/build-info.json?smoke=${Date.now()}`)
  if (response.status !== 200) throw new Error(`build-info.json 返回 ${response.status}`)
  const info = await response.json()
  if (!info.commit || !info.buildTime) throw new Error('build-info.json 缺少 commit 或 buildTime')
  return info
}

async function waitForExpectedDeployment() {
  let last = null
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await readBuildInfo()
      last = info
      if (!expectedCommit || String(info.commit).slice(0, 8) === expectedCommit) {
        if (attempt > 1) console.log(`[smoke] Pages 已追上目标提交：${info.commit}（第 ${attempt} 次检查）`)
        return info
      }
      console.log(`[smoke] 等待 Pages 部署：线上 ${info.commit}，目标 ${expectedCommit}，${attempt}/${maxAttempts}`)
    } catch (error) {
      lastError = error
      console.log(`[smoke] 等待线上可用：${error.message}，${attempt}/${maxAttempts}`)
    }

    if (attempt < maxAttempts) await sleep(retryMs)
  }

  if (expectedCommit && last?.commit) {
    throw new Error(`Pages 在等待窗口内未部署目标提交：线上 ${last.commit}，目标 ${expectedCommit}`)
  }
  throw lastError || new Error('Pages 在等待窗口内不可用')
}

async function main() {
  const info = await waitForExpectedDeployment()

  const home = await get('/')
  if (home.status !== 200) throw new Error(`首页返回 ${home.status}`)
  const homeText = await home.text()
  if (!homeText.includes('问题地图')) throw new Error('首页未包含“问题地图”')
  if (!homeText.includes(info.commit)) throw new Error(`首页未包含构建 SHA ${info.commit}`)

  for (const [label, pathname] of checks.slice(1)) {
    const response = await get(pathname)
    if (response.status !== 200) throw new Error(`${label} ${pathname} 返回 ${response.status}`)
    if (pathname === '/practice/') {
      const text = await response.text()
      if (!text.includes('PRACTICE-003') || !text.includes('30天与阶段')) {
        throw new Error('线上实践工作台尚未包含 V2.3 长期复盘入口')
      }
    }
  }

  const host = new URL(baseUrl).hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    console.log('[smoke] 本地预览不解释 Cloudflare _redirects，跳过线上重定向断言。')
  } else {
    const legacy = await get('/library/')
    const legacyLocation = legacy.headers.get('location') || ''
    if (![301, 302, 307, 308].includes(legacy.status) || !legacyLocation.includes('/knowledge/')) {
      throw new Error(`旧资料库路径未正确重定向：${legacy.status} ${legacyLocation}`)
    }

    const htmlPractice = await get('/practice/card/natural-breath.html')
    const practiceLocation = htmlPractice.headers.get('location') || ''
    if (![301, 302, 307, 308].includes(htmlPractice.status) || !practiceLocation.includes('/practice/card/natural-breath')) {
      throw new Error(`实践卡 .html 规范化重定向异常：${htmlPractice.status} ${practiceLocation}`)
    }
  }

  console.log(`[smoke] 通过：${baseUrl} · ${info.commit} · ${info.buildTime}${expectedCommit ? ` · 目标 ${expectedCommit}` : ''}`)
}

main().catch((error) => {
  console.error(`[smoke] 失败：${error.message}`)
  process.exit(1)
})
