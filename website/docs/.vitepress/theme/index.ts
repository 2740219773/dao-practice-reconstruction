/**
 * theme/index.ts —— 自定义主题入口（方案 14.1）
 * 不再导出 DefaultTheme：由 Layout.vue 根据页面 layout 分发到 5 种布局。
 */
import Layout from './Layout.vue'
import './style.css'
import './styles/tokens.css'
import './styles/typography.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/ink-theme.css'

export default {
  Layout,
  enhanceApp({ app }) {
    // 预留：全局组件注册（如需要）
  }
}
