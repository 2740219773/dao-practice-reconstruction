import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => readFileSync(path.join(root, p), 'utf8')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const model = read('docs/.vitepress/theme/practice/practice-model.mjs')
const reduction = read('docs/.vitepress/theme/styles/practice-reduction.css')
const safetyReduction = read('docs/.vitepress/theme/practice/practice-safety-reduction.ts')
const themeIndex = read('docs/.vitepress/theme/index.ts')
const tests = read('tests/practice-form-fields.test.mjs')
const e2e = read('scripts/e2e-practice-reduction.mjs')
const safetyE2E = read('scripts/e2e-practice-safety-reduction.mjs')
const packageJson = JSON.parse(read('package.json'))

assert(model.includes("emotionState: 'not_observed'"), '新记录不得默认写入“情绪稳定”')
assert(model.includes("nextStep: 'not_decided'"), '新记录不得默认写入“下次继续”')
assert(model.includes("const EMOTION_STATES = new Set(['not_observed'"), '情绪字段缺少未记录语义')
assert(model.includes("const NEXT_STEPS = new Set(['not_decided'"), '下次决定缺少未决定语义')
assert(model.includes('issues: skipped ? []'), '不练记录必须清理本次练习异常')
assert(model.includes("severity: skipped ? 'none'"), '不练记录必须清理安全分流')
assert(model.includes("nextStep: skipped ? 'not_decided'"), '不练记录不得残留下次决定')

assert(reduction.includes('.pj-today__meta > span:first-child'), '首屏减负未移除今日卡阶段方向')
assert(reduction.includes('option[value="stable"]'), '首屏减负未退出日常情绪字段')
assert(reduction.includes('option[value="continue"]'), '首屏减负未退出日常下次决定字段')
assert(reduction.includes('.pj-form:not(.pj-safety-expanded) .pj-issues'), '正常记录未折叠异常列表')
assert(reduction.includes('.pj-form:not(.pj-safety-expanded) .pj-grid--small'), '正常记录未折叠安全分流')
assert(reduction.includes('.pj-safety-skipped .pj-redbox'), '不练记录仍可能显示练习红色事件提示')
assert(themeIndex.includes("import './styles/practice-reduction.css'"), '主题入口未加载实践减负样式')
assert(themeIndex.includes('installPracticeSafetyReduction'), '主题入口未启用异常安全渐进展开')

assert(safetyReduction.includes('异常与安全（没有则跳过）'), '异常安全入口缺少正常态极简文案')
assert(safetyReduction.includes('需要安全核对 · 已展开'), '异常安全入口缺少提醒态文案')
assert(safetyReduction.includes('const needsAttention ='), '异常安全层缺少统一需要关注判断')
assert(safetyReduction.includes('setExpanded(button, form, true)'), '需要关注时不能自动展开异常区')
assert(safetyReduction.includes('setButtonText'), '渐进展开同步必须保持幂等，避免 MutationObserver 文案循环')
assert(!/severity\.value\s*=\s*['\"](?:yellow|red)/.test(safetyReduction), '渐进展开层不得自动替用户判定黄色或红色')

assert(tests.includes('新记录默认不虚构情绪状态或下次决定'), '自动测试未覆盖默认不推断字段')
assert(tests.includes('清理练习观察、异常和后续决定'), '自动测试未覆盖不练记录异常清理')
assert(e2e.includes('阶段方向退出今日卡'), 'Chromium 未覆盖今日卡阶段方向减法')
assert(e2e.includes('情绪/下次决定退出日常表单'), 'Chromium 未覆盖低价值字段退出日常表单')
assert(e2e.includes("emotionState !== 'not_observed'"), 'Chromium 未校验保存后的情绪未记录值')
assert(e2e.includes("nextStep !== 'not_decided'"), 'Chromium 未校验保存后的下次未决定值')
assert(safetyE2E.includes('正常安全区折叠'), 'Chromium 未覆盖正常状态安全区折叠')
assert(safetyE2E.includes('草稿安全提醒未自动展开'), 'Chromium 未覆盖异常提醒自动展开')
assert(safetyE2E.includes('不练记录仍携带练习异常或后续决定'), 'Chromium 未覆盖不练记录异常清理')
assert(String(packageJson.scripts?.['test:e2e:daily'] || '').includes('e2e-practice-safety-reduction.mjs'), '每日 E2E 尚未纳入异常安全减负回归')

console.log('[实践减负检查通过] 日常入口不显示阶段方向；低价值字段不默认推断；异常与安全正常折叠、需要时展开，不练记录不携带练习异常。')
