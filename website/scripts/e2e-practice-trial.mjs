import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_TRIAL_CDP_PORT || 9555)
const PRACTICE_KEY = 'wendaozhi.practice.records.v1'
const TRIAL_KEY = 'wendaozhi.practice.trial.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_TRIAL_E2E_TIMEOUT_MS || 45000)
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

async function waitCdp(timeoutMs = 16000) {
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
  throw new Error('等待7天试运行 Chromium DevTools超时')
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
  throw new Error(`等待7天试运行条件超时：${expression}`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pt__details')`)

  const sentinel = JSON.stringify({ schemaVersion: 1, records: [] })
  await evaluate(cdp, `localStorage.setItem(${JSON.stringify(PRACTICE_KEY)}, ${JSON.stringify(sentinel)}); localStorage.removeItem(${JSON.stringify(TRIAL_KEY)}); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pt__details')`)

  const initial = await evaluate(cdp, `({open:document.querySelector('.pt__details')?.open, text:document.querySelector('.pt__details summary')?.textContent||''})`)
  if (initial.open !== false || !initial.text.includes('可选') || !initial.text.includes('约20秒')) throw new Error(`产品观察应默认折叠且标明轻量可选：${JSON.stringify(initial)}`)

  await evaluate(cdp, `document.querySelector('.pt__details summary').click(); true`)
  await waitFor(cdp, `document.querySelector('.pt__details')?.open === true`)

  const reduced = await evaluate(cdp, `(async () => {
    const form=document.querySelector('.pt__form');
    const labels=Array.from(form.querySelectorAll('label'));
    const used=labels.find(x=>x.querySelector('span')?.textContent.trim()==='今天是否使用实践工作台')?.querySelector('select');
    used.value='false'; used.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,60));
    return Array.from(form.querySelectorAll('label>span')).map(x=>x.textContent.trim());
  })()`)
  for (const hidden of ['总体操作耗时', '主要入口', '有字段不知道怎么选', '有字段感觉没有信息价值']) {
    if (reduced.includes(hidden)) throw new Error(`未使用工作台时不应继续要求：${hidden}`)
  }
  if (!reduced.includes('一句话产品备注') || !reduced.includes('有“系统在催我升级或打卡”的感觉')) {
    throw new Error(`未使用工作台时应保留备注和压力反馈：${JSON.stringify(reduced)}`)
  }

  await evaluate(cdp, `(() => { const form=document.querySelector('.pt__form'); const labels=Array.from(form.querySelectorAll('label')); const used=labels.find(x=>x.querySelector('span')?.textContent.trim()==='今天是否使用实践工作台')?.querySelector('select'); used.value='true'; used.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`)
  await waitFor(cdp, `Array.from(document.querySelectorAll('.pt__form label>span')).some(x=>x.textContent.trim()==='总体操作耗时')`)

  const saved = await evaluate(cdp, `(async () => {
    const form=document.querySelector('.pt__form');
    const labels=Array.from(form.querySelectorAll('label'));
    const field=(name)=>labels.find(x=>x.querySelector('span')?.textContent.trim()===name);
    const duration=field('总体操作耗时').querySelector('select'); duration.value='1_to_2m'; duration.dispatchEvent(new Event('change',{bubbles:true}));
    const entry=field('主要入口').querySelector('select'); entry.value='card'; entry.dispatchEvent(new Event('change',{bubbles:true}));
    const checks=Array.from(form.querySelectorAll('.pt__check'));
    for (const label of checks) { const input=label.querySelector('input'); input.click(); }
    await new Promise(r=>setTimeout(r,30));
    const newLabels=Array.from(form.querySelectorAll('label'));
    const unclear=newLabels.find(x=>x.querySelector('span')?.textContent.trim()==='哪个字段')?.querySelector('input');
    if (unclear) { unclear.value='开始前状态'; unclear.dispatchEvent(new Event('input',{bubbles:true})); }
    const textInputs=newLabels.filter(x=>x.querySelector('span')?.textContent.trim()==='哪个字段').map(x=>x.querySelector('input'));
    if (textInputs[1]) { textInputs[1].value='补充记录'; textInputs[1].dispatchEvent(new Event('input',{bubbles:true})); }
    const note=field('一句话产品备注')?.querySelector('textarea') || form.querySelector('textarea'); note.value='跳转清楚，但字段略多'; note.dispatchEvent(new Event('input',{bubbles:true}));
    form.requestSubmit();
    await new Promise(r=>setTimeout(r,120));
    return {
      trial: JSON.parse(localStorage.getItem(${JSON.stringify(TRIAL_KEY)}) || '{}'),
      practice: localStorage.getItem(${JSON.stringify(PRACTICE_KEY)}),
      notice: document.querySelector('.pt__notice')?.textContent || '',
      summary: document.querySelector('.pt__summary')?.textContent || ''
    };
  })()`)

  if (saved.trial?.schemaVersion !== 1 || saved.trial?.entries?.length !== 1) throw new Error(`产品观察未正确保存：${JSON.stringify(saved)}`)
  if (saved.practice !== sentinel) throw new Error('保存产品观察不应修改修持记录')
  if (!saved.notice.includes('不进入修持记录') || !saved.summary.includes('1 条观察')) throw new Error(`产品观察提示或摘要异常：${JSON.stringify(saved)}`)

  await evaluate(cdp, `location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pt__details')`)
  const persisted = await evaluate(cdp, `({trial:JSON.parse(localStorage.getItem(${JSON.stringify(TRIAL_KEY)})||'{}'),practice:localStorage.getItem(${JSON.stringify(PRACTICE_KEY)}),open:document.querySelector('.pt__details')?.open})`)
  if (persisted.trial?.entries?.length !== 1 || persisted.practice !== sentinel || persisted.open !== false) throw new Error(`刷新后产品观察或折叠状态异常：${JSON.stringify(persisted)}`)

  await evaluate(cdp, `document.querySelector('.pt__details summary').click(); true`)
  await waitFor(cdp, `document.querySelector('.pt__details')?.open === true && document.querySelector('.pt__summary')?.textContent.includes('1 条观察')`)
  const reloaded = await evaluate(cdp, `({ trial:JSON.parse(localStorage.getItem(${JSON.stringify(TRIAL_KEY)})||'{}'), practice:localStorage.getItem(${JSON.stringify(PRACTICE_KEY)}), summary:document.querySelector('.pt__summary')?.textContent||'' })`)
  if (reloaded.trial?.entries?.length !== 1 || reloaded.practice !== sentinel || !reloaded.summary.includes('被催促感')) throw new Error(`刷新后产品观察异常：${JSON.stringify(reloaded)}`)

  const cancelled = await evaluate(cdp, `(() => { window.confirm=()=>false; Array.from(document.querySelectorAll('.pt__actions button')).find(b=>b.textContent.includes('清空产品观察')).click(); return {trial:JSON.parse(localStorage.getItem(${JSON.stringify(TRIAL_KEY)})||'{}').entries?.length||0,practice:localStorage.getItem(${JSON.stringify(PRACTICE_KEY)})}; })()`)
  if (cancelled.trial !== 1 || cancelled.practice !== sentinel) throw new Error('取消清空不应删除任何记录')

  await evaluate(cdp, `(() => { window.confirm=()=>true; Array.from(document.querySelectorAll('.pt__actions button')).find(b=>b.textContent.includes('清空产品观察')).click(); return true; })()`)
  await waitFor(cdp, `localStorage.getItem(${JSON.stringify(TRIAL_KEY)}) === null && document.querySelector('.pt__notice')?.textContent.includes('修持记录未受影响')`)
  const cleared = await evaluate(cdp, `({trial:localStorage.getItem(${JSON.stringify(TRIAL_KEY)}),practice:localStorage.getItem(${JSON.stringify(PRACTICE_KEY)}),notice:document.querySelector('.pt__notice')?.textContent||''})`)
  if (cleared.trial !== null || cleared.practice !== sentinel || !cleared.notice.includes('修持记录未受影响')) throw new Error(`清空产品观察边界异常：${JSON.stringify(cleared)}`)

  console.log('[trial-e2e] 通过：产品观察默认折叠、未使用时减负、独立保存、刷新保留、清空确认与修持记录隔离正常。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-trial-e2e-'))
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
  console.error(`[trial-e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => {
  clearTimeout(watchdog)
  process.exit(0)
}).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[trial-e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
