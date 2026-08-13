import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => readFileSync(path.join(root, p), 'utf8')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const model = read('docs/.vitepress/theme/practice/practice-model.mjs')
const reduction = read('docs/.vitepress/theme/styles/practice-reduction.css')
const themeIndex = read('docs/.vitepress/theme/index.ts')
const tests = read('tests/practice-form-fields.test.mjs')
const e2e = read('scripts/e2e-practice-reduction.mjs')

assert(model.includes("emotionState: 'not_observed'"), '新记录不得默认写入“情绪稳定”')
assert(model.includes("nextStep: 'not_decided'"), '新记录不得默认写入“下次继续”')
assert(model.includes("const EMOTION_STATES = new Set(['not_observed'"), '情绪字段缺少未记录语义')
assert(model.includes("const NEXT_STEPS = new Set(['not_decided'"), '下次决定缺少未决定语义')

assert(reduction.includes('.pj-today__meta > span:first-child'), '首屏减负未移除今日卡阶段方向')
assert(reduction.includes('option[value="stable"]'), '首屏减负未退出日常情绪字段')
assert(reduction.includes('option[value="continue"]'), '首屏减负未退出日常下次决定字段')
assert(themeIndex.includes("import './styles/practice-reduction.css'"), '主题入口未加载实践减负样式')

assert(tests.includes('新记录默认不虚构情绪状态或下次决定'), '自动测试未覆盖默认不推断字段')
assert(e2e.includes('阶段方向退出今日卡'), 'Chromium 未覆盖今日卡阶段方向减法')
assert(e2e.includes('情绪/下次决定退出日常表单'), 'Chromium 未覆盖低价值字段退出日常表单')
assert(e2e.includes("emotionState !== 'not_observed'"), 'Chromium 未校验保存后的情绪未记录值')
assert(e2e.includes("nextStep !== 'not_decided'"), 'Chromium 未校验保存后的下次未决定值')

console.log('[实践减负检查通过] 今日卡不展示阶段方向；情绪/下次决定不再默认推断，并有真实 Chromium 回归。')
