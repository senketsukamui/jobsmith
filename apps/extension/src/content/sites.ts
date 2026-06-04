export interface JobData {
  company: string
  role: string
  jobDescription: string
  jobUrl: string
  source: 'linkedin' | 'lever' | 'greenhouse' | 'manual'
}

// Message key sent from content script to popup
export const JOB_DATA_MSG = 'JOB_TRACKER_JOB_DATA'

export function sendJobData(data: Partial<JobData>) {
  chrome.runtime.sendMessage({ type: JOB_DATA_MSG, data })
}

export function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? ''
}

export function attrOf(selector: string, attr: string, root: Document | Element = document): string {
  return (root.querySelector(selector) as HTMLElement | null)?.getAttribute(attr) ?? ''
}
