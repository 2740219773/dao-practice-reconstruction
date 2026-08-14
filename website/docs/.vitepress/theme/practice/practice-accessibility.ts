const JOURNAL_SELECTOR = '.practice-journal'

const TAB_CONFIG = [
  { tabId: 'practice-tab-record', panelId: 'practice-panel-record', selector: '.pj-form' },
  { tabId: 'practice-tab-review', panelId: 'practice-panel-review', selector: '.pj-review' },
  { tabId: 'practice-tab-stage', panelId: 'practice-panel-stage', selector: '.pj-stage' },
  { tabId: 'practice-tab-data', panelId: 'practice-panel-data', selector: '.pj-data' }
]

function syncTabs(journal: HTMLElement) {
  const tabs = Array.from(journal.querySelectorAll<HTMLElement>('.pj-tabs [role="tab"]'))
  TAB_CONFIG.forEach((config, index) => {
    const tab = tabs[index]
    if (!tab) return
    tab.id = config.tabId
    tab.setAttribute('aria-controls', config.panelId)

    const panel = journal.querySelector<HTMLElement>(config.selector)
    if (!panel) return
    panel.id = config.panelId
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', config.tabId)
  })
}

function syncLiveRegions(journal: HTMLElement) {
  const notice = journal.querySelector<HTMLElement>('.pj-notice')
  if (notice) {
    const urgent = notice.textContent?.includes('红色') || notice.classList.contains('danger')
    notice.setAttribute('role', urgent ? 'alert' : 'status')
    notice.setAttribute('aria-live', urgent ? 'assertive' : 'polite')
  }

  journal.querySelectorAll<HTMLElement>('.pj-redbox').forEach((box) => {
    box.setAttribute('role', 'alert')
    box.setAttribute('aria-live', 'assertive')
  })
}

function focusRecordDate(journal: HTMLElement) {
  const input = journal.querySelector<HTMLInputElement>('.pj-form input[type="date"]')
  if (!input) return false
  input.focus({ preventScroll: true })
  return document.activeElement === input
}

function installActionFocus(journal: HTMLElement) {
  if (journal.dataset.a11yActionFocus === '1') return
  journal.dataset.a11yActionFocus = '1'

  journal.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null
    if (!target || !target.closest('.pj-today__actions')) return
    const text = target.textContent?.trim() || ''
    if (!['开始今日记录', '继续上次并记录', '今天决定不练'].some((label) => text.includes(label))) return

    let attempts = 0
    const tryFocus = () => {
      attempts += 1
      if (focusRecordDate(journal) || attempts >= 8) return
      requestAnimationFrame(tryFocus)
    }
    requestAnimationFrame(tryFocus)
  })
}

function enhanceJournal(journal: HTMLElement) {
  syncTabs(journal)
  syncLiveRegions(journal)
  installActionFocus(journal)
}

function scan() {
  document.querySelectorAll<HTMLElement>(JOURNAL_SELECTOR).forEach(enhanceJournal)
}

export function installPracticeAccessibility() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (document.documentElement.dataset.practiceAccessibility === '1') return
  document.documentElement.dataset.practiceAccessibility = '1'

  const observer = new MutationObserver(scan)
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  scan()
}
