import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_REDUCTION_CDP_PORT || 9566)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_REDUCTION_E2E_TIMEOUT_MS || 45000)
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
    await sleep(180)
  }
  throw new Error(`等待本地预览超时：${url}`)
}

async function waitCdp(timeoutMs = 18000) {
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
    await sleep(180)
  }
  throw new Error('等待首屏减法 Chromium DevTools 超时')
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
  throw new Error(`等待首屏减法条件超时：${expression}`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-today') && document.querySelector('.pj-form')`)

  await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-today') && document.querySelector('.pj-form')`)

  const reduced = await evaluate(cdp, `(() => {
    const todayMeta = document.querySelector('.pj-today__meta')
    const stage = todayMeta?.querySelector('span:first-child')
    const labels = Array.from(document.querySelectorAll('.pj-form label'))
    const find = (name) => labels.find((label) => label.querySelector('span')?.textContent.trim() === name)
    const emotion = find('情绪状态')
    const next = find('下次决定')
    return {
      stageText: stage?.textContent || '',
      stageDisplay: stage ? getComputedStyle(stage).display : 'missing',
      todayText: todayMeta?.innerText || '',
      emotionDisplay: emotion ? getComputedStyle(emotion).display : 'missing',
      nextDisplay: next ? getComputedStyle(next).display : 'missing'
    }
  })()`)

  if (!reduced.stageText.includes('阶段方向') || reduced.stageDisplay !== 'none' || reduced.todayText.includes('阶段方向')) {
    throw new Error(`今日卡仍暴露阶段方向：${JSON.stringify(reduced)}`)
  }
  if (reduced.emotionDisplay !== 'none' || reduced.nextDisplay !== 'none') {
    throw new Error(`低价值默认字段仍占据日常表单：${JSON.stringify(reduced)}`)
  }

  const saved = await evaluate(cdp, `(async () => {
    document.querySelector('.pj-form').requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 140));
    const payload = JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '{}')
    const record = payload.records?.[0] || null
    return { record, notice: document.querySelector('.pj-notice')?.textContent || '' }
  })()`)

  if (!saved.record) throw new Error(`首屏减法场景未保存记录：${JSON.stringify(saved)}`)
  if (saved.record.emotionState !== 'not_observed' || saved.record.nextStep !== 'not_decided') {
    throw new Error(`隐藏字段仍写入推断值：${JSON.stringify(saved.record)}`)
  }
  if (!saved.notice.includes('不会自动上传')) throw new Error(`保存提示异常：${JSON.stringify(saved)}`)

  console.log('[reduction-e2e] 通过：阶段方向退出今日卡，情绪/下次决定退出日常表单，保存不再虚构默认结论。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-reduction-e2e-'))
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
  console.error(`[reduction-e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => {
  clearTimeout(watchdog)
  process.exit(0)
}).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[reduction-e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
