import { sendJobData, textOf } from './sites'

function extract(): void {
  // Greenhouse job board selectors
  // Selectors documented in sites.md
  const role = textOf(
    document.querySelector('#header h1') ??
    document.querySelector('.app-title')
  )

  // Company name from page header or og:site_name
  const metaTitle = document.querySelector('meta[property="og:site_name"]')
  const headerCompany = textOf(document.querySelector('.company-name'))
  const company =
    headerCompany ||
    (metaTitle as HTMLMetaElement | null)?.content ||
    ''

  const jdEl =
    document.querySelector('#content') ??
    document.querySelector('.job-post')
  const jobDescription = textOf(jdEl)

  if (role) {
    sendJobData({
      company,
      role,
      jobDescription,
      jobUrl: window.location.href,
      source: 'greenhouse',
    })
  }
}

extract()
