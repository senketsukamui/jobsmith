import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { MSG_EXTRACT } from './sites'
import type { JobData } from './sites'

function detectSource(hostname: string): JobData['source'] {
  if (hostname.includes('linkedin.com')) return 'linkedin'
  if (hostname.includes('lever.co')) return 'lever'
  if (hostname.includes('greenhouse.io')) return 'greenhouse'
  return 'other'
}

function guessFromTitle(title: string): { role: string; company: string } {
  // Common patterns: "Job Title at Company | Site" or "Job Title - Company"
  const atMatch = title.match(/^(.+?)\s+at\s+(.+?)(?:\s*[|\-–]|$)/)
  if (atMatch) {
    return { role: atMatch[1].trim(), company: atMatch[2].trim() }
  }
  const dashMatch = title.match(/^(.+?)\s*[-–]\s*(.+?)(?:\s*[|]|$)/)
  if (dashMatch) {
    return { role: dashMatch[1].trim(), company: dashMatch[2].trim() }
  }
  return { role: title.split(/[|\-–]/)[0].trim(), company: '' }
}

function clipPage(): JobData {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  })

  const docClone = document.cloneNode(true) as Document
  const article = new Readability(docClone).parse()

  let pageMarkdown: string
  if (article?.content) {
    const header = article.title ? `# ${article.title}\n\n` : ''
    pageMarkdown = header + td.turndown(article.content)
  } else {
    pageMarkdown = td.turndown(document.body.innerHTML)
  }

  const { role, company } = guessFromTitle(document.title)
  const source = detectSource(window.location.hostname)

  return { company, role, pageMarkdown, jobUrl: window.location.href, source }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== MSG_EXTRACT) return false
  try {
    sendResponse(clipPage())
  } catch (err) {
    sendResponse({ company: '', role: '', pageMarkdown: '', jobUrl: window.location.href, source: 'other' } satisfies JobData)
    console.error('[JobTracker clipper]', err)
  }
  return false
})
