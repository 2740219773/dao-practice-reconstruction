import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_CDP_PORT || 9222)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_E2E_TIMEOUT_MS || 75000)

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

async function waitCdp(timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return
    } catch {}
    await sleep(150)
  }
  throw new Error('等待 Chromium DevTools 超时')
}

async function pageTarget(timeoutMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
    const targets = await response.json()
    const target = targets.find((item) => item.type === 'page' && String(item.url).includes('/practice/'))
    if (target?.webSocketDebuggerUrl) return target
    await sleep(100)
  }
  throw new Error('未找到实践工作台 Chromium 页面')
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
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return
    await sleep(100)
  }
  throw new Error(`等待浏览器条件超时：${expression}`)
}

async function setViewport(cdp, width, height) {
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 720
  })
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await setViewport(cdp, 1280, 900)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.practice-journal')`)

  await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)

  const tabs = await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).map(b => b.textContent.trim())`)
  for (const label of ['每日记录', '最近7天', '30天与阶段', '数据管理']) {
    if (!tabs.includes(label)) throw new Error(`缺少标签页：${label}`)
  }

  const normalSaved = await evaluate(cdp, `(async () => {
    const labels = Array.from(document.querySelectorAll('.pj-form label'))
    const find = (text) => labels.find(el => el.querySelector('span')?.textContent.trim() === text)
    const select = (text, value) => { const el=find(text)?.querySelector('select'); if(!el) throw new Error(text); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true})) }
    const input = (text, value) => { const el=find(text)?.querySelector('input'); if(!el) throw new Error(text); el.value=String(value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})) }
    select('实践卡','practice.basic.posture'); input('实际时长（分钟）',3); select('开始前状态','acceptable'); select('身体姿势','comfortable'); select('呼吸自然度','not_observed'); select('注意返回','not_practiced'); select('情绪状态','stable'); select('练后状态','normal');
    document.querySelector('.pj-form').requestSubmit(); await new Promise(r=>setTimeout(r,150));
    const data=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}');
    return data.records?.length===1 && data.records[0].practiceId==='practice.basic.posture' && data.records[0].durationMinutes===3;
  })()`)
  if (!normalSaved) throw new Error('普通记录未写入 localStorage')

  await evaluate(cdp, `location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.practice-journal')`)
  if (!await evaluate(cdp, `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}').records?.length===1`)) {
    throw new Error('刷新后本地记录未保留')
  }

  await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b=>b.textContent.includes('数据管理')).click(); true`)
  await waitFor(cdp, `document.querySelector('.pj-data')`)
  const dataText = await evaluate(cdp, `document.querySelector('.pj-data').innerText`)
  if (!/共有\s*1\s*条记录/.test(dataText)) throw new Error('数据管理页未显示1条记录')

  await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b=>b.textContent.includes('30天与阶段')).click(); true`)
  await waitFor(cdp, `document.querySelector('.pj-stage')`)
  const stageText = await evaluate(cdp, `document.querySelector('.pj-stage').innerText`)
  if (!stageText.includes('继续当前阶段，先补足记录')) throw new Error('记录不足时未阻止自动升级')
  if (!stageText.includes('记录支持状态')) throw new Error('阶段页缺少记录支持状态')

  await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b=>b.textContent.includes('每日记录')).click(); true`)
  await waitFor(cdp, `document.querySelector('.pj-form')`)
  const redSaved = await evaluate(cdp, `(async () => {
    const labels=Array.from(document.querySelectorAll('.pj-form label')); const find=(text)=>labels.find(el=>el.querySelector('span')?.textContent.trim()===text);
    const select=(text,value)=>{const el=find(text)?.querySelector('select'); if(!el) throw new Error(text); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true}))};
    const input=(text,value)=>{const el=find(text)?.querySelector('input'); if(!el) throw new Error(text); el.value=String(value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}))};
    select('实践卡','practice.basic.precheck'); input('实际时长（分钟）',1); select('安全分流','red'); select('下次决定','pause_all');
    document.querySelector('.pj-form').requestSubmit(); await new Promise(r=>setTimeout(r,150));
    const data=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}'); return data.records?.length===2 && data.records.some(r=>r.severity==='red');
  })()`)
  if (!redSaved) throw new Error('红色事件未保存')

  await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b=>b.textContent.includes('30天与阶段')).click(); true`)
  await waitFor(cdp, `document.querySelector('.pj-stage')`)
  const redText = await evaluate(cdp, `document.querySelector('.pj-stage').innerText`)
  if (!redText.includes('因安全原因暂停并处理异常')) throw new Error('红色事件后未暂停阶段推进')
  if (!redText.includes('安全边界')) throw new Error('红色事件后缺少安全边界入口')

  await setViewport(cdp, 390, 844)
  await sleep(180)
  const mobile = await evaluate(cdp, `({viewport:window.innerWidth,journalWidth:document.querySelector('.practice-journal').getBoundingClientRect().width,tabsOverflow:getComputedStyle(document.querySelector('.pj-tabs')).overflowX,pageOverflow:document.documentElement.scrollWidth-window.innerWidth})`)
  if (mobile.journalWidth > mobile.viewport + 1) throw new Error(`窄屏组件超出视口：${JSON.stringify(mobile)}`)
  if (!['auto','scroll'].includes(mobile.tabsOverflow)) throw new Error(`窄屏标签栏未横向滚动：${JSON.stringify(mobile)}`)
  if (mobile.pageOverflow > 8) throw new Error(`窄屏存在明显横向溢出：${JSON.stringify(mobile)}`)

  console.log('[e2e] 通过：Chromium 已验证保存、刷新保留、30天阶段阻断、红色安全暂停和390px窄屏。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-e2e-'))
  let preview
  let chrome
  let cdp

  try {
    preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    preview.stdout.on('data', (chunk) => process.stdout.write(`[preview] ${chunk}`))
    preview.stderr.on('data', (chunk) => process.stderr.write(`[preview] ${chunk}`))
    await waitHttp(`${BASE_URL}/practice/`)

    const chromeBin = findChrome()
    console.log(`[e2e] Chromium: ${chromeBin}`)
    chrome = spawn(chromeBin, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-allow-origins=*',
      `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`, `${BASE_URL}/practice/`
    ], { stdio: 'ignore' })
    await waitCdp()

    const target = await pageTarget()
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
  console.error(`[e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => {
  clearTimeout(watchdog)
  process.exit(0)
}).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
