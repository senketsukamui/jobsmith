import { sendJobData, textOf } from './sites'

function extract(): void {
  // Lever job board selectors
  // Selectors documented in sites.md
  const role = textOf(document.querySelector('.posting-headline h2'))

  // Company name is part of the page title or meta
  const metaTitle = document.querySelector('meta[property="og:site_name"]')
  const company =
    (metaTitle as HTMLMetaElement | null)?.content ??
    document.title.split(' - ').pop()?.trim() ??
    ''

  const jdEl =
    document.querySelector('.section-wrapper.page-full-width') ??
    document.querySelector('.posting-description')
  const jobDescription = textOf(jdEl)

  if (role) {
    sendJobData({
      company,
      role,
      jobDescription,
      jobUrl: window.location.href,
      source: 'lever',
    })
  }
}

extract()
