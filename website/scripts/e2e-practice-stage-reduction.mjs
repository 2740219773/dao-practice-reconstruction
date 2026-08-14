import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_STAGE_CDP_PORT || 9582)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_STAGE_E2E_TIMEOUT_MS || 50000)
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
  throw new Error('等待30天复盘减法 Chromium DevTools 超时')
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
  throw new Error(`等待30天复盘减法条件超时：${expression}`)
}

async function openStage(cdp) {
  await evaluate(cdp, `(() => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((button) => button.textContent?.includes('30天复盘') || button.textContent?.includes('30天与阶段'));
    tab?.click();
    return Boolean(tab);
  })()`)
  await waitFor(cdp, `document.querySelector('.pj-stage[data-stage-reduction="1"]')`)
}

function localDateExpression() {
  return `(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  })()`
}

async function writeRecordAndReload(cdp, severity) {
  const date = await evaluate(cdp, localDateExpression())
  await evaluate(cdp, `(() => {
    const record = {
      id: 'stage-reduction-' + ${JSON.stringify(severity)}, schemaVersion: 1, createdAt: new Date().toISOString(), date: ${JSON.stringify(date)},
      practiceId: 'practice.basic.natural_breath', durationMinutes: 3, startState: 'acceptable',
      postureState: 'not_observed', breathState: 'mostly_natural', attentionState: 'not_practiced',
      emotionState: 'not_observed', afterState: 'normal', issues: [], severity: ${JSON.stringify(severity)},
      adjustment: '', note: '', nextStep: 'not_decided'
    };
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, JSON.stringify({ schemaVersion: 1, records: [record] }));
    location.reload();
    return true;
  })()`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)

  await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)
  await openStage(cdp)

  const emptyState = await evaluate(cdp, `(() => {
    const stage = document.querySelector('.pj-stage[data-stage-reduction="1"]');
    const decision = stage?.querySelector('[data-stage-kind="decision"]');
    const evidence = stage?.querySelector('.pj-stage-evidence-details');
    const ai = stage?.querySelector('.pj-stage-ai-details');
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((button) => button.getAttribute('aria-selected') === 'true');
    return {
      tabText: tab?.textContent || '',
      guide: stage?.querySelector('.pj-stage-guide')?.textContent || '',
      decision: decision?.textContent || '',
      decisionOrder: decision ? getComputedStyle(decision).order : '',
      safetyCount: stage?.querySelectorAll('[data-stage-kind="safety"]').length || 0,
      evidenceOpen: Boolean(evidence?.open),
      aiOpen: Boolean(ai?.open),
      evidenceOrder: evidence ? getComputedStyle(evidence).order : '',
      aiOrder: ai ? getComputedStyle(ai).order : ''
    };
  })()`)

  if (emptyState.tabText.trim() !== '30天复盘') throw new Error(`30天入口仍保留晋级式命名：${JSON.stringify(emptyState)}`)
  if (!emptyState.guide.includes('先看安全提醒和当前建议') || !emptyState.guide.includes('不是等级')) throw new Error(`30天复盘缺少减负边界：${JSON.stringify(emptyState)}`)
  if (!emptyState.decision.includes('当前建议') || emptyState.decision.includes('阶段方向') || emptyState.decisionOrder !== '2') throw new Error(`当前建议没有成为首要长期信息：${JSON.stringify(emptyState)}`)
  if (!emptyState.decision.includes('不是修炼境界') || !emptyState.decision.includes('自动解锁')) throw new Error(`当前建议缺少非等级边界：${JSON.stringify(emptyState)}`)
  if (emptyState.safetyCount !== 0 || emptyState.evidenceOpen || emptyState.aiOpen || emptyState.evidenceOrder !== '3' || emptyState.aiOrder !== '4') throw new Error(`无安全事件时30天明细或AI没有默认后移：${JSON.stringify(emptyState)}`)

  const expanded = await evaluate(cdp, `(() => {
    const stage = document.querySelector('.pj-stage[data-stage-reduction="1"]');
    const evidence = stage?.querySelector('.pj-stage-evidence-details');
    const ai = stage?.querySelector('.pj-stage-ai-details');
    if (evidence) evidence.open = true;
    if (ai) ai.open = true;
    return {
      statCount: evidence?.querySelectorAll('.pj-stats > div').length || 0,
      dayCount: evidence?.querySelectorAll('.pj-day').length || 0,
      capabilityCount: evidence?.querySelectorAll('.pj-capability').length || 0,
      capabilityTitle: evidence?.querySelector('h3')?.textContent || '',
      evidenceText: evidence?.textContent || '',
      aiText: ai?.textContent || '',
      promptRows: ai?.querySelector('.pj-prompt')?.getAttribute('rows') || ''
    };
  })()`)

  if (expanded.statCount !== 6 || expanded.dayCount !== 30 || expanded.capabilityCount !== 4) throw new Error(`30天记录依据展开后不完整：${JSON.stringify(expanded)}`)
  if (!expanded.evidenceText.includes('四类观察维度') || !expanded.evidenceText.includes('不是医学评估')) throw new Error(`30天记录依据缺少观察维度或边界：${JSON.stringify(expanded)}`)
  if (!expanded.aiText.includes('给 AI 的30天阶段复盘材料') || expanded.promptRows !== '20') throw new Error(`30天AI材料折叠后不可恢复：${JSON.stringify(expanded)}`)

  await writeRecordAndReload(cdp, 'yellow')
  await openStage(cdp)

  const yellowState = await evaluate(cdp, `(() => {
    const stage = document.querySelector('.pj-stage[data-stage-reduction="1"]');
    const safety = stage?.querySelector('[data-stage-kind="safety"]');
    const decision = stage?.querySelector('[data-stage-kind="decision"]');
    return {
      safety: safety?.textContent || '',
      safetyClass: safety?.className || '',
      safetyOrder: safety ? getComputedStyle(safety).order : '',
      decision: decision?.textContent || '',
      decisionOrder: decision ? getComputedStyle(decision).order : '',
      evidenceOpen: Boolean(stage?.querySelector('.pj-stage-evidence-details')?.open),
      aiOpen: Boolean(stage?.querySelector('.pj-stage-ai-details')?.open)
    };
  })()`)

  if (!yellowState.safety.includes('1 次黄色事件') || !yellowState.safety.includes('长期建议不能覆盖') || !yellowState.safetyClass.includes('yellow') || yellowState.safetyOrder !== '1') throw new Error(`单次黄色事件没有优先显示：${JSON.stringify(yellowState)}`)
  if (!yellowState.decision.includes('当前建议') || yellowState.decisionOrder !== '2') throw new Error(`黄色安全提示后长期建议层级异常：${JSON.stringify(yellowState)}`)
  if (yellowState.evidenceOpen || yellowState.aiOpen) throw new Error(`有黄色事件时低频证据/AI不应自动抢占首屏：${JSON.stringify(yellowState)}`)

  await writeRecordAndReload(cdp, 'red')
  await openStage(cdp)
  const redState = await evaluate(cdp, `(() => {
    const stage = document.querySelector('.pj-stage[data-stage-reduction="1"]');
    const safety = stage?.querySelector('[data-stage-kind="safety"]');
    const decision = stage?.querySelector('[data-stage-kind="decision"]');
    return {
      safety: safety?.textContent || '',
      safetyClass: safety?.className || '',
      decision: decision?.textContent || ''
    };
  })()`)
  if (!redState.safety.includes('1 次红色事件') || !redState.safetyClass.includes('red') || !redState.decision.includes('因安全原因暂停')) throw new Error(`红色安全事件没有覆盖长期阶段进度：${JSON.stringify(redState)}`)

  console.log('[stage-reduction-e2e] 通过：30天复盘先显示安全与当前建议，记录依据/AI按需展开，黄红事件不被长期建议覆盖。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-stage-reduction-e2e-'))
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
  console.error(`[stage-reduction-e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => {
  clearTimeout(watchdog)
  process.exit(0)
}).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[stage-reduction-e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
