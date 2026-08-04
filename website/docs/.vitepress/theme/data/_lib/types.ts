/**
 * types.ts —— 数据层公共类型定义
 * 对应设计方案 13.2 统一前置字段与 C 节 data loader 输出 schema
 */

/** 正式知识层类型（slug） */
export type KnowledgeType =
  | 'library' | 'originals' | 'concepts' | 'claims' | 'hypotheses'
  | 'disputes' | 'research' | 'risks' | 'contemporary' | 'daoyin' | 'medical-observations'

/** 发布状态（决策-0004 五种取值） */
export type PublishStatus = '不公开' | '内部预览' | '可公开草稿' | '正式公开' | '已撤回'

/** 原始卡片（读取层） */
export interface RawCard {
  dir: string
  slug: string
  label: string
  layer: 'knowledge' | 'entry' | 'observation' | 'governance'
  file: string
  relPath: string
  yaml: Record<string, any>
  body: string
  slugOf: string
}

/** 知识条目（展示层，knowledge.data.ts 输出） */
export interface KnowledgeItem {
  id: string               // 编号，如 文献-0001
  type: KnowledgeType
  slug: string             // 页面名，如 文献-0001-道德经
  title: string
  url: string              // /knowledge/文献-0001-道德经
  summary: string          // 公开摘要
  notice: string           // 公开注意事项
  status: PublishStatus
  evidenceLevel?: string   // 文献可靠等级 T2
  riskLevel?: string       // 风险等级 S0 / 所含实践最高风险
  tags: Record<string, string>  // 徽章用元信息（当前状态/证据/风险/知识层级等）
  meta: Record<string, string>  // 完整元信息（折叠展示）
  relPath: string
  lastModified: string     // YYYY-MM-DD
  bodyPreview: string      // 正文章节摘要（搜索/索引用）
  related: {
    concepts: string[]; originals: string[]; claims: string[];
    disputes: string[]; research: string[]; risks: string[]
  }
}

/** 专题（topics.data.ts 输出） */
export interface Topic {
  id: string               // TOPIC-001
  name: string             // 静
  module: string
  stage: string
  coreQuestions: { id: string; question: string }[]
  coreIds: {
    原文: string[]; 概念: string[]; 主张: string[]; 争议: string[];
    研究: string[]; 风险: string[]
  }
  narrative: {
    what: string       // 一、这个概念是什么
    notWhat: string    // 二、它不是什么
    confirm: string    // 三、当前可以确认什么
    unknown: string    // 四、当前不能确认什么
    disputes: string   // 五、主要争议
    safety: string     // 六、安全边界（摘要版）
  }
  url: string            // /topics/jing
}

/** 问题（questions.data.ts 输出） */
export interface Question {
  id: string
  title: string          // 问题文本
  group: string          // 问题分类（实际数据：概念理解/修持实践/现代生活应用）
  briefAnswer: string    // 简要回答
  background?: string    // 问题与背景
  supports: string[]     // 答案依据（原文/概念编号）
  opposes: string[]      // 反方材料（辨析卡编号）
  unresolved: string[]   // 暂时不能确认
  relatedTopics: string[] // 关联专题
  level: string          // 综合答案依据等级：甲级/乙级
  status: PublishStatus
  url: string            // /question-map/what-is-jing
}

/** 问题分组（问题地图首页） */
export interface QuestionGroup {
  key: string
  label: string
  desc: string
  questions: Question[]
}

/** 搜索索引条目（search-index.data.ts 输出） */
export interface SearchEntry {
  id: string
  title: string
  type: string           // 知识类型中文标签或「问题」「专题」
  url: string
  keywords: string
  snippet: string
}
