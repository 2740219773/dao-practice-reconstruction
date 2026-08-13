const FORM_SELECTOR = '.practice-journal .pj-form'

function findSelectByOption(form: HTMLFormElement, value: string) {
  return Array.from(form.querySelectorAll('select')).find((select) => select.querySelector(`option[value="${value}"]`)) || null
}

function setButtonText(button: HTMLButtonElement, text: string) {
  if (button.textContent !== text) button.textContent = text
}

function setExpanded(button: HTMLButtonElement, form: HTMLFormElement, expanded: boolean) {
  form.classList.toggle('pj-safety-expanded', expanded)
  const value = String(expanded)
  if (button.getAttribute('aria-expanded') !== value) button.setAttribute('aria-expanded', value)
}

function ensureToggle(form: HTMLFormElement) {
  let button = form.querySelector<HTMLButtonElement>(':scope > .pj-safety-toggle')
  if (button) return button

  const issues = form.querySelector('.pj-issues')
  if (!issues) return null

  button = document.createElement('button')
  button.type = 'button'
  button.className = 'pj-safety-toggle'
  button.setAttribute('aria-expanded', 'false')
  button.textContent = '异常与安全（没有则跳过）'
  button.addEventListener('click', () => {
    const expanded = !form.classList.contains('pj-safety-expanded')
    setExpanded(button as HTMLButtonElement, form, expanded)
    setButtonText(button as HTMLButtonElement, expanded ? '异常与安全 · 已展开' : '异常与安全（没有则跳过）')
  })
  issues.before(button)
  return button
}

function syncForm(form: HTMLFormElement) {
  const button = ensureToggle(form)
  if (!button) return

  const startState = findSelectByOption(form, 'skipped')
  const severity = findSelectByOption(form, 'red')
  const skipped = startState?.value === 'skipped'
  const hasIssue = Boolean(form.querySelector('.pj-issues input:checked'))
  const hasDraftWarning = Boolean(form.querySelector('.pj-draft-notes'))
  const hasSeverity = Boolean(severity && severity.value !== 'none')
  const hasObservationConcern = Array.from(form.querySelectorAll('select')).some((select) =>
    ['clearly_controlled', 'affected', 'stopped'].includes(select.value)
  )
  const needsAttention = hasIssue || hasDraftWarning || hasSeverity || hasObservationConcern

  form.classList.toggle('pj-safety-skipped', skipped)
  button.hidden = skipped

  if (skipped) {
    setExpanded(button, form, false)
    setButtonText(button, '异常与安全（没有则跳过）')
    return
  }

  if (needsAttention) {
    setExpanded(button, form, true)
    setButtonText(button, '需要安全核对 · 已展开')
    return
  }

  const expanded = form.classList.contains('pj-safety-expanded')
  if (button.getAttribute('aria-expanded') !== String(expanded)) button.setAttribute('aria-expanded', String(expanded))
  setButtonText(button, expanded ? '异常与安全 · 已展开' : '异常与安全（没有则跳过）')
}

function scan() {
  document.querySelectorAll<HTMLFormElement>(FORM_SELECTOR).forEach(syncForm)
}

export function installPracticeSafetyReduction() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (document.documentElement.dataset.practiceSafetyReduction === '1') return
  document.documentElement.dataset.practiceSafetyReduction = '1'

  const observer = new MutationObserver(scan)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  document.addEventListener('change', (event) => {
    const target = event.target as Element | null
    const form = target?.closest?.(FORM_SELECTOR) as HTMLFormElement | null
    if (form) queueMicrotask(() => syncForm(form))
  })

  scan()
}
