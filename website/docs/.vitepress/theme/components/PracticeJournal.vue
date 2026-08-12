<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const STORAGE_KEY = 'wendaozhi.practice.records.v1'
const SCHEMA_VERSION = 1

const practices = [
  { id: 'practice.basic.precheck', name: '01 准备与安全检查', max: 3 },
  { id: 'practice.basic.posture', name: '02 调身与舒适姿势', max: 5 },
  { id: 'practice.basic.contact_awareness', name: '03 身体接触觉察', max: 5 },
  { id: 'practice.basic.natural_breath', name: '04 自然察息', max: 5 },
  { id: 'practice.basic.attention_return', name: '05 注意返回与收心基础', max: 6 },
  { id: 'practice.basic.short_sitting', name: '06 短时基础安坐', max: 10 },
  { id: 'practice.basic.movement_stillness', name: '07 轻柔动静转换', max: 8 },
  { id: 'practice.basic.daily_awareness', name: '08 日用觉察', max: 3 }
]

const knownPracticeIds = new Set(practices.map((p) => p.id))
const issueOptions = [
  ['posture_pain', '姿势疼痛'],
  ['numbness', '麻木'],
  ['shoulder_neck_tension', '肩颈紧张'],
  ['breath_control', '主动控制呼吸'],
  ['dizziness_chest', '头晕、胸闷或明显心慌'],
  ['restlessness', '明显烦躁'],
  ['sleepiness', '困倦'],
  ['special_sensation_chasing', '追求特殊感觉'],
  ['perceptual_reality_change', '异常感知或现实感变化'],
  ['function_impact', '练后影响现实功能'],
  ['other', '其他']
] as const

const issueLabels = Object.fromEntries(issueOptions) as Record<string, string>
const practiceLabels = Object.fromEntries(practices.map((p) => [p.id, p.name.replace(/^\d+\s*/, '')])) as Record<string, string>

interface PracticeRecord {
  id: string
  schemaVersion: number
  createdAt: string
  date: string
  practiceId: string
  durationMinutes: number
  startState: string
  postureState: string
  breathState: string
  attentionState: string
  emotionState: string
  afterState: string
  issues: string[]
  severity: 'none' | 'yellow' | 'red'
  adjustment: string
  note: string
  nextStep: string
}

function localDateString(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function emptyForm(): PracticeRecord {
  return {
    id: '', schemaVersion: SCHEMA_VERSION, createdAt: '', date: localDateString(),
    practiceId: practices[0].id, durationMinutes: 2, startState: 'acceptable',
    postureState: 'not_observed', breathState: 'not_observed', attentionState: 'not_practiced',
    emotionState: 'stable', afterState: 'normal', issues: [], severity: 'none',
    adjustment: '', note: '', nextStep: 'continue'
  }
}

const ready = ref(false)
const tab = ref<'record' | 'review' | 'data'>('record')
const records = ref<PracticeRecord[]>([])
const form = ref<PracticeRecord>(emptyForm())
const notice = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const selectedPractice = computed(() => practices.find((p) => p.id === form.value.practiceId) || practices[0])

function normalizeRecord(raw: any): PracticeRecord | null {
  if (!raw || typeof raw !== 'object') return null
  if (!raw.id || !raw.date || !raw.practiceId || !knownPracticeIds.has(String(raw.practiceId))) return null
  const duration = Number(raw.durationMinutes)
  if (!Number.isFinite(duration) || duration < 0 || duration > 120) return null
  return {
    ...emptyForm(), ...raw,
    schemaVersion: SCHEMA_VERSION,
    durationMinutes: duration,
    issues: Array.isArray(raw.issues) ? raw.issues.filter((x: unknown) => typeof x === 'string') : [],
    severity: ['none', 'yellow', 'red'].includes(raw.severity) ? raw.severity : 'none'
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: records.value }))
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.records)) {
        records.value = parsed.records.map(normalizeRecord).filter(Boolean) as PracticeRecord[]
      }
    }
  } catch {
    notice.value = '本地记录读取失败。原数据没有被自动覆盖，可先导出浏览器存储后再处理。'
  }
  ready.value = true
})

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `record-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function saveRecord() {
  notice.value = ''
  const actual = form.value.startState === 'skipped' ? 0 : Number(form.value.durationMinutes)
  if (!Number.isFinite(actual) || actual < 0 || actual > 120) {
    notice.value = '实际时长需要填写 0—120 分钟之间的数字。超过基础卡上限仍可如实记录，但不建议把超时当作下一次目标。'
    return
  }
  if (form.value.startState !== 'skipped' && actual < 1) {
    notice.value = '如果实际进行了练习，请记录至少 1 分钟；如果决定不练，请把“开始前状态”选为“今天决定不练”。'
    return
  }

  const reviewedMax = selectedPractice.value.max
  const overLimit = actual > reviewedMax
  const record: PracticeRecord = {
    ...form.value,
    id: newId(),
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    durationMinutes: actual,
    issues: [...form.value.issues]
  }
  records.value.unshift(record)
  persist()
  form.value = emptyForm()

  if (record.severity === 'red') {
    notice.value = '记录已保存在本机。你标记了红色事件：请停止相关实践，并优先查看安全边界，不继续加练。'
  } else if (overLimit) {
    notice.value = `已按实际保存。本次 ${actual} 分钟超过该卡当前审查上限 ${reviewedMax} 分钟；这是事实记录，不代表下一次应该继续超时。`
  } else {
    notice.value = '已保存到当前浏览器。本记录不会自动上传。'
  }
}

function toggleIssue(id: string) {
  const set = new Set(form.value.issues)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  form.value.issues = [...set]
}

function dateFromDaysAgo(days: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d
}

const weekRecords = computed(() => {
  const start = dateFromDaysAgo(6)
  return records.value.filter((r) => {
    const d = new Date(`${r.date}T00:00:00`)
    return !Number.isNaN(d.getTime()) && d >= start
  })
})

const weekMinutes = computed(() => weekRecords.value.reduce((s, r) => s + r.durationMinutes, 0))
const yellowCount = computed(() => weekRecords.value.filter((r) => r.severity === 'yellow').length)
const redCount = computed(() => weekRecords.value.filter((r) => r.severity === 'red').length)

const issueCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const r of weekRecords.value) for (const issue of r.issues) counts[issue] = (counts[issue] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})

const practiceCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const r of weekRecords.value) counts[r.practiceId] = (counts[r.practiceId] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})

const ruleAdvice = computed(() => {
  if (!weekRecords.value.length) return '本周还没有记录。先从一次短时、低负荷的基础实践开始即可。'
  if (redCount.value > 0) return '本周存在红色事件。优先停止相关实践并按安全边界处理；本工具不会在这种情况下推荐加量或高级练法。'
  if (yellowCount.value >= 2) return '本周黄色事件重复出现。优先暂停触发问题的单元、缩短或回退，而不是增加时长。'
  const issues = Object.fromEntries(issueCounts.value)
  if ((issues.breath_control || 0) >= 2) return '“主动控制呼吸”重复出现。可以暂时跳过察息，改用脚底、座面或环境声音；不要用主动调息来解决。'
  const posture = (issues.posture_pain || 0) + (issues.numbness || 0) + (issues.shoulder_neck_tension || 0)
  if (posture >= 2) return '姿势相关问题重复出现。优先换普通支撑、缩短时长和允许微调，不要忍痛维持。'
  if ((issues.function_impact || 0) > 0) return '记录中出现现实功能受影响。优先减少负荷并观察，不把连续性放在睡眠、工作和生活之前。'
  return '本周没有触发重复安全规则。保持当前低负荷即可，不需要因为“状态不错”自动增加时长。'
})

const reviewSummary = computed(() => {
  const topPractice = practiceCounts.value[0]
  const repeated = issueCounts.value.filter(([, count]) => count >= 2)
  return [
    `时间范围：最近7天（截至 ${localDateString()}）`,
    `记录次数：${weekRecords.value.length}`,
    `实际总时长：${weekMinutes.value} 分钟`,
    `主要实践：${topPractice ? `${practiceLabels[topPractice[0]] || topPractice[0]} ${topPractice[1]} 次` : '暂无'}`,
    `黄色事件：${yellowCount.value} 次`,
    `红色事件：${redCount.value} 次`,
    `重复问题：${repeated.length ? repeated.map(([id, n]) => `${issueLabels[id] || id} ${n} 次`).join('；') : '未发现出现2次以上的问题'}`,
    `规则型安全提示：${ruleAdvice.value}`
  ].join('\n')
})

const aiPrompt = computed(() => `你正在帮助我复盘“问道志”基础实践记录。\n\n规则：\n1. 只根据我提供的记录总结，不补造经历。\n2. 区分观察事实、我的个人解释和传统理论。\n3. 不诊断疾病，不判断气、经络、丹田、境界。\n4. 不生成闭气、胎息、强呼吸、强意守、周天、火候、采炼、辟谷、丹药等教程。\n5. 有红色安全信号时，优先建议停止相关练习并按安全规范处理。\n6. 同一黄色问题反复出现时，优先建议缩短、回退或暂停。\n7. 没有异常也不要自动增加练习时长。\n8. 按“本周事实—重复模式—安全提醒—下周建议—不能判断的部分”五段输出。\n\n以下是我的记录摘要：\n${reviewSummary.value}`)

async function copyAiPrompt() {
  try {
    await navigator.clipboard.writeText(aiPrompt.value)
    notice.value = 'AI 复盘材料已复制。只有你主动粘贴/提交时，记录摘要才会离开本页面。'
  } catch {
    notice.value = '浏览器未允许自动复制，请手动选择下方文本复制。'
  }
}

function exportData() {
  const payload = { app: '问道志', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), records: records.value }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wendaozhi-practice-records-${localDateString()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() { fileInput.value?.click() }

async function importData(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const parsed = JSON.parse(await file.text())
    if (parsed?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records)) throw new Error('版本或结构不支持')
    const valid = parsed.records.map(normalizeRecord).filter(Boolean) as PracticeRecord[]
    if (!valid.length && parsed.records.length) throw new Error('没有可识别的记录；未知实践 ID 不会导入')
    const map = new Map(records.value.map((r) => [r.id, r]))
    for (const r of valid) map.set(r.id, r)
    records.value = [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    persist()
    notice.value = `已导入 ${valid.length} 条可识别记录；同 ID 记录已合并。`
  } catch (e: any) {
    notice.value = `导入失败：${e?.message || '文件不是受支持的问道志记录格式'}。`
  }
}

function removeRecord(id: string) {
  records.value = records.value.filter((r) => r.id !== id)
  persist()
}

function clearAll() {
  if (!confirm('确认清空当前浏览器中的全部问道志实践记录？此操作无法撤销，建议先导出备份。')) return
  records.value = []
  persist()
  notice.value = '本地实践记录已清空。'
}
</script>

<template>
  <section class="practice-journal" aria-label="实践记录与复盘工具">
    <header class="pj-head">
      <div>
        <span class="pj-kicker">PRACTICE-002 · 本地记录工具</span>
        <h2>记录 · 复盘 · 安全提醒</h2>
        <p>数据默认只保存在当前浏览器，不自动上传，也不计算“修为分”。</p>
      </div>
      <span class="pj-local">本地优先</span>
    </header>

    <nav class="pj-tabs" aria-label="记录工具分页">
      <button :class="{ active: tab === 'record' }" @click="tab = 'record'">每日记录</button>
      <button :class="{ active: tab === 'review' }" @click="tab = 'review'">最近7天复盘</button>
      <button :class="{ active: tab === 'data' }" @click="tab = 'data'">数据管理</button>
    </nav>

    <p v-if="notice" class="pj-notice" :class="{ danger: notice.includes('红色') }">{{ notice }}</p>
    <div v-if="!ready" class="pj-loading">正在读取本机记录…</div>

    <form v-else-if="tab === 'record'" class="pj-form" @submit.prevent="saveRecord">
      <div class="pj-grid">
        <label><span>日期</span><input v-model="form.date" type="date" required /></label>
        <label><span>实践卡</span><select v-model="form.practiceId"><option v-for="p in practices" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label><span>实际时长（分钟）</span><input v-model.number="form.durationMinutes" type="number" min="0" max="120" /><small>该卡当前审查上限：{{ selectedPractice.max }} 分钟。若实际超时仍应如实记录。</small></label>
        <label><span>开始前状态</span><select v-model="form.startState"><option value="good">顺畅</option><option value="acceptable">可接受</option><option value="interfered">有明显干扰</option><option value="skipped">今天决定不练</option></select></label>
        <label><span>身体姿势</span><select v-model="form.postureState"><option value="comfortable">舒适</option><option value="acceptable">可接受</option><option value="adjusted">中途已调整</option><option value="stopped">因姿势停止</option><option value="not_observed">未观察</option></select></label>
        <label><span>呼吸自然度</span><select v-model="form.breathState"><option value="mostly_natural">自然为主</option><option value="sometimes_controlled">偶尔主动控制</option><option value="clearly_controlled">明显主动控制</option><option value="not_observed">未观察呼吸</option></select></label>
        <label><span>注意返回</span><select v-model="form.attentionState"><option value="returned">能发现并返回</option><option value="sometimes_returned">偶尔能</option><option value="difficult">今天较困难</option><option value="not_practiced">未练此项</option></select></label>
        <label><span>情绪状态</span><select v-model="form.emotionState"><option value="stable">稳定</option><option value="fluctuating">有波动但可接受</option><option value="interfered">明显干扰</option><option value="stopped">因此停止</option></select></label>
        <label><span>练后状态</span><select v-model="form.afterState"><option value="normal">正常回到日常</option><option value="need_rest">需要缓一缓</option><option value="affected">现实功能明显受影响</option></select></label>
      </div>

      <fieldset class="pj-issues">
        <legend>本次出现的问题（可多选）</legend>
        <label v-for="([id, label]) in issueOptions" :key="id" class="pj-check"><input type="checkbox" :checked="form.issues.includes(id)" @change="toggleIssue(id)" />{{ label }}</label>
      </fieldset>

      <div class="pj-grid pj-grid--small">
        <label><span>安全分流</span><select v-model="form.severity"><option value="none">无升级事件</option><option value="yellow">黄色：暂停/回退/观察</option><option value="red">红色：停止并按安全边界处理</option></select></label>
        <label><span>下次决定</span><select v-model="form.nextStep"><option value="continue">保持当前负荷</option><option value="shorten">缩短</option><option value="lower_frequency">降低频率</option><option value="step_back">回退基础单元</option><option value="pause_unit">暂停本单元</option><option value="daily_only">只保留日用觉察</option><option value="pause_all">暂停全部实践</option><option value="professional_opinion">考虑专业意见</option></select></label>
      </div>

      <label class="pj-wide"><span>做了什么调整</span><input v-model.trim="form.adjustment" maxlength="160" placeholder="例如：缩短到2分钟、改回脚底接触、换普通椅子" /></label>
      <label class="pj-wide"><span>事实记录</span><textarea v-model.trim="form.note" maxlength="600" rows="3" placeholder="只写实际发生了什么。主观热、麻、流动感可以记录，但不要在这里自动写成经络或境界结论。"></textarea></label>

      <div v-if="form.severity === 'red'" class="pj-redbox"><strong>红色事件优先于练习进度。</strong><span>保存记录后请停止相关实践并查看安全边界；本工具不会推荐下一种练法。</span></div>
      <button class="pj-primary" type="submit">保存到本机</button>
    </form>

    <div v-else-if="tab === 'review'" class="pj-review">
      <div class="pj-stats">
        <div><strong>{{ weekRecords.length }}</strong><span>近7天记录</span></div>
        <div><strong>{{ weekMinutes }}</strong><span>实际分钟</span></div>
        <div><strong>{{ yellowCount }}</strong><span>黄色事件</span></div>
        <div><strong>{{ redCount }}</strong><span>红色事件</span></div>
      </div>
      <section class="pj-panel"><h3>规则型复盘</h3><p>{{ ruleAdvice }}</p><small>这是依据明确规则生成的提醒，不是医学判断或传统境界判断。</small></section>
      <section class="pj-panel"><h3>重复问题</h3><p v-if="!issueCounts.length">最近7天暂无已记录问题。</p><ul v-else><li v-for="([id, count]) in issueCounts" :key="id">{{ issueLabels[id] || id }}：{{ count }} 次</li></ul></section>
      <section class="pj-panel"><h3>给 AI 的复盘材料</h3><p>这里只在浏览器中整理摘要，不会自动发送。你可以自行复制后提交给 AI。</p><textarea class="pj-prompt" :value="aiPrompt" rows="15" readonly></textarea><button class="pj-secondary" type="button" @click="copyAiPrompt">复制复盘材料</button></section>
    </div>

    <div v-else class="pj-data">
      <section class="pj-panel"><h3>本地数据</h3><p>当前浏览器共有 <strong>{{ records.length }}</strong> 条记录。默认没有账号、没有云同步、没有自动上传。</p><div class="pj-actions"><button class="pj-secondary" type="button" @click="exportData">导出 JSON</button><button class="pj-secondary" type="button" @click="triggerImport">导入 JSON</button><button class="pj-danger" type="button" @click="clearAll">清空本机记录</button><input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importData" /></div></section>
      <section class="pj-panel"><h3>最近记录</h3><p v-if="!records.length">还没有本地记录。</p><div v-for="r in records.slice(0, 10)" :key="r.id" class="pj-record"><div><strong>{{ r.date }} · {{ practiceLabels[r.practiceId] || r.practiceId }}</strong><span>{{ r.durationMinutes }} 分钟 · {{ r.severity === 'red' ? '红色事件' : r.severity === 'yellow' ? '黄色事件' : '无升级事件' }}</span><small v-if="r.note">{{ r.note }}</small></div><button type="button" @click="removeRecord(r.id)">删除</button></div></section>
      <details class="pj-privacy"><summary>隐私与数据边界</summary><p>实践记录可能包含身体、情绪和生活信息。当前版本只使用浏览器本地存储；清理浏览器数据可能导致记录丢失，重要记录请自行导出。若以后增加云同步，会另行设计权限、删除和隐私规则。</p></details>
    </div>
  </section>
</template>

<style scoped>
.practice-journal{margin:36px 0;padding:24px;border:1px solid var(--vp-c-divider);border-radius:18px;background:var(--vp-c-bg-soft);box-shadow:0 14px 40px rgba(0,0,0,.04)}
.pj-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.pj-head h2{margin:4px 0 8px;font-size:26px}.pj-head p{margin:0;color:var(--vp-c-text-2)}.pj-kicker{font-size:12px;letter-spacing:.12em;color:var(--vp-c-text-2)}.pj-local{white-space:nowrap;border:1px solid var(--vp-c-divider);border-radius:999px;padding:6px 10px;font-size:12px}.pj-tabs{display:flex;gap:8px;margin:22px 0}.pj-tabs button{border:1px solid var(--vp-c-divider);background:var(--vp-c-bg);padding:9px 14px;border-radius:999px;cursor:pointer;color:var(--vp-c-text-2)}.pj-tabs button.active{color:var(--vp-c-text-1);border-color:var(--vp-c-text-2);font-weight:600}.pj-notice{padding:11px 14px;border-radius:10px;background:var(--vp-c-bg);border-left:3px solid var(--vp-c-text-2);font-size:14px}.pj-notice.danger,.pj-redbox{border-left-color:#b42318}.pj-loading{padding:24px;text-align:center;color:var(--vp-c-text-2)}.pj-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pj-grid--small{margin-top:18px}.pj-form label,.pj-wide{display:flex;flex-direction:column;gap:6px;font-size:14px}.pj-form label>span{font-weight:600}.pj-form label small{color:var(--vp-c-text-2);font-weight:400}.pj-form input,.pj-form select,.pj-form textarea{width:100%;box-sizing:border-box;border:1px solid var(--vp-c-divider);border-radius:9px;background:var(--vp-c-bg);color:var(--vp-c-text-1);padding:10px 11px;font:inherit}.pj-wide{margin-top:14px}.pj-issues{margin:18px 0 0;padding:14px;border:1px solid var(--vp-c-divider);border-radius:12px}.pj-issues legend{padding:0 6px;font-weight:600}.pj-check{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:7px!important;margin:5px 16px 5px 0;font-weight:400!important}.pj-check input{width:auto!important}.pj-redbox{display:flex;flex-direction:column;gap:4px;margin:16px 0;padding:12px 14px;border-left:3px solid #b42318;background:var(--vp-c-bg);border-radius:8px}.pj-primary,.pj-secondary,.pj-danger{border-radius:9px;padding:10px 14px;cursor:pointer;font:inherit}.pj-primary{margin-top:18px;border:0;background:var(--vp-c-text-1);color:var(--vp-c-bg);font-weight:700}.pj-secondary{border:1px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-1)}.pj-danger{border:1px solid #b42318;background:transparent;color:#b42318}.pj-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.pj-stats div{padding:16px;border:1px solid var(--vp-c-divider);border-radius:12px;background:var(--vp-c-bg);display:flex;flex-direction:column}.pj-stats strong{font-size:26px}.pj-stats span{font-size:12px;color:var(--vp-c-text-2)}.pj-panel{margin-top:16px;padding:18px;border:1px solid var(--vp-c-divider);border-radius:12px;background:var(--vp-c-bg)}.pj-panel h3{margin:0 0 8px}.pj-panel p{margin:6px 0}.pj-panel small{color:var(--vp-c-text-2)}.pj-prompt{width:100%;box-sizing:border-box;margin:10px 0;border:1px solid var(--vp-c-divider);border-radius:9px;padding:11px;background:var(--vp-c-bg-soft);color:var(--vp-c-text-1);font:inherit;line-height:1.6}.pj-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}.pj-record{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--vp-c-divider)}.pj-record:first-of-type{border-top:0}.pj-record div{display:flex;flex-direction:column;gap:3px}.pj-record span,.pj-record small{color:var(--vp-c-text-2)}.pj-record button{align-self:flex-start;border:0;background:none;color:var(--vp-c-text-2);cursor:pointer}.pj-privacy{margin-top:16px;color:var(--vp-c-text-2)}
@media(max-width:720px){.practice-journal{padding:18px;margin:24px 0}.pj-head{flex-direction:column}.pj-grid{grid-template-columns:1fr}.pj-stats{grid-template-columns:repeat(2,1fr)}.pj-tabs{overflow:auto}.pj-tabs button{white-space:nowrap}.pj-record{flex-direction:column}}
</style>
