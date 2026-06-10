<p align="center">
  <img src="apps/desktop/assets/icon.svg" width="96" alt="Jobsmith" />
</p>
<h1 align="center">Jobsmith</h1>
<p align="center"><em>Local-first job application tracker with Gmail scanning and AI-powered insights</em></p>
<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-47848f?logo=electron&logoColor=white&style=flat-square" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black&style=flat-square" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white&style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white&style=flat-square" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind-3-06b6d4?logo=tailwindcss&logoColor=white&style=flat-square" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Ollama-local%20LLM-000000?style=flat-square" alt="Ollama" />
  <img src="https://img.shields.io/badge/platform-macOS-000000?logo=apple&logoColor=white&style=flat-square" alt="macOS" />
  <img src="https://img.shields.io/badge/local--first-%E2%9C%93-4ade80?style=flat-square" alt="local-first" />
</p>

---

A local-first Electron desktop app for tracking job applications. Scans your Gmail for application-related emails, classifies them with a local LLM (Ollama), and automatically updates application statuses. Comes with a Chrome extension for one-click capture from LinkedIn, Lever, Greenhouse, and any other job board.

## Features

- **Application tracker** — table and detail view, custom statuses, archive, inline editing, notes
- **Gmail integration** — OAuth-based delta scan, LLM email classification, auto-apply confident status changes
- **Cover letter generation** — Ollama-powered, streamed, editable, per-application history
- **Chrome extension** — one-click page capture from any job board, bearer-token pairing
- **Stats dashboard** — funnel chart, weekly trend, response rate, source breakdown, time-to-rejection/interview
- **Export** — CSV download, Notion push
- **Sync** *(experimental)* — libSQL embedded replica via Turso for multi-device use
- **Dark mode** — persisted to localStorage

## Prerequisites

| Requirement | Notes |
|---|---|
| Node 20+ | via `nvm` or `fnm` |
| pnpm 9+ | `npm i -g pnpm` |
| [Ollama](https://ollama.com) | running locally on port 11434 |

## Setup

```bash
git clone https://github.com/senketsukamui/jobsmith.git
cd jobsmith
pnpm install
```

### Google OAuth credentials (for Gmail — developers only)

> **End users** downloading a pre-built binary don't need to do anything here — Gmail just works.

If you're running from source, the app needs a Google OAuth client to connect to Gmail. The credentials are baked into the binary at build time from a `.env` file — they are never stored in the repo.

**1. Create a `.env` file at the repo root:**

```bash
cp .env.example .env
```

**2. Fill in your credentials:**

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

**3. Get credentials from Google Cloud Console:**

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create a project (or pick an existing one) and enable the **Gmail API**
3. Click **Create credentials → OAuth client ID**
4. Choose **Desktop app** as the application type, give it a name, click **Create**
5. Copy the **Client ID** and **Client Secret** into your `.env`

> The app uses PKCE (Proof Key for Code Exchange) so the secret is never sent over the network — it's only used to identify the app to Google. Desktop app clients are considered public by Google's own definition.

### Pull a local LLM model

```bash
ollama pull qwen2.5:3b-instruct
```

Any instruction-tuned model works. Larger models (7b, 14b) give better email classification at the cost of speed. The model can be changed in Settings → Ollama.

### Run the app

```bash
pnpm dev
```

The Chrome extension can be loaded unpacked from `apps/extension/dist/` after running:

```bash
pnpm dev:extension
```

## Distributing a build

When you run `pnpm build`, the values from your `.env` are baked into the binary at compile time. Anyone who downloads that binary can connect Gmail with one click — no Google Cloud setup required on their end.

```bash
pnpm build
# → apps/desktop/dist/  (packaged Electron app)
```

> **macOS quarantine workaround** — unsigned builds are blocked by Gatekeeper. Recipients can run:
> ```bash
> xattr -dr com.apple.quarantine /Applications/Jobsmith.app
> ```
> Or right-click → Open → Open anyway.

Code signing and notarization require an Apple Developer account and are not set up in this repo.

## Sync (experimental)

Jobsmith uses [libSQL](https://github.com/tursodatabase/libsql) as its database engine, which supports **embedded replica mode** — reads and writes go to a local SQLite file, and changes sync to a remote [Turso](https://turso.tech) database automatically.

To enable:

1. Create a free Turso account and database: `turso db create jobsmith`
2. Get the database URL and a token: `turso db show jobsmith` / `turso db tokens create jobsmith`
3. In Jobsmith → **Settings → Sync**, enter the URL and token and click **Enable sync**
4. Restart the app

Sync runs every 5 minutes automatically and can be triggered manually from Settings.

## Development commands

```bash
pnpm dev               # Desktop app in dev mode (Electron + Vite HMR)
pnpm dev:extension     # Extension in watch mode
pnpm build             # Build all packages
pnpm typecheck         # TypeScript across the monorepo
pnpm test              # Vitest
pnpm db:generate       # Generate Drizzle migrations from schema changes
pnpm db:migrate        # Apply pending migrations
```

## Tech stack

- **Electron 33** + **React 18** + **TypeScript** + **Vite** + **Tailwind CSS**
- **libSQL** (`@libsql/client`) + **Drizzle ORM** — local SQLite, sync-ready
- **tRPC** over `electron-trpc` — fully typed IPC between main and renderer
- **Ollama** — local LLM inference, streamed responses
- **Recharts** — stats dashboard charts
- **Gmail API** (googleapis) — OAuth 2.0 with PKCE, History API delta scans
- **Fastify** — local HTTP server for Chrome extension communication
- **node-cron** — scheduled email scans
- **safeStorage** (Electron) — OS keychain encryption for OAuth tokens

## Security notes

- OAuth tokens and the extension pairing token are encrypted at rest via Electron `safeStorage`
- The OAuth flow uses PKCE — no client secret is transmitted during authentication
- The local HTTP server for the extension binds to `127.0.0.1` only
- The local database is not encrypted (SQLCipher support is a future option)
- Never commit your `.env` file — it is gitignored
