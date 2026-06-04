# Content Script Selectors

Selectors used by each site's content script. Update here when sites redesign.

---

## LinkedIn (`linkedin.ts`)

URL pattern: `https://www.linkedin.com/jobs/*`

| Field       | Selector(s) |
|-------------|-------------|
| Role        | `.job-details-jobs-unified-top-card__job-title h1`, fallback: `h1.t-24` |
| Company     | `.job-details-jobs-unified-top-card__company-name a`, fallback: `.topcard__org-name-link`, `.data-test-job-card-company-name` |
| JD          | `.jobs-description__content .jobs-box__html-content`, fallback: `.jobs-description-content__text`, `[data-test-job-description]` |
| URL         | `window.location.href` |

Note: LinkedIn is a SPA. We attach a MutationObserver and re-extract 1.5 s after URL change.

---

## Lever (`lever.ts`)

URL pattern: `https://jobs.lever.co/*`

| Field       | Selector(s) |
|-------------|-------------|
| Role        | `.posting-headline h2` |
| Company     | `meta[property="og:site_name"]`, fallback: last segment of `document.title` |
| JD          | `.section-wrapper.page-full-width`, fallback: `.posting-description` |
| URL         | `window.location.href` |

---

## Greenhouse (`greenhouse.ts`)

URL patterns: `https://boards.greenhouse.io/*`, `https://job-boards.greenhouse.io/*`

| Field       | Selector(s) |
|-------------|-------------|
| Role        | `#header h1`, fallback: `.app-title` |
| Company     | `.company-name`, fallback: `meta[property="og:site_name"]` |
| JD          | `#content`, fallback: `.job-post` |
| URL         | `window.location.href` |
