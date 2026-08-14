const REVIEW_SELECTOR = '.practice-journal .pj-review'

function panelByTitle(review: HTMLElement, title: string) {
  return Array.from(review.querySelectorAll<HTMLElement>(':scope > .pj-panel'))
    .find((panel) => panel.querySelector('h3')?.textContent?.trim() === title) || null
}

function createDetails(summaryText: string, className: string) {
  const details = document.createElement('details')
  details.className = `pj-review-details ${className}`
  const summary = document.createElement('summary')
  summary.textContent = summaryText
  details.append(summary)
  return details
}

function enhanceReview(review: HTMLElement) {
  if (review.dataset.reviewReduction === '1') return

  const stats = review.querySelector<HTMLElement>(':scope > .pj-stats')
  const rules = panelByTitle(review, '规则型复盘')
  const issues = panelByTitle(review, '重复问题')
  const ai = panelByTitle(review, '给 AI 的7天复盘材料')
  if (!stats || !rules || !issues || !ai) return

  // 先标记，避免下面的 DOM 调整被 MutationObserver 重复处理。
  review.dataset.reviewReduction = '1'

  const guide = document.createElement('p')
  guide.className = 'pj-review-guide'
  guide.textContent = '先看规则提醒和重复问题；数字明细与 AI 材料只在需要时展开。'
  review.prepend(guide)

  rules.dataset.reviewKind = 'rules'
  issues.dataset.reviewKind = 'issues'
  ai.dataset.reviewKind = 'ai'

  if (issues.textContent?.includes('最近7天暂无已记录问题')) {
    issues.classList.add('pj-review-empty-issues')
  }

  const statsDetails = createDetails('查看7天数据细节', 'pj-review-stats-details')
  stats.replaceWith(statsDetails)
  statsDetails.append(stats)

  const aiDetails = createDetails('AI复盘材料（可选）', 'pj-review-ai-details')
  ai.replaceWith(aiDetails)
  aiDetails.append(ai)
}

function scan() {
  document.querySelectorAll<HTMLElement>(REVIEW_SELECTOR).forEach(enhanceReview)
}

export function installPracticeReviewReduction() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (document.documentElement.dataset.practiceReviewReduction === '1') return
  document.documentElement.dataset.practiceReviewReduction = '1'

  const observer = new MutationObserver(scan)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  scan()
}
