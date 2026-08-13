/**
 * theme/index.ts —— 自定义主题入口
 * 根布局由 Layout.vue 分发；少量跨 Markdown 页面复用的交互组件在此全局注册。
 */
import Layout from './Layout.vue'
import PracticeJournal from './components/PracticeJournal.vue'
import PracticeTrial from './components/PracticeTrial.vue'
import { installPracticeSafetyReduction } from './practice/practice-safety-reduction'
import './style.css'
import './styles/tokens.css'
import './styles/typography.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/ink-theme.css'
import './styles/fidelity.css'
import './styles/practice-reduction.css'

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('PracticeJournal', PracticeJournal)
    app.component('PracticeTrial', PracticeTrial)
    installPracticeSafetyReduction()
  }
}
