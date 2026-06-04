# Job Application Tracker

A local-first Electron desktop app for tracking job applications, with Gmail scanning, Ollama-powered cover letter generation, and a Chrome extension for one-click capture from LinkedIn / Lever / Greenhouse.

## Source of truth

**The full architectural spec is in `SPEC.md` — read it before making non-trivial decisions.** This file is a quick-reference summary. When SPEC.md and this file disagree, SPEC.md wins.

## Stack

- **Desktop:** Electron + React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **State:** Zustand (UI), TanStack Query (server state)
- **DB:** libSQL via `@libsql/client` + Drizzle ORM (NOT better-sqlite3 — libSQL enables future sync)
- **IPC:** tRPC over `electron-trpc`
- **Local HTTP server (for extension):** Fastify on 127.0.0.1, random port
- **Scheduler:** node-cron
- **LLM:** Ollama via `ollama` npm package — default model `qwen2.5:7b-instruct`
- **Email:** `googleapis` (Gmail API, OAuth, history-API delta scans)
- **Secrets:** Electron `safeStorage` (Keychain on macOS)
- **CV parsing:** `pdf-parse`, `mammoth`
- **Extension:** Manifest V3, vanilla TS + Vite

## Project layout

```
apps/desktop/        # Electron app (main + renderer)
apps/extension/      # Chrome extension (Manifest V3)
packages/shared/     # Shared TS types and Zod schemas
```

Monorepo via pnpm workspaces.

## Conventions

- **IDs:** UUIDv7 (sortable, sync-friendly) — never autoincrement integers.
- **Timestamps:** Integer Unix milliseconds, never strings.
- **Schema:** Single source of truth in `apps/desktop/electron/db/schema.ts`. Migrations via Drizzle Kit, run on app startup.
- **Validation:** All HTTP payloads validated with Zod schemas from `packages/shared`. Same schemas reused on the extension side.
- **Errors:** Throw typed errors in services; tRPC and Fastify routes translate to HTTP/RPC error responses.
- **Logging:** `pino` to a rotating file in `app.getPath('userData')/logs/`. Log every LLM input and output during early development.
- **LLM prompts:** Live in `apps/desktop/electron/services/llm/prompts/*.md` — not inlined in code. Easy to iterate.
- **No auto-status-updates from emails.** LLM classifications surface as suggestions only; user must accept.

## Commands

```
pnpm dev               # Run desktop app in dev mode (electron + vite)
pnpm dev:extension     # Build extension in watch mode for Chrome
pnpm build             # Build all packages
pnpm db:generate       # Generate Drizzle migrations from schema changes
pnpm db:migrate        # Apply pending migrations
pnpm typecheck         # Run tsc across the workspace
pnpm test              # Vitest
```

## What NOT to do

- Don't introduce `better-sqlite3` or `sqlite3` — we're on libSQL specifically because of future sync.
- Don't auto-update application status from email classification. Always require explicit user confirmation.
- Don't fabricate CV content when generating cover letters — the prompt explicitly forbids it.
- Don't write content scripts as a single switch on `window.location.host` — use the per-site config in `apps/extension/src/sites.ts` so adding sites stays clean.
- Don't store OAuth tokens or the extension pairing token in plain text. Use `safeStorage` and store the hashed token in DB.
- Don't put OS-specific paths anywhere except `apps/desktop/electron/paths.ts`. All paths go through `app.getPath()`.

## Working with the spec

When implementing a new feature:

1. **Find it in SPEC.md** — locate the user story (US-N) and the relevant data model + endpoint definitions.
2. **Use plan mode first** — describe what's being built, let Claude propose an implementation plan, review before executing.
3. **Update the migration when changing schema** — never edit existing migrations, always add a new one.
4. **Add the matching Zod schema in `packages/shared`** — so the extension stays in sync.
5. **Write a Vitest test for service-layer logic** — especially anything around email classification or status state machines.

## Milestones (from SPEC.md §6)

We're building in this order. Don't start a later milestone before the previous one works end-to-end:

- [ ] M1 — Skeleton: Electron + DB + table view + manual add
- [ ] M2 — CVs + cover letter generation (Ollama)
- [ ] M3 — Chrome extension + local HTTP server
- [ ] M4 — Gmail integration + email classification + suggestions panel
- [ ] M5 — Notifications, reminders, custom statuses, onboarding
- [ ] M6 — Public-ready (deferred)
