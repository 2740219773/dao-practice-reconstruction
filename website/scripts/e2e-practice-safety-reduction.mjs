import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_SAFETY_REDUCTION_CDP_PORT || 9577)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_SAFETY_REDUCTION_E2E_TIMEOUT_MS || 45000)
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
  throw new Error('等待异常安全减负 Chromium DevTools 超时')
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
  throw new Error(`等待异常安全减负条件超时：${expression}`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form') && document.querySelector('.pj-safety-toggle')`)

  await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form') && document.querySelector('.pj-safety-toggle')`)

  const initial = await evaluate(cdp, `(() => {
    const form=document.querySelector('.pj-form');
    const toggle=document.querySelector('.pj-safety-toggle');
    const issues=document.querySelector('.pj-issues');
    const safetyGrid=document.querySelector('.pj-grid--small');
    return {text:toggle?.textContent||'',expanded:toggle?.getAttribute('aria-expanded'),issues:getComputedStyle(issues).display,safety:getComputedStyle(safetyGrid).display,formClass:form.className};
  })()`)
  if (!initial.text.includes('没有则跳过') || initial.expanded !== 'false' || initial.issues !== 'none' || initial.safety !== 'none') {
    throw new Error(`正常记录未保持极简安全入口：${JSON.stringify(initial)}`)
  }

  await evaluate(cdp, `document.querySelector('.pj-safety-toggle').click(); true`)
  await waitFor(cdp, `document.querySelector('.pj-form')?.classList.contains('pj-safety-expanded')`)
  const opened = await evaluate(cdp, `({issues:getComputedStyle(document.querySelector('.pj-issues')).display,safety:getComputedStyle(document.querySelector('.pj-grid--small')).display,expanded:document.querySelector('.pj-safety-toggle')?.getAttribute('aria-expanded')})`)
  if (opened.issues === 'none' || opened.safety === 'none' || opened.expanded !== 'true') throw new Error(`手动展开异常与安全失败：${JSON.stringify(opened)}`)

  await evaluate(cdp, `document.querySelector('.pj-safety-toggle').click(); true`)
  await waitFor(cdp, `!document.querySelector('.pj-form')?.classList.contains('pj-safety-expanded')`)

  await evaluate(cdp, `(() => {
    const labels=Array.from(document.querySelectorAll('.pj-form label'));
    const practice=labels.find(x=>x.querySelector('span')?.textContent.trim()==='实践卡')?.querySelector('select');
    practice.value='practice.basic.natural_breath'; practice.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`)
  await waitFor(cdp, `Array.from(document.querySelectorAll('.pj-form label>span')).some(x=>x.textContent.trim()==='呼吸自然度')`)
  await evaluate(cdp, `(() => {
    const labels=Array.from(document.querySelectorAll('.pj-form label'));
    const breath=labels.find(x=>x.querySelector('span')?.textContent.trim()==='呼吸自然度')?.querySelector('select');
    breath.value='clearly_controlled'; breath.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`)
  await waitFor(cdp, `document.querySelector('.pj-draft-notes') && document.querySelector('.pj-form')?.classList.contains('pj-safety-expanded')`)
  const autoOpened = await evaluate(cdp, `({text:document.querySelector('.pj-safety-toggle')?.textContent||'',notes:document.querySelector('.pj-draft-notes')?.textContent||'',expanded:document.querySelector('.pj-safety-toggle')?.getAttribute('aria-expanded')})`)
  if (!autoOpened.text.includes('需要安全核对') || !autoOpened.notes.includes('主动控制呼吸') || autoOpened.expanded !== 'true') {
    throw new Error(`草稿安全提醒未自动展开：${JSON.stringify(autoOpened)}`)
  }

  await evaluate(cdp, `(() => {
    const issue=document.querySelector('.pj-issues input'); issue.click();
    const severity=Array.from(document.querySelectorAll('.pj-grid--small select')).find(s=>s.querySelector('option[value="red"]'));
    severity.value='red'; severity.dispatchEvent(new Event('change',{bubbles:true}));
    const start=Array.from(document.querySelectorAll('.pj-form select')).find(s=>s.querySelector('option[value="skipped"]'));
    start.value='skipped'; start.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`)
  await waitFor(cdp, `document.querySelector('.pj-form')?.classList.contains('pj-safety-skipped')`)
  const skipped = await evaluate(cdp, `({toggleHidden:document.querySelector('.pj-safety-toggle')?.hidden,issues:getComputedStyle(document.querySelector('.pj-issues')).display,safety:getComputedStyle(document.querySelector('.pj-grid--small')).display})`)
  if (!skipped.toggleHidden || skipped.issues !== 'none' || skipped.safety !== 'none') throw new Error(`不练记录仍展示本次异常区：${JSON.stringify(skipped)}`)

  const saved = await evaluate(cdp, `(async () => {
    document.querySelector('.pj-form').requestSubmit();
    await new Promise(r=>setTimeout(r,140));
    const payload=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}');
    return payload.records?.[0]||null;
  })()`)
  if (!saved || saved.startState !== 'skipped' || saved.severity !== 'none' || (saved.issues||[]).length !== 0 || saved.nextStep !== 'not_decided') {
    throw new Error(`不练记录仍携带练习异常或后续决定：${JSON.stringify(saved)}`)
  }

  console.log('[safety-reduction-e2e] 通过：正常安全区折叠；异常提醒自动展开；不练记录不携带本次练习异常。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-safety-reduction-e2e-'))
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
  console.error(`[safety-reduction-e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => {
  clearTimeout(watchdog)
  process.exit(0)
}).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[safety-reduction-e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
