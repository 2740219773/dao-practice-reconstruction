# 当前聚焦工作包

当前工作包：WEB-003
工作包名称：统一 library/concepts 索引页样式
当前状态：进行中

唯一目标：
把文献库、原文库、概念库三个索引页升级为与详情页一致的书卷式视觉体系：题签式标题区 + 卡片式条目列表（编号印章、标题、状态标签），保留文献库按 L1—L4 分组。不改动研究内容。

允许修改：
- website/scripts/生成网站页面.mjs（renderIndex 索引页模板）
- website/docs/.vitepress/theme/style.css（索引页样式）
- 00-项目规范/工作包/WEB-003-统一索引页样式.md
- 00-项目规范/工作包/context/WEB-003-context.md

只读参考：
- website/docs/library|concepts|originals/index.md（现状）
- 详情页书卷式体系（WEB-001/002 成果：wd-oh-seal/wd-oh-meta）
- 02-文献卡/文献-0001、04-概念卡/概念-0001（卡片字段）

禁止修改：
- 所有知识卡正文（02—09）
- 证据等级、文献解释、研究结论、风险字段
- 首页（index.md）、详情页模板（docHeader 等，本次不动）
- 新建现代研究卡、核对古籍原文

旁支问题：
只登记到工作包「旁支问题」节，不在本轮处理。
