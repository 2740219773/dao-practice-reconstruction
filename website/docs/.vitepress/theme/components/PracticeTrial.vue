<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  TRIAL_SCHEMA_VERSION,
  TRIAL_STORAGE_KEY,
  buildTrialSummary,
  parseTrialStorage,
  upsertTrialEntry
} from '../practice/practice-trial.mjs'

const entries = ref([])
const notice = ref('')
const storageBlocked = ref(false)

function localDateString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const form = reactive({
  date: localDateString(),
  usedWorkbench: true,
  duration: 'under_1m',
  entry: 'today',
  unclearField: false,
  unclearFieldName: '',
  lowValueField: false,
  lowValueFieldName: '',
  pressureFeeling: false,
  note: ''
})

const summary = computed(() => buildTrialSummary(entries.value))

const entryLabels = {
  today: '今日修持',
  card: '实践卡反向入口',
  direct: '直接记录',
  skip: '今天不练'
}

const durationLabels = {
  under_1m: '<1分钟',
  '1_to_2m': '1—2分钟',
  over_2m: '>2分钟',
  not_saved: '未保存修持记录'
}

function persist() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TRIAL_STORAGE_KEY, JSON.stringify({ schemaVersion: TRIAL_SCHEMA_VERSION, entries: entries.value }))
    storageBlocked.value = false
  } catch {
    storageBlocked.value = true
    notice.value = '浏览器未允许本地保存。当前观察没有上传，但刷新后可能丢失。'
  }
}

function load() {
  if (typeof window === 'undefined') return
  let raw = ''
  try {
    raw = localStorage.getItem(TRIAL_STORAGE_KEY) || ''
  } catch {
    storageBlocked.value = true
    notice.value = '无法读取本地试运行观察；不会覆盖现有浏览器数据。'
    return
  }
  const parsed = parseTrialStorage(raw)
  if (!parsed.ok) {
    storageBlocked.value = true
    notice.value = parsed.reason === 'future_version'
      ? '发现更新版本的试运行观察数据。当前版本不会降级覆盖它。'
      : '试运行观察数据无法安全读取；当前版本不会把它当成空数据覆盖。'
    return
  }
  entries.value = parsed.data.entries
  const today = entries.value.find((item) => item.date === form.date)
  if (today) Object.assign(form, today)
}

function save() {
  entries.value = upsertTrialEntry(entries.value, form)
  persist()
  notice.value = `已保存 ${form.date} 的产品观察。它不进入修持记录，也不参与阶段判断。`
}

function clearAll() {
  if (typeof window === 'undefined') return
  if (!window.confirm('清空全部7天试运行产品观察？此操作不可撤销，但不会删除修持记录。')) return
  entries.value = []
  try { localStorage.removeItem(TRIAL_STORAGE_KEY) } catch {}
  notice.value = '已清空产品观察；修持记录未受影响。'
}

onMounted(load)
</script>

<template>
  <section class="pt" aria-labelledby="practice-trial-title">
    <details class="pt__details">
      <summary>
        <span>
          <b id="practice-trial-title">7天产品观察</b>
          <small>可选 · 约20秒 · 只记录系统是否好用</small>
        </span>
        <span class="pt__local">仅本地保存</span>
      </summary>

      <div class="pt__body">
        <p class="pt__intro">不记录修持体验，不进入实践 schema，也不参与 7/30 天阶段判断。若今天没用工作台，只需留下原因或一句备注。</p>

        <form class="pt__form" @submit.prevent="save">
          <label><span>日期</span><input v-model="form.date" type="date" required /></label>
          <label><span>今天是否使用实践工作台</span><select v-model="form.usedWorkbench"><option :value="true">是</option><option :value="false">否</option></select></label>

          <template v-if="form.usedWorkbench">
            <label><span>总体操作耗时</span><select v-model="form.duration"><option v-for="(label,key) in durationLabels" :key="key" :value="key">{{ label }}</option></select></label>
            <label><span>主要入口</span><select v-model="form.entry"><option v-for="(label,key) in entryLabels" :key="key" :value="key">{{ label }}</option></select></label>

            <label class="pt__check"><input v-model="form.unclearField" type="checkbox" /><span>有字段不知道怎么选</span></label>
            <label v-if="form.unclearField"><span>哪个字段</span><input v-model="form.unclearFieldName" maxlength="80" placeholder="例如：开始前状态" /></label>

            <label class="pt__check"><input v-model="form.lowValueField" type="checkbox" /><span>有字段感觉没有信息价值</span></label>
            <label v-if="form.lowValueField"><span>哪个字段</span><input v-model="form.lowValueFieldName" maxlength="80" placeholder="例如：某项几乎每天都一样" /></label>
          </template>

          <label class="pt__check"><input v-model="form.pressureFeeling" type="checkbox" /><span>有“系统在催我升级或打卡”的感觉</span></label>
          <label class="pt__wide"><span>一句话产品备注</span><textarea v-model="form.note" maxlength="240" rows="2" :placeholder="form.usedWorkbench ? '例如：记录很快，但阶段文案像等级。' : '例如：今天没打开工作台，因为入口太深。'"></textarea></label>

          <div class="pt__actions">
            <button type="submit">保存产品观察</button>
            <button type="button" class="pt__ghost" @click="clearAll">清空产品观察</button>
          </div>
        </form>

        <p v-if="notice" class="pt__notice" aria-live="polite">{{ notice }}</p>
        <p v-if="storageBlocked" class="pt__warning">本地数据当前无法安全读写；不要反复提交，以免误以为已经保存。</p>

        <div class="pt__summary" v-if="summary.observationCount">
          <h4>当前试运行摘要</h4>
          <div class="pt__stats">
            <span><b>{{ summary.observationCount }}</b> 条观察</span>
            <span><b>{{ summary.workbenchDays }}</b> 天使用工作台</span>
            <span><b>{{ summary.unusedDays }}</b> 天未使用</span>
            <span><b>{{ summary.unclearCount }}</b> 次字段难选</span>
            <span><b>{{ summary.lowValueCount }}</b> 次低价值字段</span>
            <span><b>{{ summary.pressureCount }}</b> 次被催促感</span>
          </div>
          <p v-if="summary.mostUsedEntry">最常用入口：{{ entryLabels[summary.mostUsedEntry] }}。</p>
          <p>这些数字只用于第7天做产品减法，不代表练习频率、完成度或修炼进展。</p>
        </div>
      </div>
    </details>
  </section>
</template>

<style scoped>
.pt { margin: 22px 0 32px; }
.pt__details { border: 1px solid var(--vp-c-divider); border-radius: 14px; background: var(--vp-c-bg-soft); overflow: hidden; }
.pt__details > summary { list-style: none; cursor: pointer; display: flex; gap: 18px; align-items: center; justify-content: space-between; padding: 16px 18px; }
.pt__details > summary::-webkit-details-marker { display: none; }
.pt__details > summary span:first-child { display: grid; gap: 3px; }
.pt__details > summary b { font-size: 16px; }
.pt__details > summary small { color: var(--vp-c-text-2); font-size: 12px; font-weight: 400; }
.pt__details[open] > summary { border-bottom: 1px solid var(--vp-c-divider); }
.pt__body { padding: 18px; }
.pt__intro { margin: 0 0 16px; color: var(--vp-c-text-2); line-height: 1.7; }
.pt__local { white-space: nowrap; font-size: 12px; color: var(--vp-c-text-2); border: 1px solid var(--vp-c-divider); border-radius: 999px; padding: 5px 9px; }
.pt__form { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
.pt__form label { display: grid; gap: 6px; font-size: 14px; }
.pt__form label > span { color: var(--vp-c-text-2); }
.pt__form input, .pt__form select, .pt__form textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 9px 10px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: inherit; }
.pt__check { display: flex !important; align-items: center; gap: 8px !important; align-self: end; padding: 8px 0; }
.pt__check input { width: auto; }
.pt__wide, .pt__actions, .pt__summary, .pt__notice, .pt__warning { grid-column: 1 / -1; }
.pt__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.pt__actions button { border: 1px solid var(--vp-c-text-1); border-radius: 8px; padding: 9px 14px; background: var(--vp-c-text-1); color: var(--vp-c-bg); cursor: pointer; }
.pt__actions .pt__ghost { background: transparent; color: var(--vp-c-text-1); border-color: var(--vp-c-divider); }
.pt__notice { margin: 14px 0 0; color: var(--vp-c-text-2); }
.pt__warning { margin: 10px 0 0; padding: 10px 12px; border-left: 3px solid currentColor; }
.pt__summary { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--vp-c-divider); }
.pt__summary h4 { margin: 0 0 10px; }
.pt__summary p { margin: 8px 0 0; color: var(--vp-c-text-2); }
.pt__stats { display: flex; gap: 10px; flex-wrap: wrap; }
.pt__stats span { padding: 7px 10px; border: 1px solid var(--vp-c-divider); border-radius: 8px; }
.pt__stats b { font-size: 18px; margin-right: 3px; }
@media (max-width: 720px) { .pt__details > summary { align-items: flex-start; } .pt__local { margin-top: 1px; } .pt__body { padding: 16px; } .pt__form { grid-template-columns: 1fr; } .pt__wide, .pt__actions { grid-column: auto; } }
</style>
