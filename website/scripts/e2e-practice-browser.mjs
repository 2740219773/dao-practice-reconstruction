import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE_URL = process.env.WDZ_E2E_BASE_URL || 'http://127.0.0.1:4173'
const CDP_PORT = Number(process.env.WDZ_CDP_PORT || 9222)
const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const HARD_TIMEOUT_MS = Number(process.env.WDZ_E2E_TIMEOUT_MS || 90000)
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

async function waitCdp(timeoutMs = 30000, chromeProcess = null) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (chromeProcess && chromeProcess.exitCode !== null) {
      throw new Error(`Chromium 在 DevTools 就绪前退出，exitCode=${chromeProcess.exitCode}`)
    }
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
  throw new Error(`等待 Chromium DevTools 超时（${timeoutMs}ms）`)
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

async function waitFor(cdp, expression, timeoutMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return
    await sleep(100)
  }
  throw new Error(`等待浏览器条件超时：${expression}`)
}

async function clickTab(cdp, text) {
  await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).find(b=>b.textContent.includes(${JSON.stringify(text)})).click(); true`)
  await sleep(80)
}

async function storedCount(cdp) {
  return evaluate(cdp, `JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}').records?.length || 0`)
}

async function runScenario(cdp) {
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.practice-journal')`)

  await evaluate(cdp, `localStorage.removeItem(${JSON.stringify(STORAGE_KEY)}); location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.pj-form')`)

  const tabs = await evaluate(cdp, `Array.from(document.querySelectorAll('.pj-tabs button')).map(b=>({text:b.textContent.trim(),role:b.getAttribute('role'),selected:b.getAttribute('aria-selected')}))`)
  for (const label of ['每日记录', '最近7天', '30天复盘', '数据管理']) {
    if (!tabs.some((item) => item.text === label && item.role === 'tab')) throw new Error(`缺少可访问标签页：${label}`)
  }
  if (tabs.find((item) => item.text === '每日记录')?.selected !== 'true') throw new Error('默认标签页 aria-selected 错误')

  const keyboardWorked = await evaluate(cdp, `(async()=>{
    const first=document.querySelector('.pj-tabs [role="tab"]'); first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    await new Promise(r=>setTimeout(r,80));
    const active=document.activeElement;
    return active?.textContent?.includes('最近7天') && active.getAttribute('aria-selected')==='true' && Boolean(document.querySelector('.pj-review'));
  })()`)
  if (!keyboardWorked) throw new Error('标签页键盘 ArrowRight 导航失败')
  await clickTab(cdp, '每日记录')

  // 调身只记录本卡需要的字段；呼吸/注意不得再作为必填项出现。
  const normalSaved = await evaluate(cdp, `(async()=>{
    const labels=()=>Array.from(document.querySelectorAll('.pj-form label'));
    const find=(text)=>labels().find(el=>el.querySelector('span')?.textContent.trim()===text);
    const select=(text,value)=>{const el=find(text)?.querySelector('select'); if(!el) throw new Error(text); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true}))};
    const input=(text,value)=>{const el=find(text)?.querySelector('input'); if(!el) throw new Error(text); el.value=String(value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}))};
    select('实践卡','practice.basic.posture'); await new Promise(r=>setTimeout(r,50));
    const minimal=!find('呼吸自然度') && !find('注意返回') && Boolean(find('身体姿势')) && Boolean(find('练后状态'));
    select('开始前状态','acceptable'); input('实际时长（分钟）',3); select('身体姿势','comfortable'); select('情绪状态','stable'); select('练后状态','normal');
    document.querySelector('.pj-form').requestSubmit(); await new Promise(r=>setTimeout(r,150));
    const data=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}'); const saved=data.records?.[0];
    return minimal && data.records?.length===1 && saved?.practiceId==='practice.basic.posture' && saved?.durationMinutes===3 && saved?.breathState==='not_observed' && saved?.attentionState==='not_practiced';
  })()`)
  if (!normalSaved) throw new Error('调身最小字段或普通记录保存失败')

  const skippedSaved = await evaluate(cdp, `(async()=>{
    const labels=()=>Array.from(document.querySelectorAll('.pj-form label')); const find=(text)=>labels().find(el=>el.querySelector('span')?.textContent.trim()===text);
    const select=(text,value)=>{const el=find(text)?.querySelector('select'); if(!el) throw new Error(text); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true}))};
    select('实践卡','practice.basic.natural_breath'); select('开始前状态','skipped'); await new Promise(r=>setTimeout(r,80));
    const hidden=!find('实际时长（分钟）')&&!find('身体姿势')&&!find('呼吸自然度')&&!find('注意返回')&&!find('练后状态')&&Boolean(document.querySelector('.pj-skip-note'));
    document.querySelector('.pj-form').requestSubmit(); await new Promise(r=>setTimeout(r,150));
    const latest=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}').records?.[0];
    return hidden && latest?.startState==='skipped' && latest?.durationMinutes===0 && document.querySelector('.pj-notice')?.textContent.includes('不会被计为失败');
  })()`)
  if (!skippedSaved) throw new Error('“今天决定不练”交互或0分钟归一失败')

  await evaluate(cdp, `location.reload(); true`)
  await waitFor(cdp, `document.readyState === 'complete' && document.querySelector('.practice-journal')`)
  if (await storedCount(cdp) !== 2) throw new Error('刷新后两条本地记录未完整保留')

  await clickTab(cdp, '数据管理')
  await waitFor(cdp, `document.querySelector('.pj-data')`)
  if (!/共有\s*2\s*条记录/.test(await evaluate(cdp, `document.querySelector('.pj-data').innerText`))) throw new Error('数据管理页未显示2条记录')

  const exported = await evaluate(cdp, `(async()=>{
    window.__wdzExportBlob=null; window.__wdzDownloadName='';
    const originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL, originalClick=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=(blob)=>{window.__wdzExportBlob=blob; return 'blob:wdz-e2e'}; URL.revokeObjectURL=()=>{}; HTMLAnchorElement.prototype.click=function(){window.__wdzDownloadName=this.download};
    Array.from(document.querySelectorAll('.pj-actions button')).find(b=>b.textContent.includes('导出 JSON')).click(); await new Promise(r=>setTimeout(r,80));
    const payload=JSON.parse(await window.__wdzExportBlob.text()); const result={schemaVersion:payload.schemaVersion,count:payload.records?.length,name:window.__wdzDownloadName,notice:document.querySelector('.pj-notice')?.textContent||''};
    URL.createObjectURL=originalCreate; URL.revokeObjectURL=originalRevoke; HTMLAnchorElement.prototype.click=originalClick; return result;
  })()`)
  if (exported.schemaVersion!==1||exported.count!==2||!String(exported.name).endsWith('.json')||!exported.notice.includes('本地 JSON 备份')) throw new Error(`JSON 导出异常：${JSON.stringify(exported)}`)

  const imported = await evaluate(cdp, `(async()=>{
    const current=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})); const clone=structuredClone(current.records[0]); clone.id='e2e-imported-record'; clone.createdAt=new Date().toISOString(); clone.practiceId='practice.basic.contact_awareness';
    const file=new File([JSON.stringify({schemaVersion:1,records:[clone]})],'wdz-e2e-import.json',{type:'application/json'}); const input=document.querySelector('.pj-data input[type="file"]'); const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,180)); const data=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}'); return {count:data.records?.length,has:data.records?.some(r=>r.id==='e2e-imported-record'),notice:document.querySelector('.pj-notice')?.textContent||''};
  })()`)
  if (imported.count!==3||!imported.has||!imported.notice.includes('已导入 1 条')) throw new Error(`JSON 导入失败：${JSON.stringify(imported)}`)

  const deleteGuard = await evaluate(cdp, `(async()=>{
    let prompt=''; const original=window.confirm; window.confirm=(text)=>{prompt=text;return false}; document.querySelector('.pj-record button').click(); await new Promise(r=>setTimeout(r,60)); const afterCancel=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).records.length;
    window.confirm=()=>true; document.querySelector('.pj-record button').click(); await new Promise(r=>setTimeout(r,60)); const afterConfirm=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).records.length; window.confirm=original; return {afterCancel,afterConfirm,prompt};
  })()`)
  if (deleteGuard.afterCancel!==3||deleteGuard.afterConfirm!==2||!deleteGuard.prompt.includes('此操作无法撤销')) throw new Error(`单条删除确认失败：${JSON.stringify(deleteGuard)}`)

  const clearGuard = await evaluate(cdp, `(async()=>{
    const original=window.confirm; window.confirm=()=>false; Array.from(document.querySelectorAll('.pj-actions button')).find(b=>b.textContent.includes('清空本机记录')).click(); await new Promise(r=>setTimeout(r,60)); const afterCancel=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).records.length;
    window.confirm=()=>true; Array.from(document.querySelectorAll('.pj-actions button')).find(b=>b.textContent.includes('清空本机记录')).click(); await new Promise(r=>setTimeout(r,60)); const afterConfirm=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).records.length; window.confirm=original; return {afterCancel,afterConfirm,notice:document.querySelector('.pj-notice')?.textContent||''};
  })()`)
  if (clearGuard.afterCancel!==2||clearGuard.afterConfirm!==0||!clearGuard.notice.includes('已清空')) throw new Error(`清空确认失败：${JSON.stringify(clearGuard)}`)

  await clickTab(cdp, '每日记录')
  await waitFor(cdp, `document.querySelector('.pj-form')`)
  const restored = await evaluate(cdp, `(async()=>{
    const labels=()=>Array.from(document.querySelectorAll('.pj-form label')); const find=(text)=>labels().find(el=>el.querySelector('span')?.textContent.trim()===text);
    const select=(text,value)=>{const el=find(text)?.querySelector('select'); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true}))}; const input=(text,value)=>{const el=find(text)?.querySelector('input'); el.value=String(value); el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
    select('实践卡','practice.basic.posture'); await new Promise(r=>setTimeout(r,30)); select('开始前状态','acceptable'); input('实际时长（分钟）',3); document.querySelector('.pj-form').requestSubmit(); await new Promise(r=>setTimeout(r,130)); return JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).records.length===1;
  })()`)
  if (!restored) throw new Error('清空后的基础记录恢复失败')

  await clickTab(cdp, '最近7天')
  await waitFor(cdp, `document.querySelector('.pj-review')`)
  const clipboardDenied = await evaluate(cdp, `(async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(Navigator.prototype,'clipboard'); Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('denied','NotAllowedError')}}});
    Array.from(document.querySelectorAll('.pj-review button')).find(b=>b.textContent.includes('复制7天')).click(); await new Promise(r=>setTimeout(r,100)); const text=document.querySelector('.pj-notice')?.textContent||''; try{if(descriptor)Object.defineProperty(Navigator.prototype,'clipboard',descriptor)}catch{} return text;
  })()`)
  if (!clipboardDenied.includes('请手动选择下方文本复制')) throw new Error('剪贴板拒绝后没有降级提示')

  await clickTab(cdp, '30天复盘')
  await waitFor(cdp, `document.querySelector('.pj-stage[data-stage-reduction="1"]')`)
  const stageText = await evaluate(cdp, `document.querySelector('.pj-stage').innerText`)
  if (!stageText.includes('当前建议')||!stageText.includes('继续当前阶段，先补足记录')||!stageText.includes('查看30天记录依据（不是等级）')) throw new Error('记录不足时30天建议或证据折叠异常')

  await clickTab(cdp, '每日记录')
  const redSaved = await evaluate(cdp, `(async()=>{
    const labels=()=>Array.from(document.querySelectorAll('.pj-form label')); const find=(text)=>labels().find(el=>el.querySelector('span')?.textContent.trim()===text); const select=(text,value)=>{const el=find(text)?.querySelector('select'); if(!el)throw new Error(text); el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))}; const input=(text,value)=>{const el=find(text)?.querySelector('input');if(!el)throw new Error(text);el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
    select('实践卡','practice.basic.precheck'); await new Promise(r=>setTimeout(r,30)); select('开始前状态','acceptable'); input('实际时长（分钟）',1); select('安全分流','red'); select('下次决定','pause_all'); document.querySelector('.pj-form').requestSubmit(); await new Promise(r=>setTimeout(r,150)); const data=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||'{}'); return data.records?.length===2&&data.records.some(r=>r.severity==='red');
  })()`)
  if (!redSaved) throw new Error('红色事件未保存')

  await clickTab(cdp, '30天复盘')
  await waitFor(cdp, `document.querySelector('.pj-stage[data-stage-reduction="1"]')`)
  const redText = await evaluate(cdp, `document.querySelector('.pj-stage').innerText`)
  if (!redText.includes('30天安全提醒')||!redText.includes('红色事件')||!redText.includes('因安全原因暂停并处理异常')||!redText.includes('安全边界')) throw new Error('红色事件后未优先显示安全并暂停长期推进')

  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(180)
  const mobile = await evaluate(cdp, `({viewport:window.innerWidth,journalWidth:document.querySelector('.practice-journal').getBoundingClientRect().width,tabsOverflow:getComputedStyle(document.querySelector('.pj-tabs')).overflowX,pageOverflow:document.documentElement.scrollWidth-window.innerWidth})`)
  if (mobile.journalWidth>mobile.viewport+1||!['auto','scroll'].includes(mobile.tabsOverflow)||mobile.pageOverflow>8) throw new Error(`窄屏异常：${JSON.stringify(mobile)}`)

  console.log('[e2e] 通过：最小字段、普通/不练记录、键盘、JSON、剪贴板、删除/清空、30天安全优先与390px窄屏正常。')
}

async function main() {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'wdz-e2e-'))
  let preview
  let chrome
  let cdp
  try {
    preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], { cwd: process.cwd(), stdio: 'ignore' })
    await waitHttp(`${BASE_URL}/practice/`)
    chrome = spawn(findChrome(), ['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--remote-allow-origins=*',`--remote-debugging-port=${CDP_PORT}`,`--user-data-dir=${profileDir}`,`${BASE_URL}/practice/`], { stdio: 'ignore' })
    const target = await waitCdp(30000, chrome)
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
