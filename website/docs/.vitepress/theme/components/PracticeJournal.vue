<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  STORAGE_KEY,
  SCHEMA_VERSION,
  PRACTICES as practices,
  ISSUE_OPTIONS as issueOptions,
  ISSUE_LABELS as issueLabels,
  PRACTICE_LABELS as practiceLabels,
  createEmptyRecord,
  createStoredRecord,
  exportPayload,
  mergeImportPayload,
  normalizeRecord
} from '../practice/practice-model.mjs'
import { parseAndMigrateStored, PRACTICE_MIGRATIONS } from '../practice/practice-migrations.mjs'
import { aggregateRecent } from '../practice/practice-stats.mjs'
import { buildSafetyReview, reviewDraftSafety } from '../practice/practice-safety.mjs'
import { buildAiPrompt, buildReviewSummary, buildStageAiPrompt, buildStageReviewSummary } from '../practice/practice-ai.mjs'
import { buildStageReview, stageCapabilityRows } from '../practice/practice-stage.mjs'

const ready = ref(false)
const tab = ref('record')
const records = ref([])
const form = ref(createEmptyRecord())
const notice = ref('')
const fileInput = ref(null)

const selectedPractice = computed(() => practices.find((p) => p.id === form.value.practiceId) || practices[0])
const stats = computed(() => aggregateRecent(records.value, { now: new Date(), days: 7 }))
const safetyReview = computed(() => buildSafetyReview(stats.value, { periodLabel: '最近7天' }))
const ruleAdvice = computed(() => safetyReview.value.primary)
const reviewSummary = computed(() => buildReviewSummary(stats.value, safetyReview.value, new Date()))
const aiPrompt = computed(() => buildAiPrompt(reviewSummary.value))
const draftSafetyNotes = computed(() => reviewDraftSafety(form.value))

const stageReview = computed(() => buildStageReview(records.value, { now: new Date() }))
const stageRows = computed(() => stageCapabilityRows(stageReview.value))
const stageSummary = computed(() => buildStageReviewSummary(stageReview.value, new Date()))
const stageAiPrompt = computed(() => buildStageAiPrompt(stageSummary.value))

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, records: records.value }))
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const loaded = parseAndMigrateStored(raw, {
      currentVersion: SCHEMA_VERSION,
      normalizeRecord,
      migrations: PRACTICE_MIGRATIONS
    })
    if (!loaded.ok) {
      notice.value = loaded.error || '本地记录版本无法读取。原数据没有被自动覆盖。'
      ready.value = true
      return
    }
    records.value = loaded.records
    if (loaded.migrated) {
      notice.value = `本地记录已从 schema v${loaded.sourceVersion} 迁移到 v${loaded.targetVersion}。迁移前数据未被自动删除。`
    } else if (loaded.rejected) {
      notice.value = `已读取本地记录，其中 ${loaded.rejected} 条记录未通过当前数据校验；原始存储没有被自动覆盖。`
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
  const result = createStoredRecord(form.value, { id: newId(), createdAt: new Date().toISOString() })
  if (!result.ok) {
    notice.value = result.error
    return
  }

  records.value.unshift(result.record)
  persist()
  form.value = createEmptyRecord()

  if (result.record.severity === 'red') {
    notice.value = '记录已保存在本机。你标记了红色事件：请停止相关实践，并优先查看安全边界，不继续加练。'
  } else if (result.overLimit) {
    notice.value = `已按实际保存。本次 ${result.record.durationMinutes} 分钟超过该卡当前审查上限 ${result.reviewedMax} 分钟；这是事实记录，不代表下一次应该继续超时。`
  } else {
    notice.value = '已保存到当前浏览器。本记录不会自动上传。'
  }
}

function toggleIssue(id) {
  const set = new Set(form.value.issues)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  form.value.issues = [...set]
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text)
    notice.value = successMessage
  } catch {
    notice.value = '浏览器未允许自动复制，请手动选择下方文本复制。'
  }
}

function copyAiPrompt() {
  return copyText(aiPrompt.value, '7天 AI 复盘材料已复制。只有你主动粘贴/提交时，记录摘要才会离开本页面。')
}

function copyStageAiPrompt() {
  return copyText(stageAiPrompt.value, '30天阶段复盘材料已复制。它只包含统计与规则判断，不会自动发送原始长备注。')
}

function exportData() {
  const payload = exportPayload(records.value, new Date().toISOString())
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wendaozhi-practice-records-${form.value.date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerImport() {
  fileInput.value?.click()
}

async function importData(event) {
  const input = event.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const parsed = JSON.parse(await file.text())
    const result = mergeImportPayload(records.value, parsed)
    if (!result.ok) throw new Error(result.error)
    records.value = result.records
    persist()
    const migrationText = result.migrated ? `，已从 schema v${result.sourceVersion} 迁移到 v${result.targetVersion}` : ''
    notice.value = `已导入 ${result.accepted} 条可识别记录${result.rejected ? `，拒绝 ${result.rejected} 条未知或非法记录` : ''}${migrationText}；同 ID 记录已合并。`
  } catch (error) {
    notice.value = `导入失败：${error?.message || '文件不是受支持的问道志记录格式'}。`
  }
}

function removeRecord(id) {
  records.value = records.value.filter((record) => record.id !== id)
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
        <span class="pj-kicker">PRACTICE-003 · 本地长期复盘</span>
        <h2>记录 · 复盘 · 阶段判断</h2>
        <p>数据默认只保存在当前浏览器，不自动上传；7天看近期问题，30天看趋势和阶段状态，不计算“修为分”。</p>
      </div>
      <span class="pj-local">本地优先</span>
    </header>

    <nav class="pj-tabs" aria-label="记录工具分页">
      <button :class="{ active: tab === 'record' }" @click="tab = 'record'">每日记录</button>
      <button :class="{ active: tab === 'review' }" @click="tab = 'review'">最近7天</button>
      <button :class="{ active: tab === 'stage' }" @click="tab = 'stage'">30天与阶段</button>
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

      <div v-if="draftSafetyNotes.length" class="pj-draft-notes">
        <p v-for="(item, index) in draftSafetyNotes" :key="index" :class="{ red: item.level === 'red' }">{{ item.text }}</p>
      </div>

      <label class="pj-wide"><span>做了什么调整</span><input v-model.trim="form.adjustment" maxlength="160" placeholder="例如：缩短到2分钟、改回脚底接触、换普通椅子" /></label>
      <label class="pj-wide"><span>事实记录</span><textarea v-model.trim="form.note" maxlength="600" rows="3" placeholder="只写实际发生了什么。主观热、麻、流动感可以记录，但不要在这里自动写成经络或境界结论。"></textarea></label>

      <div v-if="form.severity === 'red'" class="pj-redbox"><strong>红色事件优先于练习进度。</strong><span>保存记录后请停止相关实践并查看安全边界；本工具不会推荐下一种练法。</span></div>
      <button class="pj-primary" type="submit">保存到本机</button>
    </form>

    <div v-else-if="tab === 'review'" class="pj-review">
      <div class="pj-stats">
        <div><strong>{{ stats.recordCount }}</strong><span>近7天记录</span></div>
        <div><strong>{{ stats.actualPracticeCount }}</strong><span>实际练习</span></div>
        <div><strong>{{ stats.skippedCount }}</strong><span>主动不练</span></div>
        <div><strong>{{ stats.totalMinutes }}</strong><span>实际分钟</span></div>
        <div><strong>{{ stats.overLimitCount }}</strong><span>超审查上限</span></div>
        <div><strong>{{ stats.yellowCount }} / {{ stats.redCount }}</strong><span>黄色 / 红色</span></div>
      </div>
      <section class="pj-panel"><h3>规则型复盘</h3><p>{{ ruleAdvice }}</p><ul v-if="safetyReview.flags.length > 1" class="pj-flags"><li v-for="flag in safetyReview.flags.slice(1)" :key="flag.code">{{ flag.text }}</li></ul><small>这是依据明确规则生成的提醒，不是医学判断或传统境界判断。</small></section>
      <section class="pj-panel"><h3>重复问题</h3><p v-if="!stats.issueCounts.length">最近7天暂无已记录问题。</p><ul v-else><li v-for="([id, count]) in stats.issueCounts" :key="id">{{ issueLabels[id] || id }}：{{ count }} 次</li></ul></section>
      <section class="pj-panel"><h3>给 AI 的7天复盘材料</h3><p>这里只在浏览器中整理统计摘要，不会自动发送，也不会把个人长备注自动带入摘要。</p><textarea class="pj-prompt" :value="aiPrompt" rows="17" readonly></textarea><button class="pj-secondary" type="button" @click="copyAiPrompt">复制7天复盘材料</button></section>
    </div>

    <div v-else-if="tab === 'stage'" class="pj-stage">
      <div class="pj-stats">
        <div><strong>{{ stageReview.stats.recordCount }}</strong><span>近30天记录</span></div>
        <div><strong>{{ stageReview.stats.actualPracticeCount }}</strong><span>实际练习</span></div>
        <div><strong>{{ stageReview.stats.skippedCount }}</strong><span>主动不练</span></div>
        <div><strong>{{ stageReview.stats.totalMinutes }}</strong><span>实际分钟</span></div>
        <div><strong>{{ stageReview.stats.overLimitCount }}</strong><span>超审查上限</span></div>
        <div><strong>{{ stageReview.stats.yellowCount }} / {{ stageReview.stats.redCount }}</strong><span>黄色 / 红色</span></div>
      </div>

      <section class="pj-panel">
        <h3>最近30天分布</h3>
        <div class="pj-days" aria-label="最近30天记录分布">
          <span v-for="day in stageReview.distribution" :key="day.date" class="pj-day" :class="[day.status, day.severity]" :title="`${day.date} · ${day.status === 'practiced' ? '有实际练习' : day.status === 'skipped' ? '主动决定不练' : '无记录'}${day.severity !== 'none' ? ` · ${day.severity === 'red' ? '红色事件' : '黄色事件'}` : ''}`"></span>
        </div>
        <div class="pj-legend"><span><i class="practiced"></i>实际练习</span><span><i class="skipped"></i>主动不练</span><span><i class="no-record"></i>无记录</span><span><i class="yellow"></i>黄色事件</span><span><i class="red"></i>红色事件</span></div>
        <small>“无记录”只表示本机没有当天日志，不能推断当天一定没有练习。</small>
      </section>

      <section class="pj-panel">
        <h3>四类基础能力 · 记录支持状态</h3>
        <div class="pj-capabilities">
          <article v-for="([name, item]) in stageRows" :key="name" class="pj-capability" :class="item.code">
            <div><strong>{{ name }}</strong><span>{{ item.label }}</span></div>
            <p>{{ item.note }}</p>
            <small>相关有效记录：{{ item.evidence }} 次</small>
          </article>
        </div>
        <p class="pj-boundary">{{ stageReview.evidenceNotice }}</p>
      </section>

      <section class="pj-panel pj-decision" :class="stageReview.decision.code">
        <span class="pj-kicker">阶段方向</span>
        <h3>{{ stageReview.decision.label }}</h3>
        <p>{{ stageReview.decision.reason }}</p>
        <p v-if="stageReview.decision.code === 'discuss_diversion'" class="pj-boundary"><strong>这不是自动晋级。</strong> 后续只进入“静修深化 / 导引深化 / 生活养修 / 丹道研究”的人工讨论；丹道仍默认仅研究。</p>
        <p v-if="stageReview.decision.code === 'pause_for_safety'" class="pj-boundary"><a href="/safety/">优先查看安全边界 →</a></p>
      </section>

      <section class="pj-panel"><h3>给 AI 的30天阶段复盘材料</h3><p>同样只整理统计与规则结果，不自动发送原始长备注；AI不得把阶段方向改写成境界、认证或自动解锁。</p><textarea class="pj-prompt" :value="stageAiPrompt" rows="20" readonly></textarea><button class="pj-secondary" type="button" @click="copyStageAiPrompt">复制30天阶段复盘材料</button></section>
    </div>

    <div v-else class="pj-data">
      <section class="pj-panel"><h3>本地数据</h3><p>当前浏览器共有 <strong>{{ records.length }}</strong> 条记录。默认没有账号、没有云同步、没有自动上传。</p><div class="pj-actions"><button class="pj-secondary" type="button" @click="exportData">导出 JSON</button><button class="pj-secondary" type="button" @click="triggerImport">导入 JSON</button><button class="pj-danger" type="button" @click="clearAll">清空本机记录</button><input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importData" /></div></section>
      <section class="pj-panel"><h3>最近记录</h3><p v-if="!records.length">还没有本地记录。</p><div v-for="r in records.slice(0, 10)" :key="r.id" class="pj-record"><div><strong>{{ r.date }} · {{ practiceLabels[r.practiceId] || r.practiceId }}</strong><span>{{ r.startState === 'skipped' ? '主动决定不练' : `${r.durationMinutes} 分钟` }} · {{ r.severity === 'red' ? '红色事件' : r.severity === 'yellow' ? '黄色事件' : '无升级事件' }}</span><small v-if="r.note">{{ r.note }}</small></div><button type="button" @click="removeRecord(r.id)">删除</button></div></section>
      <details class="pj-privacy"><summary>隐私与数据边界</summary><p>实践记录可能包含身体、情绪和生活信息。当前版本只使用浏览器本地存储；清理浏览器数据可能导致记录丢失，重要记录请自行导出。若以后增加云同步，会另行设计权限、删除和隐私规则。</p></details>
    </div>
  </section>
</template>

<style scoped>
.practice-journal{margin:36px 0;padding:24px;border:1px solid var(--vp-c-divider);border-radius:18px;background:var(--vp-c-bg-soft);box-shadow:0 14px 40px rgba(0,0,0,.04)}
.pj-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.pj-head h2{margin:4px 0 8px;font-size:26px}.pj-head p{margin:0;color:var(--vp-c-text-2)}.pj-kicker{font-size:12px;letter-spacing:.12em;color:var(--vp-c-text-2)}.pj-local{white-space:nowrap;border:1px solid var(--vp-c-divider);border-radius:999px;padding:6px 10px;font-size:12px}.pj-tabs{display:flex;gap:8px;margin:22px 0}.pj-tabs button{border:1px solid var(--vp-c-divider);background:var(--vp-c-bg);padding:9px 14px;border-radius:999px;cursor:pointer;color:var(--vp-c-text-2)}.pj-tabs button.active{color:var(--vp-c-text-1);border-color:var(--vp-c-text-2);font-weight:600}.pj-notice{padding:11px 14px;border-radius:10px;background:var(--vp-c-bg);border-left:3px solid var(--vp-c-text-2);font-size:14px}.pj-notice.danger,.pj-redbox{border-left-color:#b42318}.pj-loading{padding:24px;text-align:center;color:var(--vp-c-text-2)}.pj-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pj-grid--small{margin-top:18px}.pj-form label,.pj-wide{display:flex;flex-direction:column;gap:6px;font-size:14px}.pj-form label>span{font-weight:600}.pj-form label small{color:var(--vp-c-text-2);font-weight:400}.pj-form input,.pj-form select,.pj-form textarea{width:100%;box-sizing:border-box;border:1px solid var(--vp-c-divider);border-radius:9px;background:var(--vp-c-bg);color:var(--vp-c-text-1);padding:10px 11px;font:inherit}.pj-wide{margin-top:14px}.pj-issues{margin:18px 0 0;padding:14px;border:1px solid var(--vp-c-divider);border-radius:12px}.pj-issues legend{padding:0 6px;font-weight:600}.pj-check{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:7px!important;margin:5px 16px 5px 0;font-weight:400!important}.pj-check input{width:auto!important}.pj-draft-notes{margin:14px 0 0}.pj-draft-notes p{margin:7px 0;padding:10px 12px;border-left:3px solid #b7791f;background:var(--vp-c-bg);border-radius:8px;font-size:13px}.pj-draft-notes p.red{border-left-color:#b42318}.pj-redbox{display:flex;flex-direction:column;gap:4px;margin:16px 0;padding:12px 14px;border-left:3px solid #b42318;background:var(--vp-c-bg);border-radius:8px}.pj-primary,.pj-secondary,.pj-danger{border-radius:9px;padding:10px 14px;cursor:pointer;font:inherit}.pj-primary{margin-top:18px;border:0;background:var(--vp-c-text-1);color:var(--vp-c-bg);font-weight:700}.pj-secondary{border:1px solid var(--vp-c-divider);background:var(--vp-c-bg);color:var(--vp-c-text-1)}.pj-danger{border:1px solid #b42318;background:transparent;color:#b42318}.pj-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pj-stats div{padding:16px;border:1px solid var(--vp-c-divider);border-radius:12px;background:var(--vp-c-bg);display:flex;flex-direction:column}.pj-stats strong{font-size:26px}.pj-stats span{font-size:12px;color:var(--vp-c-text-2)}.pj-panel{margin-top:16px;padding:18px;border:1px solid var(--vp-c-divider);border-radius:12px;background:var(--vp-c-bg)}.pj-panel h3{margin:0 0 8px}.pj-panel p{margin:6px 0}.pj-panel small{color:var(--vp-c-text-2)}.pj-flags{padding-left:20px;color:var(--vp-c-text-2)}.pj-prompt{width:100%;box-sizing:border-box;margin:10px 0;border:1px solid var(--vp-c-divider);border-radius:9px;padding:11px;background:var(--vp-c-bg-soft);color:var(--vp-c-text-1);font:inherit;line-height:1.6}.pj-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}.pj-record{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--vp-c-divider)}.pj-record:first-of-type{border-top:0}.pj-record div{display:flex;flex-direction:column;gap:3px}.pj-record span,.pj-record small{color:var(--vp-c-text-2)}.pj-record button{align-self:flex-start;border:0;background:none;color:var(--vp-c-text-2);cursor:pointer}.pj-privacy{margin-top:16px;color:var(--vp-c-text-2)}
.pj-days{display:grid;grid-template-columns:repeat(15,1fr);gap:6px;margin:14px 0}.pj-day{aspect-ratio:1;border-radius:4px;border:1px solid var(--vp-c-divider);background:var(--vp-c-bg-soft)}.pj-day.practiced{background:color-mix(in srgb,var(--vp-c-text-1) 50%,var(--vp-c-bg))}.pj-day.skipped{background:color-mix(in srgb,var(--vp-c-text-2) 24%,var(--vp-c-bg))}.pj-day.yellow{outline:2px solid #b7791f;outline-offset:1px}.pj-day.red{outline:2px solid #b42318;outline-offset:1px}.pj-legend{display:flex;flex-wrap:wrap;gap:10px 16px;margin:10px 0;font-size:12px;color:var(--vp-c-text-2)}.pj-legend span{display:inline-flex;align-items:center;gap:6px}.pj-legend i{display:inline-block;width:12px;height:12px;border:1px solid var(--vp-c-divider);border-radius:3px;background:var(--vp-c-bg-soft)}.pj-legend i.practiced{background:color-mix(in srgb,var(--vp-c-text-1) 50%,var(--vp-c-bg))}.pj-legend i.skipped{background:color-mix(in srgb,var(--vp-c-text-2) 24%,var(--vp-c-bg))}.pj-legend i.yellow{border:2px solid #b7791f}.pj-legend i.red{border:2px solid #b42318}.pj-capabilities{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.pj-capability{padding:14px;border:1px solid var(--vp-c-divider);border-radius:11px;background:var(--vp-c-bg-soft)}.pj-capability>div{display:flex;justify-content:space-between;gap:12px}.pj-capability>div span{font-size:12px;color:var(--vp-c-text-2)}.pj-capability p{font-size:13px;color:var(--vp-c-text-2)}.pj-capability.unstable,.pj-capability.paused{border-left:3px solid #b42318}.pj-capability.partial,.pj-capability.insufficient{border-left:3px solid #b7791f}.pj-capability.stable{border-left:3px solid var(--vp-c-text-2)}.pj-boundary{margin-top:14px!important;padding:10px 12px;border-left:3px solid var(--vp-c-divider);background:var(--vp-c-bg-soft);font-size:13px;color:var(--vp-c-text-2)}.pj-decision{border-left:4px solid var(--vp-c-text-2)}.pj-decision.pause_for_safety,.pj-decision.step_back_or_pause{border-left-color:#b42318}.pj-decision.return_reviewed_load{border-left-color:#b7791f}.pj-decision.discuss_diversion{border-left-color:var(--vp-c-text-1)}
@media(max-width:720px){.practice-journal{padding:18px;margin:24px 0}.pj-head{flex-direction:column}.pj-grid{grid-template-columns:1fr}.pj-stats{grid-template-columns:repeat(2,1fr)}.pj-tabs{overflow:auto}.pj-tabs button{white-space:nowrap}.pj-record{flex-direction:column}.pj-days{grid-template-columns:repeat(10,1fr)}.pj-capabilities{grid-template-columns:1fr}.pj-capability>div{flex-direction:column;gap:3px}}
</style>
