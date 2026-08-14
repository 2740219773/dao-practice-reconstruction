import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_A11Y_CDP_PORT || 9588)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_A11Y_E2E_TIMEOUT_MS || 50000)
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

async function waitCdp(timeoutMs = 20000) {
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
  throw new Error('等待可访问性 Chromium DevTools 超时')
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
  throw new Error(`等待可访问性条件超时：${expression}`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.practice-journal')`)

  await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); history.replaceState(null,'','/practice/'); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form') && document.documentElement.dataset.practiceAccessibility === '1'`)

  const tabState = await evaluate(cdp, `(() => {
    const tabs = Array.from(document.querySelectorAll('.pj-tabs [role="tab"]'));
    return tabs.map((tab) => {
      const panel = document.getElementById(tab.getAttribute('aria-controls') || '');
      return {
        text: tab.textContent?.trim() || '', id: tab.id, controls: tab.getAttribute('aria-controls'),
        selected: tab.getAttribute('aria-selected'), panelRole: panel?.getAttribute('role') || '',
        labelledby: panel?.getAttribute('aria-labelledby') || ''
      };
    });
  })()`)
  if (tabState.length !== 4 || tabState.some((item) => !item.id || !item.controls)) throw new Error(`标签页缺少 id/aria-controls：${JSON.stringify(tabState)}`)
  const selected = tabState.find((item) => item.selected === 'true')
  if (!selected || selected.panelRole !== 'tabpanel' || selected.labelledby !== selected.id) throw new Error(`标签页与面板关系不完整：${JSON.stringify(tabState)}`)

  const unlabeled = await evaluate(cdp, `(() => Array.from(document.querySelectorAll('.pj-form input:not([type="hidden"]),.pj-form select,.pj-form textarea'))
    .filter((el) => el.offsetParent !== null)
    .filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length)))
    .map((el) => el.outerHTML.slice(0,120)))()`)
  if (unlabeled.length) throw new Error(`存在无可访问名称的可见表单控件：${JSON.stringify(unlabeled)}`)

  const focusMoved = await evaluate(cdp, `(async()=>{
    const button = Array.from(document.querySelectorAll('.pj-today__actions button')).find((b)=>b.textContent?.includes('开始今日记录'));
    if (!button) return false;
    button.focus(); button.click();
    await new Promise((r)=>setTimeout(r,180));
    return document.activeElement?.matches('.pj-form input[type="date"]') || false;
  })()`)
  if (!focusMoved) throw new Error('从今日入口进入记录后，键盘焦点没有进入日期字段')

  await evaluate(cdp, `(() => {
    const d = new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0');
    const record={id:'a11y-red',schemaVersion:1,createdAt:new Date().toISOString(),date:y+'-'+m+'-'+day,practiceId:'practice.basic.precheck',durationMinutes:1,startState:'acceptable',postureState:'not_observed',breathState:'not_observed',attentionState:'not_practiced',emotionState:'not_observed',afterState:'normal',issues:[],severity:'red',adjustment:'',note:'',nextStep:'not_decided'};
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, JSON.stringify({schemaVersion:1,records:[record]}));
    location.href='/practice/?practice=natural-breath'; return true;
  })()`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-notice')?.textContent.includes('红色')`)
  const alertState = await evaluate(cdp, `(() => { const el=document.querySelector('.pj-notice'); return {role:el?.getAttribute('role'),live:el?.getAttribute('aria-live'),text:el?.textContent||''}; })()`)
  if (alertState.role !== 'alert' || alertState.live !== 'assertive') throw new Error(`红色安全阻断未使用紧急播报语义：${JSON.stringify(alertState)}`)

  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await sleep(180)
  const touchState = await evaluate(cdp, `(() => {
    const coarse=matchMedia('(pointer: coarse)').matches;
    const tabs=Array.from(document.querySelectorAll('.pj-tabs button')).map((el)=>el.getBoundingClientRect().height);
    const actions=Array.from(document.querySelectorAll('.pj-today__actions button,.pj-today__actions a')).filter((el)=>el.offsetParent!==null).map((el)=>el.getBoundingClientRect().height);
    return {coarse,tabs,actions};
  })()`)
  if (!touchState.coarse) throw new Error(`触控仿真未进入 coarse pointer：${JSON.stringify(touchState)}`)
  if ([...touchState.tabs, ...touchState.actions].some((height) => height < 43.5)) throw new Error(`触控目标小于44px：${JSON.stringify(touchState)}`)

  console.log('[a11y-e2e] 通过：标签页关系、表单名称、动作焦点、红色紧急播报和390px触控目标均有效。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-a11y-e2e-'))
  let preview
  let chrome
  let cdp
  try {
    preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], { cwd: process.cwd(), stdio: 'ignore' })
    await waitHttp(`${BASE_URL}/practice/`)
    chrome = spawn(findChrome(), ['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',`--remote-debugging-port=${CDP_PORT}`,`--user-data-dir=${profileDir}`,`${BASE_URL}/practice/`], { stdio: 'ignore' })
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
  console.error(`[a11y-e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => { clearTimeout(watchdog); process.exit(0) }).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[a11y-e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
