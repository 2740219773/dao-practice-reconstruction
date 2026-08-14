const STAGE_SELECTOR = '.practice-journal .pj-stage'

function panelByTitle(stage: HTMLElement, title: string) {
  return Array.from(stage.querySelectorAll<HTMLElement>(':scope > .pj-panel'))
    .find((panel) => panel.querySelector('h3')?.textContent?.trim() === title) || null
}

function createDetails(summaryText: string, className: string) {
  const details = document.createElement('details')
  details.className = `pj-stage-details ${className}`
  const summary = document.createElement('summary')
  summary.textContent = summaryText
  details.append(summary)
  return details
}

function renameStageTab() {
  const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    .find((button) => ['30天与阶段', '30天复盘'].some((text) => button.textContent?.includes(text)))
  if (tab && tab.textContent !== '30天复盘') tab.textContent = '30天复盘'
}

function parseSafetyCounts(stats: HTMLElement) {
  const text = stats.querySelector<HTMLElement>(':scope > div:last-child strong')?.textContent || ''
  const match = text.match(/(\d+)\s*\/\s*(\d+)/)
  return {
    yellow: match ? Number(match[1]) : 0,
    red: match ? Number(match[2]) : 0
  }
}

function createSafetyBanner(yellow: number, red: number) {
  if (!yellow && !red) return null
  const section = document.createElement('section')
  section.className = `pj-panel pj-stage-safety-banner ${red ? 'red' : 'yellow'}`
  section.dataset.stageKind = 'safety'

  const title = document.createElement('h3')
  title.textContent = '30天安全提醒'
  const body = document.createElement('p')
  body.textContent = red
    ? `最近30天记录中存在 ${red} 次红色事件。安全处理优先于任何长期建议；本页不会把其他记录解释为可以继续加量。`
    : `最近30天记录中存在 ${yellow} 次黄色事件。先按已记录分流进行暂停、回退或观察；长期建议不能覆盖这类安全记录。`
  section.append(title, body)
  return section
}

function enhanceStage(stage: HTMLElement) {
  if (stage.dataset.stageReduction === '1') return

  const stats = stage.querySelector<HTMLElement>(':scope > .pj-stats')
  const distribution = panelByTitle(stage, '最近30天分布')
  const capabilities = panelByTitle(stage, '四类基础能力 · 记录支持状态')
  const decision = stage.querySelector<HTMLElement>(':scope > .pj-decision')
  const ai = panelByTitle(stage, '给 AI 的30天阶段复盘材料')
  if (!stats || !distribution || !capabilities || !decision || !ai) return

  stage.dataset.stageReduction = '1'

  const guide = document.createElement('p')
  guide.className = 'pj-stage-guide'
  guide.textContent = '先看安全提醒和当前建议；30天统计、分布与观察维度只是记录依据，不是等级或晋级分。'
  stage.prepend(guide)

  const kicker = decision.querySelector<HTMLElement>('.pj-kicker')
  if (kicker) kicker.textContent = '当前建议'
  decision.dataset.stageKind = 'decision'

  const boundary = document.createElement('p')
  boundary.className = 'pj-stage-visible-boundary'
  boundary.textContent = '当前建议只基于本机自填记录，用于保持、回退、暂停或讨论分流；不是修炼境界、认证、完成度或自动解锁。'
  decision.append(boundary)

  const capabilityTitle = capabilities.querySelector<HTMLElement>('h3')
  if (capabilityTitle) capabilityTitle.textContent = '四类观察维度 · 记录支持状态'

  const counts = parseSafetyCounts(stats)
  const safety = createSafetyBanner(counts.yellow, counts.red)
  if (safety) stage.insertBefore(safety, decision)

  const evidenceDetails = createDetails('查看30天记录依据（不是等级）', 'pj-stage-evidence-details')
  stats.replaceWith(evidenceDetails)
  evidenceDetails.append(stats, distribution, capabilities)

  const aiDetails = createDetails('AI阶段复盘材料（可选）', 'pj-stage-ai-details')
  ai.replaceWith(aiDetails)
  aiDetails.append(ai)
}

function scan() {
  renameStageTab()
  document.querySelectorAll<HTMLElement>(STAGE_SELECTOR).forEach(enhanceStage)
}

export function installPracticeStageReduction() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (document.documentElement.dataset.practiceStageReduction === '1') return
  document.documentElement.dataset.practiceStageReduction = '1'

  const observer = new MutationObserver(scan)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  scan()
}
