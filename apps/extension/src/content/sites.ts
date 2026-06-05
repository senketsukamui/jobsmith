export interface JobData {
  company: string
  role: string
  pageMarkdown: string
  jobUrl: string
  source: 'linkedin' | 'lever' | 'greenhouse' | 'manual' | 'other'
}

export const MSG_EXTRACT = 'JT_EXTRACT'
export const MSG_JOB_DATA = 'JT_JOB_DATA'
