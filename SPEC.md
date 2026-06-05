# Job Application Tracker — Development Spec (v1)

A local-first desktop app for tracking job applications, scanning Gmail for status updates, and generating AI-written cover letters via a locally hosted Ollama model. Companion Chrome extension for one-click application capture from LinkedIn, Lever, and Greenhouse.

**Target user (v1):** the author, on a MacBook M3 Pro. Architecture choices keep a future public release on GitHub viable without major rewrites.

---

## 1. Tech stack & architecture

### 1.1 Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** (v32+) | Required by your spec; mature; native notifications + Keychain access. |
| UI framework | **React 18 + TypeScript + Vite** | Hot reload, type safety, ecosystem. |
| Styling | **Tailwind CSS + shadcn/ui** | Minimalist look out of the box, table/dialog primitives already built. |
| State (client) | **Zustand** for UI state, **TanStack Query** for server state | Avoids Redux boilerplate. TanStack Query handles cache + refetch for the IPC/HTTP layer cleanly. |
| Local DB | **libSQL** (via `@libsql/client`) | SQLite-compatible, drop-in. Supports **embedded replicas** that sync to a remote libSQL/Turso server — gives you painless cloud sync later without changing query code. |
| ORM | **Drizzle ORM** | Type-safe, lightweight, native libSQL support, migration tooling. |
| Local HTTP API | **Fastify** | Faster + better DX than Express, schema validation via JSON Schema or Zod. |
| Email | **`googleapis`** (Gmail API only for v1) | OAuth 2.0, well documented. |
| LLM | **Ollama** via the `ollama` npm package | You already chose it. |
| PDF/DOCX text extraction | **`pdf-parse`** + **`mammoth`** | Strip text from uploaded CVs for LLM context. |
| Scheduler | **`node-cron`** | Cron expression for the 30-min scan. |
| Secrets storage | **Electron `safeStorage`** (Keychain on macOS) | Encrypts OAuth refresh tokens, extension pairing token. |
| Packaging | **`electron-builder`** | macOS DMG, code signing later when going public. |
| Auto-update | **`electron-updater`** (deferred to v1.1) | Skip until public. |
| Chrome extension | **Manifest V3**, vanilla TS + Vite | No React needed — UI is a popup with ~5 fields. |

### 1.2 Recommended Ollama model

For M3 Pro (assuming 18–36GB unified memory), recommend **`qwen2.5:7b-instruct`** as the default. Reasons:

- Strong instruction-following for cover letter generation and email classification
- Q4_K_M quant runs comfortably in ~5GB RAM on Apple Silicon
- Better at structured output (JSON for email classification) than Llama 3.1 8B in my experience
- Alternative: `llama3.1:8b-instruct-q4_K_M` if you prefer Meta's tuning

Make the model **configurable in settings** with sensible default. App should:
- Check `ollama list` on startup and warn if the configured model isn't pulled
- Show a "Pull model" button that runs `ollama pull <model>` from the UI
- Hard-require Ollama running for AI features only — the rest of the app works without it

### 1.3 High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       ELECTRON APP                              │
│                                                                  │
│  ┌────────────────────────────┐  ┌─────────────────────────┐   │
│  │   Renderer (React UI)      │  │   Main process          │   │
│  │                            │  │                         │   │
│  │  - Applications table      │◄─┤  - libSQL connection    │   │
│  │  - Status board view       │ipc│  - Drizzle queries     │   │
│  │  - Cover letter editor     │  │  - Fastify HTTP server  │   │
│  │  - Settings                │  │    (127.0.0.1:random)   │   │
│  │                            │  │  - node-cron scheduler  │   │
│  └────────────────────────────┘  │  - Gmail client         │   │
│                                  │  - Ollama client        │   │
│                                  │  - Notification API     │   │
│                                  └──────────┬──────────────┘   │
└────────────────────────────────────────────┼───────────────────┘
                                             │ HTTP (localhost)
                                             │ Bearer token auth
                                  ┌──────────▼──────────────┐
                                  │   Chrome extension      │
                                  │   (Manifest V3)         │
                                  │   - Content scripts:    │
                                  │     LinkedIn / Lever /  │
                                  │     Greenhouse          │
                                  │   - Popup UI            │
                                  └─────────────────────────┘
```

### 1.4 Why this is sync-ready

libSQL's **embedded replica** mode means the app reads/writes to a local SQLite file, and the client syncs deltas to a remote libSQL server (you can self-host or use Turso's free tier). Switching from "local only" to "synced" later is essentially: provision a remote DB, change the connection URL, no schema/query changes. This is the strongest reason to pick it over `better-sqlite3` for your case.

For v1, run libSQL in **local-file mode only** (`file:./data.db`). Add a `sync_url` and `auth_token` field to settings; when set, the client uses embedded replica mode. Document this as a "Sync (experimental)" toggle.

### 1.5 Project structure

```
jobsmith/
├── apps/
│   ├── desktop/                  # Electron app
│   │   ├── electron/
│   │   │   ├── main.ts           # Main process entry
│   │   │   ├── preload.ts        # IPC bridge
│   │   │   ├── server/           # Fastify routes
│   │   │   ├── db/               # Drizzle schema + migrations
│   │   │   ├── services/         # Gmail, Ollama, scheduler
│   │   │   └── ipc/              # Typed IPC handlers
│   │   └── src/                  # React renderer
│   │       ├── routes/
│   │       ├── components/
│   │       ├── stores/
│   │       └── lib/
│   └── extension/                # Chrome extension
│       ├── manifest.json
│       ├── src/
│       │   ├── popup/
│       │   ├── content/          # LinkedIn / Lever / Greenhouse scrapers
│       │   └── background/
│       └── vite.config.ts
└── packages/
    └── shared/                   # Shared TS types + Zod schemas
```

Monorepo with **pnpm workspaces** — the extension and desktop share TypeScript types for the HTTP payloads via `packages/shared`.

---

## 2. Data models & schema

Using Drizzle ORM syntax. All tables get `id` as `text` (UUIDv7 — sortable, sync-friendly) and `created_at` / `updated_at` as integer Unix ms.

### 2.1 `companies`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv7 |
| `name` | text NOT NULL | |
| `website` | text | |
| `careers_url` | text | |
| `notes` | text | Markdown allowed |
| `created_at` | integer NOT NULL | |
| `updated_at` | integer NOT NULL | |

Unique index on `lower(name)` to dedupe ("Stripe" vs "stripe").

### 2.2 `applications`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv7 |
| `company_id` | text FK → companies.id | ON DELETE CASCADE |
| `role_title` | text NOT NULL | |
| `job_description` | text | Full JD pasted/scraped from listing |
| `job_url` | text | |
| `source` | text | enum: `linkedin` \| `lever` \| `greenhouse` \| `manual` \| `other` |
| `cv_id` | text FK → cvs.id | Which CV was sent. Nullable. |
| `current_status_id` | text FK → statuses.id | |
| `applied_at` | integer | Defaults to created_at |
| `last_activity_at` | integer | Updated on any status change or email match. Powers stale-detection. |
| `archived` | integer (0/1) | Hide from default view |
| `created_at` | integer NOT NULL | |
| `updated_at` | integer NOT NULL | |

Indexes: `company_id`, `current_status_id`, `last_activity_at DESC`.

### 2.3 `statuses` (customizable)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv7 |
| `name` | text NOT NULL UNIQUE | "Applied", "HR Interview", etc. |
| `display_order` | integer NOT NULL | For UI sort |
| `color` | text | Hex; UI badge color |
| `is_terminal` | integer (0/1) | True for Rejected / Offer / Ghosted — stops follow-up reminders |
| `is_default_new` | integer (0/1) | The status assigned to a brand-new application; exactly one row should have this set to 1 |
| `created_at` | integer NOT NULL | |

**Seed data on first run:**

```
Applied         (default_new=1, order=0, color=#94a3b8)
Acknowledged    (order=1, color=#60a5fa)
HR Interview    (order=2, color=#a78bfa)
Tech Interview  (order=3, color=#f59e0b)
Offer           (order=4, color=#22c55e, terminal=1)
Rejected        (order=5, color=#ef4444, terminal=1)
Ghosted         (order=6, color=#6b7280, terminal=1)
```

### 2.4 `application_status_history`

Append-only log. Useful for analytics later and undo.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv7 |
| `application_id` | text FK | ON DELETE CASCADE |
| `status_id` | text FK | ON DELETE RESTRICT |
| `changed_at` | integer NOT NULL | |
| `source` | text | enum: `manual` \| `email` \| `extension` \| `system` |
| `note` | text | Optional, e.g. "Detected from email subject..." |

### 2.5 `cvs`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv7 |
| `name` | text NOT NULL | User-facing label, e.g. "Frontend 2025" |
| `file_path` | text NOT NULL | Relative to `app.getPath('userData')/cvs/` |
| `original_filename` | text | |
| `mime_type` | text | `application/pdf` or DOCX |
| `extracted_text` | text | Stripped plain text for LLM context |
| `is_default` | integer (0/1) | One CV flagged default |
| `created_at` | integer NOT NULL | |
| `updated_at` | integer NOT NULL | |

### 2.6 `cover_letters`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv7 |
| `application_id` | text FK | ON DELETE CASCADE |
| `cv_id` | text FK | The CV used as context |
| `custom_instructions` | text | User's extra prompt ("be casual", "mention I love their blog post about X") |
| `generated_content` | text NOT NULL | Final letter |
| `model_used` | text NOT NULL | e.g. "qwen2.5:7b-instruct" |
| `generation_time_ms` | integer | Latency tracking |
| `is_edited` | integer (0/1) | Set true if user manually changed `generated_content` |
| `created_at` | integer NOT NULL | |
| `updated_at` | integer NOT NULL | |

### 2.7 `emails` (parsed candidates)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv7 |
| `gmail_message_id` | text NOT NULL UNIQUE | Dedupe key |
| `gmail_thread_id` | text | For threading replies |
| `subject` | text | |
| `from_address` | text | |
| `from_name` | text | |
| `received_at` | integer | |
| `body_snippet` | text | First ~500 chars stored locally; full body fetched on demand |
| `classification` | text | enum: `acknowledgment` \| `rejection` \| `interview_invite` \| `offer` \| `follow_up_request` \| `unrelated` \| `unclear` |
| `confidence` | real | 0.0–1.0 from LLM |
| `suggested_status_id` | text FK | What the LLM thinks the new status should be |
| `linked_application_id` | text FK | Nullable — set when matched to an application |
| `linked_company_id` | text FK | Nullable |
| `user_action` | text | enum: `pending` \| `accepted` \| `dismissed` |
| `raw_llm_output` | text | Full JSON from classifier for debugging |
| `processed_at` | integer NOT NULL | |

Indexes: `linked_application_id`, `user_action`, `received_at DESC`.

### 2.8 `settings` (key-value)

| Column | Type | Notes |
|---|---|---|
| `key` | text PK | |
| `value` | text NOT NULL | JSON-serialized |
| `updated_at` | integer NOT NULL | |

Keys used: `ollama_host`, `ollama_model`, `scan_interval_minutes`, `follow_up_days`, `extension_pairing_token` (hashed), `gmail_connected`, `sync_url`, `sync_auth_token` (encrypted via safeStorage), `notification_enabled`.

---

## 3. API design

Two surfaces:

1. **Internal IPC** — between React renderer and Electron main. Use a single typed wrapper (e.g. `tRPC` over `electron-trpc`) so the renderer calls feel like async function calls with full type inference. Strongly recommend tRPC here — it eliminates a whole class of stringly-typed IPC bugs.
2. **Local HTTP API** — for the Chrome extension. Fastify on `127.0.0.1:<random-port>` chosen at startup, port written to a discovery file so the extension can find it.

### 3.1 Local HTTP API

**Base URL:** `http://127.0.0.1:<port>`
**Auth:** `Authorization: Bearer <token>` header. Token is generated on first run, stored hashed in DB, plain copy shown in Settings → "Pair extension". Extension stores token in `chrome.storage.local`.
**CORS:** Allow `chrome-extension://<your-extension-id>` only.
**Content-Type:** `application/json`.

#### Discovery

The Electron app writes a JSON file to a well-known location on launch:

- macOS: `~/Library/Application Support/jobsmith/server.json`
- Linux: `~/.config/jobsmith/server.json`

```json
{ "port": 53741, "version": "0.1.0" }
```

The extension reads it via the `nativeMessaging` API or falls back to a port-scan range (53700–53800). Recommend nativeMessaging — cleaner.

#### Endpoints

```
GET    /api/health                          → { status, version }

# Applications
GET    /api/applications?status=&q=         → Application[]
POST   /api/applications                    → Application                (used by extension)
GET    /api/applications/:id                → Application
PATCH  /api/applications/:id                → Application
DELETE /api/applications/:id                → 204

POST   /api/applications/:id/status         → { history_entry }
       body: { status_id, note?, source }
GET    /api/applications/:id/history        → StatusHistory[]

# Companies
GET    /api/companies?q=                    → Company[]
POST   /api/companies                       → Company
PATCH  /api/companies/:id                   → Company

# Statuses
GET    /api/statuses                        → Status[]
POST   /api/statuses                        → Status
PATCH  /api/statuses/:id                    → Status
DELETE /api/statuses/:id                    → 204

# CVs
GET    /api/cvs                             → Cv[]                       (without extracted_text)
POST   /api/cvs                             → Cv                         (multipart upload)
DELETE /api/cvs/:id                         → 204
POST   /api/cvs/:id/default                 → Cv

# Cover letters
POST   /api/cover-letters/generate          → { id, content }            (streamed; SSE)
       body: { application_id, cv_id, custom_instructions? }
GET    /api/cover-letters/:id               → CoverLetter
PATCH  /api/cover-letters/:id               → CoverLetter                (manual edit)

# Email scanning
POST   /api/gmail/oauth/start               → { auth_url }               (opens system browser)
POST   /api/gmail/oauth/callback            → { connected: true }        (handled by deep link)
POST   /api/gmail/disconnect                → 204
POST   /api/emails/scan                     → { scanned, new_matches }   (trigger now)
GET    /api/emails?action=pending           → ParsedEmail[]
POST   /api/emails/:id/accept               → { application }            (apply suggestion)
POST   /api/emails/:id/dismiss              → 204

# Settings
GET    /api/settings                        → Settings
PATCH  /api/settings                        → Settings
POST   /api/settings/pairing-token/rotate   → { token }
```

#### Key payload examples

**`POST /api/applications`** (used by the extension):

```json
{
  "company": { "name": "Stripe", "website": "https://stripe.com" },
  "role_title": "Senior Frontend Engineer",
  "job_description": "Full JD text…",
  "job_url": "https://stripe.com/jobs/listing/123",
  "source": "greenhouse",
  "cv_id": null,
  "applied_at": 1734567890000
}
```

If `company.name` matches an existing record (case-insensitive), reuse it; otherwise create. Return the full `Application` object with the resolved `company_id` and assigned default `current_status_id`.

**`POST /api/cover-letters/generate`** returns a server-sent event stream so the UI can show tokens as Ollama produces them:

```
event: token
data: {"chunk":"Dear hiring "}

event: token
data: {"chunk":"team,\n\n"}

event: done
data: {"id":"01HMW…","generation_time_ms":4231}
```

### 3.2 IPC API (renderer ↔ main)

Same shape as HTTP but via tRPC procedures. The Fastify routes are thin wrappers that call the same underlying service layer:

```
applications.list({ status, query })
applications.create(input)
applications.get(id)
applications.update(id, patch)
applications.delete(id)
applications.changeStatus({ id, statusId, note })
applications.history(id)

// …same shape for companies, statuses, cvs, etc.

coverLetters.generate(input)        // returns AsyncIterable<string>
emails.scanNow()
emails.pending()
emails.accept(id)
gmail.connect()
gmail.disconnect()
settings.get()
settings.update(patch)
```

### 3.3 LLM prompts

Two distinct prompts. Store them as `.md` files in `electron/services/llm/prompts/` so they're easy to iterate on.

**Email classification prompt** (called per candidate email):

```
You are an assistant that classifies emails related to job applications.
Given the email below, output ONLY valid JSON matching this schema:
{
  "classification": "acknowledgment" | "rejection" | "interview_invite" | "offer" | "follow_up_request" | "unrelated" | "unclear",
  "confidence": <0.0–1.0>,
  "company_guess": "<company name or empty>",
  "role_guess": "<role title or empty>",
  "reasoning": "<one sentence>"
}

EMAIL:
From: {from_name} <{from_address}>
Subject: {subject}
Date: {received_at}

{body_truncated_to_2000_chars}
```

Use Ollama's `format: "json"` option to force structured output.

**Cover letter prompt:**

```
You are helping the user write a cover letter for a job application.

Their CV (for context):
{cv_extracted_text}

The job they're applying to:
Company: {company_name}
Role: {role_title}
Job description:
{job_description}

User's custom instructions:
{custom_instructions}

Write a cover letter that:
- Is 250–350 words
- Highlights 2–3 specific experiences from the CV that map directly to the job description
- Uses a confident but warm tone unless instructed otherwise
- Avoids clichés ("I am writing to apply…", "I am a passionate…")
- Does NOT fabricate experience not in the CV
- Returns only the letter body, no subject line, no markdown
```

---

## 4. Feature list & user stories

Organized by area. **MUST** = v1 must ship with it. **SHOULD** = v1 should have it. **LATER** = post-v1.

### 4.1 Application tracking (the core)

**US-1 (MUST)** — As the user, I can see all my applications in a sortable, filterable table.

> AC: Columns are Company, Role, Status (colored badge), Source, Applied date, Last activity. Sort by any column. Filter by status (multi-select), source, archived state. Free-text search across company name and role.

**US-2 (MUST)** — I can manually add a new application.

> AC: "+ New application" button opens a form with: Company (autocomplete from existing or create new), Role, JD (textarea), URL, Source dropdown, CV (dropdown of my CVs + "None"), Applied date (defaults to today). Save creates the app with the `is_default_new` status.

**US-3 (MUST)** — I can change an application's status.

> AC: Click status badge in table → dropdown of statuses. On change, write to `application_status_history`, update `current_status_id` and `last_activity_at`. Optional note field. If new status is terminal, follow-up reminders for this app stop.

**US-4 (MUST)** — I can view the full detail page for an application.

> AC: Detail page shows: company info, role, full JD (collapsible), URL (clickable), source, current status, full status history timeline, attached cover letter(s), related parsed emails. Edit / Archive / Delete actions.

**US-5 (MUST)** — I can customize statuses.

> AC: Settings → Statuses page. List with drag-to-reorder. Add status (name, color picker, terminal toggle). Edit existing. Delete only allowed if no application currently uses it; otherwise prompt to reassign apps to another status first. Exactly one status must always be `is_default_new`.

**US-6 (SHOULD)** — I can archive an application without deleting it.

> AC: Archive action sets `archived = 1`. Archived apps hidden from default view but shown when "Show archived" toggle is on.

**US-7 (LATER)** — Kanban board view as alternative to table.

### 4.2 Chrome extension

**US-8 (MUST)** — On any job page, the extension popup clips the full page to Markdown and pre-fills company, role, and URL from heuristic title parsing.

> AC: A universal content script (runs on all HTTP/HTTPS pages) uses `@mozilla/readability` to extract the main article content and `turndown` to convert it to Markdown. The raw Markdown is stored in `applications.page_markdown`. Company and role are pre-filled by parsing `document.title` (common pattern: "Job Title at Company | Site") and are user-editable before submitting. The popup shows a word count and a collapsible preview of the clipped Markdown.

**US-8a (LATER)** — LLM auto-parses company, role, and job description from the stored `page_markdown`.

> AC: "Parse with AI" button on the application detail panel sends `page_markdown` to Ollama with a structured extraction prompt. The LLM response auto-populates `role_title`, `company.name`, and `job_description` fields. User reviews and confirms before saving.

**US-9 (MUST)** — The clipping approach works on LinkedIn, Lever, Greenhouse, and any other job board or company careers page — no per-site selectors required.

> AC: Source (linkedin / lever / greenhouse / other) is detected automatically from the page hostname. No per-site content scripts; one universal clipper handles all pages.

**US-10 (MUST)** — On any page, the popup lets the user edit company and role before submitting.

> AC: Company and role fields are always user-editable. The URL is pre-filled from the active tab. The clipped Markdown is shown as a collapsible preview.

**US-11 (MUST)** — Extension submits to the local desktop app and shows success or failure.

> AC: POST to `http://127.0.0.1:<port>/api/applications` with bearer token. Show "Saved to tracker ✓" or specific error (app not running, token invalid, etc.). Failure case offers "Copy as JSON" so the user can manually paste later.

**US-12 (MUST)** — First-time pairing flow.

> AC: Desktop app Settings → "Pair extension" shows the bearer token as a copy-able string and a QR code. Extension popup has "Not paired" state with a "Paste token" input. Once pasted, extension stores it in `chrome.storage.local`.

**US-13 (SHOULD)** — Extension button shows badge if the app isn't running.

> AC: Background script pings `/api/health` every 60s when popup hasn't been opened. If unreachable, set badge to "!".

### 4.3 Email scanning

**US-14 (MUST)** — I can connect my Gmail account via OAuth.

> AC: Settings → "Connect Gmail" opens system browser to Google OAuth consent. Requested scopes: `gmail.readonly`. Token + refresh token stored encrypted via `safeStorage`. Disconnect button revokes the token and clears local storage.

**US-15 (MUST)** — The app scans new Gmail messages every 30 minutes (configurable).

> AC: node-cron job runs on configured interval (default 30min). Uses Gmail's history API (`historyId`) for delta queries — much cheaper than scanning everything. Stores last seen `historyId` in settings.

**US-16 (MUST)** — For each candidate email, the LLM classifies it.

> AC: An email is a "candidate" if (a) sender domain matches a known company domain in `companies.website` OR (b) subject/body contains keywords like "application", "thank you for applying", "interview", "unfortunately", "next steps". Send the email to Ollama with the classification prompt (§3.3). Persist the result in `emails`.

**US-17 (MUST)** — Confirmed status changes from email require my approval.

> AC: Parsed emails with `confidence >= 0.6` and a matched application appear as a notification badge ("3 status suggestions"). Inbox-style panel shows each: email preview, suggested status change, Accept / Dismiss / "Link to different application" buttons. **Never auto-update statuses** in v1 — only suggest.

**US-18 (MUST)** — Manual scan trigger.

> AC: Button in Settings or Emails panel: "Scan now". Calls `POST /api/emails/scan` and shows progress.

**US-19 (SHOULD)** — Smart matching of unparented emails.

> AC: If LLM extracts a `company_guess` and `role_guess`, fuzzy-match against existing applications. If a single match has Levenshtein distance under threshold on company + role, prefill the link. Otherwise show "Which application is this about?" picker.

### 4.4 AI cover letter generation

**US-20 (MUST)** — From an application's detail page, I can generate a cover letter.

> AC: "Generate cover letter" button opens a modal with: CV picker (defaults to the app's `cv_id` or default CV), custom instructions textarea. Generate streams tokens into the modal in real time. Save / Discard / Regenerate buttons.

**US-21 (MUST)** — I can edit the generated letter before saving.

> AC: Rich-text-ish editing (plain textarea is fine for v1). On save, set `is_edited = 1` if differs from generated.

**US-22 (MUST)** — I can copy the final letter to clipboard.

> AC: "Copy" button copies plain text.

**US-23 (SHOULD)** — Multiple cover letters per application.

> AC: Allow generating new versions; show as a list on the detail page with timestamps.

### 4.5 CV management

**US-24 (MUST)** — I can upload PDF and DOCX CVs.

> AC: Settings → CVs → "Upload". File copied to `userData/cvs/`. Text extracted via `pdf-parse` or `mammoth` and stored in `extracted_text`. If extraction fails, show error and let user paste plain text manually.

**US-25 (MUST)** — I can set a default CV.

> AC: Star icon next to each CV; only one can be default.

**US-26 (MUST)** — I can delete a CV.

> AC: Confirm dialog. Applications referencing it get `cv_id` set to NULL (don't cascade delete the app).

### 4.6 Notifications & reminders

**US-27 (MUST)** — Native OS notification when new email matches are found.

> AC: After a scan, if N new pending suggestions, fire a single notification "Job tracker: 3 new email matches". Clicking opens the email suggestions panel.

**US-28 (MUST)** — Follow-up reminders for stale applications.

> AC: Configurable threshold in settings (default 7 days). Every morning at 9am (cron), check applications where `current_status` is not terminal, not in `Applied` for less than 2 days, and `last_activity_at` is older than threshold. Show in-app badge with count and a notification once per day max. List view: "Needs follow-up" filter.

**US-29 (MUST)** — App icon dock badge.

> AC: macOS dock badge shows total of (pending email suggestions + stale follow-ups needed). `app.setBadgeCount(n)`.

### 4.7 Settings

**US-30 (MUST)** — Settings page covers: Ollama (host URL, model, "Pull model" button, test connection), Gmail (connect/disconnect, last scan time, scan interval), Statuses (CRUD), CVs (CRUD), Extension pairing (show token, regenerate), Follow-up threshold, Notification toggle.

**US-31 (LATER)** — Sync settings (cloud sync URL, auth token) — surfaced once you decide to ship sync.

### 4.8 Onboarding

**US-32 (SHOULD)** — First-run wizard.

> AC: On first launch with empty DB: (1) Welcome, (2) Check Ollama running + pull model, (3) Optional: Connect Gmail, (4) Optional: Upload first CV, (5) Optional: Install Chrome extension link. Skippable at each step.

---

## 5. Open decisions

Pin these down before or during development.

1. **tRPC for IPC, or hand-rolled with Zod?** Recommend tRPC; trivial to swap later.
2. **Gmail-only or add IMAP/Outlook in v1?** Recommend Gmail-only — Outlook OAuth verification is its own slog. Document IMAP as a v1.1 plan.
3. **Where do extension content-script selectors live?** Recommend a single config file `extension/src/sites.ts` mapping hostnames to selector functions — easier to fix when LinkedIn redesigns next month.
4. **Should the desktop app auto-launch a tiny tray/menu-bar version so the HTTP server stays running for the extension even when the window is closed?** Strongly recommend yes — otherwise the extension fails when the user closes the window. Use `app.dock.hide()` + a tray icon.
5. **Encryption at rest for the local DB?** v1: no. Document risk in README. Add SQLCipher in v1.1 if going public.
6. **OAuth client ID — yours or BYO?** For personal use, hardcode your Google Cloud OAuth client. Before making the repo public, switch to documenting how the user creates their own client and pastes credentials in (or move the client to a Cloudflare Worker proxy).
7. **Code signing for macOS** — defer until going public. Until then, document the `xattr -dr com.apple.quarantine` workaround in the README for friends you share builds with.
8. **Test strategy** — Recommend Vitest for unit tests on services (classification, status logic), Playwright for the renderer E2E happy path. Skip extensive testing for v1 since it's personal use, but write tests for the email-classification path because it's the trickiest piece.
9. **Logging** — `pino` to a rotating file in userData, plus DevTools console in dev. Log all LLM inputs/outputs for now — invaluable when iterating on prompts.
10. **Migrations** — Drizzle Kit, run on app start. Single source of truth in `db/schema.ts`.

---

## 6. Suggested build order

A practical 6-milestone plan to get to a working v1:

1. **M1 — Skeleton:** Electron + React + Vite + Tailwind + Drizzle + libSQL local file. Migrations. Seed statuses. Manual "Add application" form. Table view. Status badge editing. → You can already use this.
2. **M2 — CVs + cover letters:** Upload, extract text, default CV. Ollama client. Cover letter modal with streaming. → AI features alive.
3. **M3 — Chrome extension:** Local Fastify server, bearer auth, pairing flow. Manual-entry popup. Content scripts for LinkedIn → Lever → Greenhouse in that order. → One-click capture works.
4. **M4 — Gmail integration:** OAuth, history-API delta scan, candidate filtering, LLM classification, suggestions panel, accept/dismiss. → The killer feature.
5. **M5 — Polish:** Notifications, follow-up reminders, dock badge, custom statuses CRUD, first-run wizard, settings page. → Feels like a real app.
6. **M6 — Public-ready (deferred):** README, screenshots, BYO OAuth docs, code signing, optional libSQL sync toggle.

Each milestone should be ~1–2 weeks of focused evening work.
