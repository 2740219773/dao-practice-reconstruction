import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_DAILY_CDP_PORT || 9444)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_DAILY_E2E_TIMEOUT_MS || 55000)
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
  throw new Error('等待今日修持 Chromium DevTools 超时')
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
  throw new Error(`等待今日修持条件超时：${expression}`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-today')`)

  await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-today') && document.querySelector('.pj-form')`)

  const initial = await evaluate(cdp, `({
    title:document.querySelector('.pj-today h3')?.textContent.trim(),
    card:document.querySelector('.pj-today__actions a[href*="/practice/card/"]')?.getAttribute('href'),
    stage:document.querySelector('.pj-today__meta')?.textContent
  })`)
  if (!initial.title?.includes('从准备与安全检查开始')) throw new Error(`首次今日入口异常：${JSON.stringify(initial)}`)
  if (initial.card !== '/practice/card/precheck') throw new Error(`首次实践卡链接异常：${JSON.stringify(initial)}`)
  if (!initial.stage?.includes('阶段方向')) throw new Error('今日入口缺少阶段方向')

  // 初次点击“开始今日记录”应落到安全检查，且不出现不属于本卡的观察字段。
  await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-today__actions button')).find(b=>b.textContent.includes('开始今日记录')).click(); true`)
  await waitFor(cdp, `document.querySelector('.pj-form-head')`)
  const precheck = await evaluate(cdp, `(() => {
    const labels=Array.from(document.querySelectorAll('.pj-form label>span')).map(x=>x.textContent.trim());
    const practice=Array.from(document.querySelectorAll('.pj-form label')).find(x=>x.querySelector('span')?.textContent.trim()==='实践卡')?.querySelector('select')?.value;
    const card=document.querySelector('.pj-form-head a')?.getAttribute('href');
    return {labels,practice,card};
  })()`)
  if (precheck.practice !== 'practice.basic.precheck' || precheck.card !== '/practice/card/precheck') throw new Error(`安全检查入口异常：${JSON.stringify(precheck)}`)
  for (const forbidden of ['身体姿势', '呼吸自然度', '注意返回', '练后状态']) {
    if (precheck.labels.includes(forbidden)) throw new Error(`安全检查不应要求字段：${forbidden}`)
  }

  // 自然察息只显示呼吸与练后；不会要求姿势/注意。
  const natural = await evaluate(cdp, `(() => {
    const labels=Array.from(document.querySelectorAll('.pj-form label'));
    const practice=labels.find(x=>x.querySelector('span')?.textContent.trim()==='实践卡')?.querySelector('select');
    practice.value='practice.basic.natural_breath'; practice.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`)
  if (!natural) throw new Error('切换自然察息失败')
  await sleep(80)
  const naturalFields = await evaluate(cdp, `({
    labels:Array.from(document.querySelectorAll('.pj-form label>span')).map(x=>x.textContent.trim()),
    card:document.querySelector('.pj-form-head a')?.getAttribute('href')
  })`)
  if (!naturalFields.labels.includes('呼吸自然度') || !naturalFields.labels.includes('练后状态')) throw new Error(`自然察息缺少必要字段：${JSON.stringify(naturalFields)}`)
  if (naturalFields.labels.includes('身体姿势') || naturalFields.labels.includes('注意返回')) throw new Error(`自然察息仍显示无关字段：${JSON.stringify(naturalFields)}`)
  if (naturalFields.card !== '/practice/card/natural-breath') throw new Error('自然察息快捷链接错误')

  // 短时安坐应显示四类观察。
  await evaluate(cdp, `(() => {
    const labels=Array.from(document.querySelectorAll('.pj-form label'));
    const practice=labels.find(x=>x.querySelector('span')?.textContent.trim()==='实践卡')?.querySelector('select');
    practice.value='practice.basic.short_sitting'; practice.dispatchEvent(new Event('change',{bubbles:true})); return true;
  })()`)
  await sleep(80)
  const sittingLabels = await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-form label>span')).map(x=>x.textContent.trim())`)
  for (const required of ['身体姿势', '呼吸自然度', '注意返回', '练后状态']) {
    if (!sittingLabels.includes(required)) throw new Error(`短时安坐缺少字段：${required}`)
  }

  // 实际保存一次调身，今日入口应只提供“继续上次”，而不是自动前进到下一卡。
  const saved = await evaluate(cdp, `(async () => {
    const labels=Array.from(document.querySelectorAll('.pj-form label'));
    const find=(text)=>labels.find(x=>x.querySelector('span')?.textContent.trim()===text);
    const practice=find('实践卡').querySelector('select'); practice.value='practice.basic.posture'; practice.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,30));
    const duration=find('实际时长（分钟）').querySelector('input'); duration.value='3'; duration.dispatchEvent(new Event('input',{bubbles:true})); duration.dispatchEvent(new Event('change',{bubbles:true}));
    const posture=Array.from(document.querySelectorAll('.pj-form label')).find(x=>x.querySelector('span')?.textContent.trim()==='身体姿势')?.querySelector('select'); posture.value='comfortable'; posture.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('.pj-form').requestSubmit(); await new Promise(r=>setTimeout(r,180));
    return JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}').records?.[0];
  })()`)
  if (saved?.practiceId !== 'practice.basic.posture') throw new Error(`调身记录保存失败：${JSON.stringify(saved)}`)
  const continued = await evaluate(cdp, `({title:document.querySelector('.pj-today h3')?.textContent.trim(),card:document.querySelector('.pj-today__actions a[href*="/practice/card/"]')?.getAttribute('href'),button:Array.from(document.querySelectorAll('.pj-today__actions button')).find(b=>b.textContent.includes('继续上次'))?.textContent.trim()})`)
  if (!continued.title?.includes('继续上次：调身与舒适姿势') || continued.card !== '/practice/card/posture' || !continued.button) {
    throw new Error(`继续上次入口异常：${JSON.stringify(continued)}`)
  }

  // “今天不练”应生成最简表单，不保留练习观察项。
  await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-today__actions button')).find(b=>b.textContent.includes('今天决定不练')).click(); true`)
  await waitFor(cdp, `document.querySelector('.pj-skip-note')`)
  const skip = await evaluate(cdp, `({
    text:document.querySelector('.pj-skip-note')?.textContent,
    labels:Array.from(document.querySelectorAll('.pj-form label>span')).map(x=>x.textContent.trim()),
    start:Array.from(document.querySelectorAll('.pj-form label')).find(x=>x.querySelector('span')?.textContent.trim()==='开始前状态')?.querySelector('select')?.value
  })`)
  if (skip.start !== 'skipped' || !skip.text?.includes('不练也是有效记录')) throw new Error(`不练入口异常：${JSON.stringify(skip)}`)
  for (const forbidden of ['实际时长（分钟）', '身体姿势', '呼吸自然度', '注意返回', '练后状态']) {
    if (skip.labels.includes(forbidden)) throw new Error(`不练记录仍显示无关字段：${forbidden}`)
  }

  // 实践卡 -> 工作台：真实进入自然察息卡，点击“记录本次实践”，必须只预选且不新增记录。
  const beforeReverseCount = await evaluate(cdp, `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}').records?.length || 0`)
  await evaluate(cdp, `location.href=${JSON.stringify(`${BASE_URL}/practice/card/natural-breath`)}; true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('a[href*="practice=natural-breath"]')`)
  const reverseLink = await evaluate(cdp, `Array.from(document.querySelectorAll('a')).find(a=>a.textContent.includes('记录本次实践'))?.getAttribute('href')`)
  if (!reverseLink?.includes('/practice/?practice=natural-breath') || !reverseLink.includes('#practice-journal')) {
    throw new Error(`实践卡反向记录链接异常：${reverseLink}`)
  }
  await evaluate(cdp, `Array.from(document.querySelectorAll('a')).find(a=>a.textContent.includes('记录本次实践')).click(); true`)
  await waitFor(cdp, `location.pathname === '/practice/' && new URLSearchParams(location.search).get('practice') === 'natural-breath' && document.querySelector('#practice-journal .pj-form')`)
  const reversed = await evaluate(cdp, `({
    practice:Array.from(document.querySelectorAll('.pj-form label')).find(x=>x.querySelector('span')?.textContent.trim()==='实践卡')?.querySelector('select')?.value,
    notice:document.querySelector('.pj-notice')?.textContent || '',
    count:JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}').records?.length || 0,
    labels:Array.from(document.querySelectorAll('.pj-form label>span')).map(x=>x.textContent.trim())
  })`)
  if (reversed.practice !== 'practice.basic.natural_breath' || reversed.count !== beforeReverseCount || !reversed.notice.includes('不会自动开始、自动保存或改变阶段')) {
    throw new Error(`实践卡反向预选异常：${JSON.stringify(reversed)}`)
  }
  if (!reversed.labels.includes('呼吸自然度') || reversed.labels.includes('身体姿势') || reversed.labels.includes('注意返回')) {
    throw new Error(`反向预选后最小字段异常：${JSON.stringify(reversed.labels)}`)
  }

  // URL 参数不能绕过红色安全状态：使用工作台同源的本地 YYYY-MM-DD 日期注入红色记录，应强制回到安全检查。
  await evaluate(cdp, `(() => {
    const data=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}');
    const base=data.records?.[0] || {};
    const today=document.querySelector('.pj-form input[type="date"]')?.value;
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(today || '')) throw new Error('无法读取工作台本地日期');
    const red={...base,id:'daily-e2e-red',createdAt:new Date().toISOString(),date:today,practiceId:'practice.basic.precheck',durationMinutes:1,startState:'acceptable',severity:'red',issues:['function_impact'],afterState:'affected'};
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)},JSON.stringify({schemaVersion:1,records:[red]}));
    location.href=${JSON.stringify(`${BASE_URL}/practice/?practice=natural-breath#practice-journal`)};
    return true;
  })()`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('#practice-journal .pj-form') && document.querySelector('.pj-notice')`)
  const safetyOverride = await evaluate(cdp, `({
    practice:Array.from(document.querySelectorAll('.pj-form label')).find(x=>x.querySelector('span')?.textContent.trim()==='实践卡')?.querySelector('select')?.value,
    notice:document.querySelector('.pj-notice')?.textContent || '',
    count:JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}').records?.length || 0
  })`)
  if (safetyOverride.practice !== 'practice.basic.precheck' || safetyOverride.count !== 1 || !safetyOverride.notice.includes('实践卡链接不能绕过安全状态')) {
    throw new Error(`红色安全状态未覆盖实践卡参数：${JSON.stringify(safetyOverride)}`)
  }

  console.log('[daily-e2e] 通过：今日入口、继续上次、不练、双向实践卡导航、反向预选不自动保存、安全状态覆盖参数和按卡最小字段正常。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-daily-e2e-'))
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
  console.error(`[daily-e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => {
  clearTimeout(watchdog)
  process.exit(0)
}).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[daily-e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
