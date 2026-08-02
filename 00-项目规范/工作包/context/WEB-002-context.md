# WEB-002 上下文包

**用途：** 执行 WEB-002（文献页与概念页视觉统一）时只读本文件 + 范围卡，不重复读取整个仓库。

---

## 工作包定位

- 唯一目标：文献页、概念页展示模板升级到与原文页（WEB-001 样板）一致的书卷式视觉体系；
- 禁止：改知识卡正文、改首页、改原文页模板、新建研究卡、扩展其他专题页。

## 原文页样板（WEB-001 成果，本次通用化的基础）

- 结构：`wd-original-title`（H1 包装）→ `wd-original-header`（题签页眉：左侧 `wd-oh-seal` 竖排朱红印章显示 YAML 编号 + 右侧 `wd-oh-meta` 元信息行）→ statusBanner（警示框）→ tagRow（徽章行）→ `wd-meta-detail`（完整元信息折叠）→ 公开摘要 → 公开注意事项 → 正文区块；
- CSS 位于 style.css 的「WEB-001 原文样板页」节，移动端 640px 有适配。

## 本次改动（WEB-002）

1. 生成器：`originalHeader` → 通用化 `docHeader(card)`，按 slug 输出不同元信息字段：
   - originals：所属文献/章节/卷次/使用版本 + 页码/页码状态（保持 WEB-001 收尾约定）；
   - library：其他名称/传统署名/大致年代/文献类型/资料性质/使用版本；
   - concepts：概念类别/主要时期/涉及传统/当前定义状态；
2. renderDetail：所有类型统一用题签页眉 + `wd-meta-detail` 折叠（原 metaTable 平铺表格 → 折叠）；
3. CSS：新增 `wd-meta-detail` 折叠样式（虚线边框，与 `wd-stat-detail` 同体系）。

## 公开页现状（本次生成后）

- library：文献-0001（道德经）；
- concepts：概念-0001（静）；
- originals：原文-0001/0003/0004。

## 技术约束

- 生成页是构建产物（生成器写出），样式源头在 style.css 与生成脚本；
- 死链检查：未建库页面（/research/ 等）不能链接，否则 build 失败；
- 生成器幂等：重复运行不产生 git 差异；
- 验证方式：`node website/scripts/生成网站页面.mjs` → `npx vitepress build docs` → Chrome headless 截图（桌面 1440px / 移动 390px）。
