import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_THEME_CDP_PORT || 9333)
const THEME_KEY = 'wendaozhi.reading.theme'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_THEME_E2E_TIMEOUT_MS || 45000)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const found = execFileSync('which', [name], { encoding: 'utf8' }).trim()
      if (found) return found
    } catch {}
  }
  throw new Error('未找到 Chrome/Chromium')
}

async function waitHttp(url, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error(`等待本地预览超时：${url}`)
}

async function waitCdp(timeoutMs = 12000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find((item) => item.type === 'page' && String(item.url).includes('/practice/'))
        if (target?.webSocketDebuggerUrl) return target
      }
    } catch {}
    await sleep(150)
  }
  throw new Error('等待主题测试 Chromium DevTools 超时')
}

function connectCdp(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  let nextId = 0
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(message.error.message || 'CDP 调用失败'))
    else waiter.resolve(message.result)
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { ws, ready, call }
}

async function evaluate(cdp, expression) {
  const result = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || '浏览器脚本执行失败')
  return result.result?.value
}

async function waitFor(cdp, expression, timeoutMs = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return
    await sleep(100)
  }
  throw new Error(`等待主题条件超时：${expression}`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.wdz-nav__theme-btn')`)

  // 固定从日读开始，避免 runner 的系统深色偏好影响断言。
  await evaluate(cdp, `localStorage.setItem(${JSON.stringify(THEME_KEY)},'light'); location.reload(); true`)
  await waitFor(cdp, `document.documentElement.dataset.wdzTheme === 'light' && document.querySelector('.wdz-nav__theme-btn')`)

  const light = await evaluate(cdp, `({
    theme:document.documentElement.dataset.wdzTheme,
    stored:localStorage.getItem(${JSON.stringify(THEME_KEY)}),
    pressed:document.querySelector('.wdz-nav__theme-btn').getAttribute('aria-pressed'),
    label:document.querySelector('.wdz-nav__theme-btn').getAttribute('aria-label'),
    bg:getComputedStyle(document.documentElement).backgroundColor,
    ink:getComputedStyle(document.querySelector('.wdz-nav__brand')).color
  })`)
  if (light.theme !== 'light' || light.stored !== 'light' || light.pressed !== 'false' || !light.label.includes('夜读')) {
    throw new Error(`日读初始状态异常：${JSON.stringify(light)}`)
  }

  await evaluate(cdp, `document.querySelector('.wdz-nav__theme-btn').click(); true`)
  await waitFor(cdp, `document.documentElement.dataset.wdzTheme === 'dark'`)
  const dark = await evaluate(cdp, `({
    theme:document.documentElement.dataset.wdzTheme,
    stored:localStorage.getItem(${JSON.stringify(THEME_KEY)}),
    pressed:document.querySelector('.wdz-nav__theme-btn').getAttribute('aria-pressed'),
    label:document.querySelector('.wdz-nav__theme-btn').getAttribute('aria-label'),
    bg:getComputedStyle(document.documentElement).backgroundColor,
    ink:getComputedStyle(document.querySelector('.wdz-nav__brand')).color
  })`)
  if (dark.theme !== 'dark' || dark.stored !== 'dark' || dark.pressed !== 'true' || !dark.label.includes('日读')) {
    throw new Error(`夜读切换状态异常：${JSON.stringify(dark)}`)
  }
  if (dark.bg === light.bg || dark.ink === light.ink) throw new Error('夜读切换后主要纸色/墨色没有实际变化')

  // 刷新必须恢复用户选择。
  await evaluate(cdp, `location.reload(); true`)
  await waitFor(cdp, `document.documentElement.dataset.wdzTheme === 'dark' && document.querySelector('.wdz-nav__theme-btn')`)
  if (await evaluate(cdp, `localStorage.getItem(${JSON.stringify(THEME_KEY)})`) !== 'dark') throw new Error('夜读刷新后没有持久化')

  // 390px 仍需保留主题按钮，避免移动端只能改系统设置。
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(120)
  const mobile = await evaluate(cdp, `({visible:getComputedStyle(document.querySelector('.wdz-nav__theme-btn')).display!=='none',width:document.querySelector('.wdz-nav__theme-btn').getBoundingClientRect().width,pageOverflow:document.documentElement.scrollWidth-window.innerWidth})`)
  if (!mobile.visible || mobile.width < 32 || mobile.pageOverflow > 8) throw new Error(`移动端主题按钮异常：${JSON.stringify(mobile)}`)

  // 切回日读，验证双向操作。
  await evaluate(cdp, `document.querySelector('.wdz-nav__theme-btn').click(); true`)
  await waitFor(cdp, `document.documentElement.dataset.wdzTheme === 'light'`)
  if (await evaluate(cdp, `localStorage.getItem(${JSON.stringify(THEME_KEY)})`) !== 'light') throw new Error('切回日读后未保存')

  console.log('[theme-e2e] 通过：日读/夜读切换、纸墨色变化、刷新持久化、ARIA状态与390px移动端入口正常。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-theme-e2e-'))
  let preview
  let chrome
  let cdp
  try {
    preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], { cwd: process.cwd(), stdio: 'ignore' })
    await waitHttp(`${BASE_URL}/practice/`)
    chrome = spawn(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-allow-origins=*',
      `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`, `${BASE_URL}/practice/`
    ], { stdio: 'ignore' })
    const target = await waitCdp()
    cdp = connectCdp(target.webSocketDebuggerUrl)
    await cdp.ready
    await runScenario(cdp)
  } finally {
    try { cdp?.ws?.close() } catch {}
    try { chrome?.kill('SIGKILL') } catch {}
    try { preview?.kill('SIGKILL') } catch {}
    rmSync(profileDir, { recursive: true, force: true })
  }
}

const watchdog = setTimeout(() => {
  console.error(`[theme-e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => {
  clearTimeout(watchdog)
  process.exit(0)
}).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[theme-e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
