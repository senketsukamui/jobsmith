import { sendJobData, textOf } from './sites'

function extract(): void {
  // LinkedIn job page selectors (as of 2025)
  // Selectors documented in sites.md
  const role = textOf(
    document.querySelector('.job-details-jobs-unified-top-card__job-title h1') ??
    document.querySelector('h1.t-24')
  )

  const company = textOf(
    document.querySelector('.job-details-jobs-unified-top-card__company-name a') ??
    document.querySelector('.topcard__org-name-link') ??
    document.querySelector('[data-test-job-card-company-name]')
  )

  const jdEl =
    document.querySelector('.jobs-description__content .jobs-box__html-content') ??
    document.querySelector('.jobs-description-content__text') ??
    document.querySelector('[data-test-job-description]')
  const jobDescription = textOf(jdEl)

  if (role || company) {
    sendJobData({
      company,
      role,
      jobDescription,
      jobUrl: window.location.href,
      source: 'linkedin',
    })
  }
}

// LinkedIn is an SPA — extract on navigation events too
extract()

let lastUrl = window.location.href
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href
    setTimeout(extract, 1500)
  }
})
observer.observe(document.body, { childList: true, subtree: true })
