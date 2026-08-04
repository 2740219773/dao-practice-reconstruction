/**
 * 常量.ts —— 展示层共享常量（data loader 之外的独立文件，
 * 因为 VitePress data loader 只导出 data，其他命名导出会被剥离）
 */

/** 类型显示标签 */
export const TYPE_LABELS: Record<string, string> = {
  library: '文献', originals: '原文', concepts: '概念', claims: '主张',
  hypotheses: '假说', disputes: '争议', research: '现代研究',
  risks: '风险资料', contemporary: '当代传播', daoyin: '导引术',
  'medical-observations': '医学观察'
}

/** 首页三个高价值问题（方案 7.3） */
export const HOMEPAGE_QUESTION_IDS = ['问题-0001', '问题-0002', '问题-0010']

/** 问题 id → 站点 URL slug */
export const QUESTION_SLUGS: Record<string, string> = {
  '问题-0001': 'what-is-jing',
  '问题-0002': 'jing-and-no-thought',
  '问题-0004': 'daodejing-sitting',
  '问题-0003': 'keeping-still-method-or-state',
  '问题-0006': 'heart-still-qi-order',
  '问题-0005': 'xinzhai-zuowang',
  '问题-0007': 'jing-vs-meditation',
  '问题-0008': 'suppressing-thoughts',
  '问题-0009': 'body-sensations-in-sitting',
  '问题-0010': 'science-and-tradition'
}
