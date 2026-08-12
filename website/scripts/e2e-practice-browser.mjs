import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_CDP_PORT || 9222)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const value = execFileSync('which', [command], { encoding: 'utf8' }).trim()
      if (value) return value
    } catch {}
  }
  throw new Error('未找到 Chrome/Chromium。GitHub Actions 应使用包含 Chrome 的 Ubuntu runner。')
}

async function waitHttp(url, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error(`等待站点超时：${url}`)
}

async function waitCdp(timeoutMs = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error('等待 Chromium DevTools 端口超时')
}

async function openTarget(url) {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`无法创建 Chromium 页面：${response.status}`)
  return response.json()
}

function connectCdp(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)))
    else resolve(message.result)
  })

  function call(method, params = {}) {
    const requestId = ++id
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      ws.send(JSON.stringify({ id: requestId, method, params }))
    })
  }

  return { ws, ready, call }
}

async function evaluate(cdp, expression) {
  const result = await cdp.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || '浏览器脚本执行失败')
  }
  return result.result?.value
}

async function waitFor(cdp, expression, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return
    await sleep(120)
  }
  throw new Error(`浏览器条件等待超时：${expression}`)
}

async function setViewport(cdp, width, height) {
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 720
  })
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-e2e-'))
  let preview
  let chrome
  let cdp

  try {
    preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    })
    preview.stdout.on('data', (chunk) => process.stdout.write(`[preview] ${chunk}`))
    preview.stderr.on('data', (chunk) => process.stderr.write(`[preview] ${chunk}`))
    await waitHttp(`${BASE_URL}/practice/`)

    const chromeBin = findChrome()
    console.log(`[e2e] Chromium: ${chromeBin}`)
    chrome = spawn(chromeBin, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    chrome.stderr.on('data', () => {})
    await waitCdp()

    const target = await openTarget(`${BASE_URL}/practice/`)
    cdp = connectCdp(target.webSocketDebuggerUrl)
    await cdp.ready
    await cdp.call('Page.enable')
    await cdp.call('Runtime.enable')
    await setViewport(cdp, 1280, 900)
    await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.practice-journal')`)

    // 清理测试 profile 内的旧数据。
    await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); location.reload(); true`)
    await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)

    const hasTabs = await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).map(b => b.textContent.trim())`)
    for (const label of ['每日记录', '最近7天', '30天与阶段', '数据管理']) {
      if (!hasTabs.includes(label)) throw new Error(`实践工作台缺少标签页：${label}`)
    }

    // 通过真实表单事件保存一条普通记录。
    const normalSaved = await evaluate(cdp, `(async () => {
      const findLabel = (text) => Array.from(document.querySelectorAll('.pj-form label')).find(el => el.querySelector('span')?.textContent.trim() === text)
      const setSelect = (text, value) => {
        const el = findLabel(text)?.querySelector('select'); if (!el) throw new Error('missing select '+text)
        el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const setInput = (text, value) => {
        const el = findLabel(text)?.querySelector('input'); if (!el) throw new Error('missing input '+text)
        el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      setSelect('实践卡', 'practice.basic.posture')
      setInput('实际时长（分钟）', 3)
      setSelect('开始前状态', 'acceptable')
      setSelect('身体姿势', 'comfortable')
      setSelect('呼吸自然度', 'not_observed')
      setSelect('注意返回', 'not_practiced')
      setSelect('情绪状态', 'stable')
      setSelect('练后状态', 'normal')
      document.querySelector('.pj-form').requestSubmit()
      await new Promise(r => setTimeout(r, 120))
      const payload = JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '{}')
      return payload.records?.length === 1 && payload.records[0].practiceId === 'practice.basic.posture' && payload.records[0].durationMinutes === 3
    })()`)
    if (!normalSaved) throw new Error('普通记录未通过真实表单写入 localStorage')

    // 刷新后确认本地记录仍存在，并在数据管理页可见。
    await evaluate(cdp, `location.reload(); true`)
    await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.practice-journal')`)
    const persisted = await evaluate(cdp, `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '{}').records?.length === 1`)
    if (!persisted) throw new Error('页面刷新后 localStorage 记录未保留')
    await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b => b.textContent.includes('数据管理')).click(); true`)
    await waitFor(cdp, `document.querySelector('.pj-data')`)
    const dataText = await evaluate(cdp, `document.querySelector('.pj-data').innerText`)
    if (!/共有\s*1\s*条记录/.test(dataText)) throw new Error('数据管理页未显示刷新后保留的1条记录')

    // 30天页在记录不足时必须明确“先补足记录”，不能自动升级。
    await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b => b.textContent.includes('30天与阶段')).click(); true`)
    await waitFor(cdp, `document.querySelector('.pj-stage')`)
    const stageText = await evaluate(cdp, `document.querySelector('.pj-stage').innerText`)
    if (!stageText.includes('继续当前阶段，先补足记录')) throw new Error('记录不足时阶段页没有阻止自动升级')
    if (!stageText.includes('记录支持状态')) throw new Error('阶段页缺少四类能力记录支持状态')

    // 再用真实表单记录红色事件，阶段页必须切换为安全暂停。
    await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b => b.textContent.includes('每日记录')).click(); true`)
    await waitFor(cdp, `document.querySelector('.pj-form')`)
    const redSaved = await evaluate(cdp, `(async () => {
      const labels = Array.from(document.querySelectorAll('.pj-form label'))
      const find = (text) => labels.find(el => el.querySelector('span')?.textContent.trim() === text)
      const setSelect = (text, value) => { const el=find(text)?.querySelector('select'); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true})) }
      const setInput = (text, value) => { const el=find(text)?.querySelector('input'); el.value=String(value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})) }
      setSelect('实践卡', 'practice.basic.precheck')
      setInput('实际时长（分钟）', 1)
      setSelect('安全分流', 'red')
      setSelect('下次决定', 'pause_all')
      document.querySelector('.pj-form').requestSubmit()
      await new Promise(r => setTimeout(r, 120))
      const payload=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '{}')
      return payload.records?.length===2 && payload.records.some(r=>r.severity==='red')
    })()`)
    if (!redSaved) throw new Error('红色事件未通过真实表单保存')

    await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b => b.textContent.includes('30天与阶段')).click(); true`)
    await waitFor(cdp, `document.querySelector('.pj-stage')`)
    const redStageText = await evaluate(cdp, `document.querySelector('.pj-stage').innerText`)
    if (!redStageText.includes('因安全原因暂停并处理异常')) throw new Error('红色事件后阶段页未优先暂停')
    if (!redStageText.includes('安全边界')) throw new Error('红色事件阶段页未提供安全边界入口')

    // 窄屏 Chromium：组件本身不得超出视口，标签栏允许内部滚动。
    await setViewport(cdp, 390, 844)
    await sleep(150)
    const mobile = await evaluate(cdp, `({
      viewport: window.innerWidth,
      journalWidth: document.querySelector('.practice-journal').getBoundingClientRect().width,
      tabsOverflow: getComputedStyle(document.querySelector('.pj-tabs')).overflowX,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth
    })`)
    if (mobile.journalWidth > mobile.viewport + 1) throw new Error(`窄屏下实践工具超出视口：${JSON.stringify(mobile)}`)
    if (!['auto', 'scroll'].includes(mobile.tabsOverflow)) throw new Error(`窄屏标签栏未启用横向滚动：${JSON.stringify(mobile)}`)
    if (mobile.pageOverflow > 8) throw new Error(`窄屏页面存在明显横向溢出：${JSON.stringify(mobile)}`)

    console.log('[e2e] 通过：真实 Chromium 已验证表单保存、刷新保留、30天阶段阻断、红色安全暂停与390px窄屏。')
  } finally {
    try { cdp?.ws?.close() } catch {}
    if (chrome && !chrome.killed) chrome.kill('SIGTERM')
    if (preview && !preview.killed) preview.kill('SIGTERM')
    await sleep(150)
    rmSync(profileDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
