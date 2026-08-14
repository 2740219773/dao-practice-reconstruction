import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_REVIEW_CDP_PORT || 9578)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_REVIEW_E2E_TIMEOUT_MS || 45000)
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
  throw new Error('等待7天复盘减法 Chromium DevTools 超时')
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
  throw new Error(`等待7天复盘减法条件超时：${expression}`)
}

async function openReview(cdp) {
  await evaluate(cdp, `(() => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((button) => button.textContent?.includes('最近7天'));
    tab?.click();
    return Boolean(tab);
  })()`)
  await waitFor(cdp, `document.querySelector('.pj-review[data-review-reduction="1"]')`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)

  await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)
  await openReview(cdp)

  const emptyState = await evaluate(cdp, `(() => {
    const review = document.querySelector('.pj-review[data-review-reduction="1"]');
    const rules = review?.querySelector('[data-review-kind="rules"]');
    const issues = review?.querySelector('[data-review-kind="issues"]');
    const stats = review?.querySelector('.pj-review-stats-details');
    const ai = review?.querySelector('.pj-review-ai-details');
    return {
      guide: review?.querySelector('.pj-review-guide')?.textContent || '',
      rulesText: rules?.textContent || '',
      rulesOrder: rules ? getComputedStyle(rules).order : '',
      issuesText: issues?.textContent || '',
      issuesOrder: issues ? getComputedStyle(issues).order : '',
      emptyIssues: Boolean(issues?.classList.contains('pj-review-empty-issues')),
      statsOpen: Boolean(stats?.open),
      aiOpen: Boolean(ai?.open),
      statsOrder: stats ? getComputedStyle(stats).order : '',
      aiOrder: ai ? getComputedStyle(ai).order : ''
    };
  })()`)

  if (!emptyState.guide.includes('先看规则提醒和重复问题')) throw new Error(`7天复盘缺少减负引导：${JSON.stringify(emptyState)}`)
  if (!emptyState.rulesText.includes('规则型复盘') || emptyState.rulesOrder !== '1') throw new Error(`规则提醒没有成为首要内容：${JSON.stringify(emptyState)}`)
  if (!emptyState.issuesText.includes('最近7天暂无已记录问题') || !emptyState.emptyIssues || emptyState.issuesOrder !== '2') throw new Error(`空重复问题没有被压缩：${JSON.stringify(emptyState)}`)
  if (emptyState.statsOpen || emptyState.aiOpen || emptyState.statsOrder !== '3' || emptyState.aiOrder !== '4') throw new Error(`数字或AI材料没有默认后移：${JSON.stringify(emptyState)}`)

  const expanded = await evaluate(cdp, `(() => {
    const review = document.querySelector('.pj-review[data-review-reduction="1"]');
    const stats = review?.querySelector('.pj-review-stats-details');
    const ai = review?.querySelector('.pj-review-ai-details');
    if (stats) stats.open = true;
    if (ai) ai.open = true;
    return {
      statCount: stats?.querySelectorAll('.pj-stats > div').length || 0,
      statsText: stats?.textContent || '',
      aiText: ai?.textContent || '',
      promptRows: ai?.querySelector('.pj-prompt')?.getAttribute('rows') || ''
    };
  })()`)
  if (expanded.statCount !== 6 || !expanded.statsText.includes('实际练习')) throw new Error(`7天数字明细展开后不完整：${JSON.stringify(expanded)}`)
  if (!expanded.aiText.includes('给 AI 的7天复盘材料') || expanded.promptRows !== '17') throw new Error(`AI复盘材料折叠后不可恢复：${JSON.stringify(expanded)}`)

  const date = await evaluate(cdp, `(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  })()`)

  await evaluate(cdp, `(() => {
    const record = {
      id: 'review-reduction-yellow', schemaVersion: 1, createdAt: new Date().toISOString(), date: ${JSON.stringify(date)},
      practiceId: 'practice.basic.natural_breath', durationMinutes: 3, startState: 'acceptable',
      postureState: 'not_observed', breathState: 'clearly_controlled', attentionState: 'not_practiced',
      emotionState: 'not_observed', afterState: 'need_rest', issues: ['breath_control'], severity: 'yellow',
      adjustment: '', note: '', nextStep: 'not_decided'
    };
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, JSON.stringify({ schemaVersion: 1, records: [record] }));
    location.reload();
    return true;
  })()`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)
  await openReview(cdp)

  const issueState = await evaluate(cdp, `(() => {
    const review = document.querySelector('.pj-review[data-review-reduction="1"]');
    const rules = review?.querySelector('[data-review-kind="rules"]');
    const issues = review?.querySelector('[data-review-kind="issues"]');
    const stats = review?.querySelector('.pj-review-stats-details');
    const ai = review?.querySelector('.pj-review-ai-details');
    return {
      rules: rules?.textContent || '',
      issues: issues?.textContent || '',
      compact: Boolean(issues?.classList.contains('pj-review-empty-issues')),
      statsOpen: Boolean(stats?.open),
      aiOpen: Boolean(ai?.open)
    };
  })()`)

  if (!issueState.rules.includes('规则型复盘') || !issueState.rules.includes('黄色')) throw new Error(`安全规则提醒没有直接可见：${JSON.stringify(issueState)}`)
  if (!issueState.issues.includes('主动控制呼吸') || !issueState.issues.includes('1 次') || issueState.compact) throw new Error(`真实重复问题被减负层隐藏：${JSON.stringify(issueState)}`)
  if (issueState.statsOpen || issueState.aiOpen) throw new Error(`有安全问题时低频数字/AI仍不应自动抢占首屏：${JSON.stringify(issueState)}`)

  console.log('[review-reduction-e2e] 通过：7天复盘先显示规则与重复问题，数字和AI按需展开，安全信息未被减负隐藏。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-review-reduction-e2e-'))
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
  console.error(`[review-reduction-e2e失败] 超过硬超时 ${HARD_TIMEOUT_MS}ms，强制结束。`)
  process.exit(1)
}, HARD_TIMEOUT_MS)

main().then(() => {
  clearTimeout(watchdog)
  process.exit(0)
}).catch((error) => {
  clearTimeout(watchdog)
  console.error(`[review-reduction-e2e失败] ${error.stack || error.message || error}`)
  process.exit(1)
})
