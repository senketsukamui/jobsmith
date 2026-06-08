# Jobsmith

A local-first Electron desktop app for tracking job applications. Scans your Gmail for application-related emails, classifies them with a local LLM (Ollama), and automatically updates application statuses. Comes with a Chrome extension for one-click capture from LinkedIn, Lever, Greenhouse, and any other job board.

## Features

- **Application tracker** — table and detail view, custom statuses, archive, inline editing, notes
- **Gmail integration** — OAuth-based delta scan, LLM email classification, auto-apply confident status changes
- **Cover letter generation** — Ollama-powered, streamed, editable, per-application history
- **Chrome extension** — one-click page capture from any job board, bearer-token pairing
- **Export** — CSV download, Notion push
- **Sync** *(experimental)* — libSQL embedded replica via Turso for multi-device use
- **Dark mode** — persisted to localStorage

## Prerequisites

| Requirement | Notes |
|---|---|
| Node 20+ | via `nvm` or `fnm` |
| pnpm 9+ | `npm i -g pnpm` |
| [Ollama](https://ollama.com) | running locally on port 11434 |
| Google OAuth credentials | see below |

## Setup

```bash
git clone https://github.com/senketsukamui/jobsmith.git
cd jobsmith
pnpm install
```

### Google OAuth credentials (required for Gmail)

Gmail scanning requires a Google OAuth 2.0 Desktop client. You only need to do this once.

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create a project (or pick an existing one)
3. Enable the **Gmail API** for the project
4. Click **Create credentials → OAuth client ID**
5. Choose **Desktop app** as the application type
6. Add the redirect URI:
   ```
   http://127.0.0.1:53700/api/oauth/callback
   ```
   *(The port is chosen randomly at runtime; add a few common ones like 53700–53710 to be safe, or just add `http://127.0.0.1` as an origin)*
7. Copy the **Client ID** and **Client Secret**

**Option A — environment variables (recommended for development):**

Create a `.env` file in `apps/desktop/` (it is gitignored):

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

**Option B — paste in the app:**

Go to **Settings → Gmail** and enter the credentials there. They are encrypted with the system keychain (macOS Keychain, GNOME Wallet, etc.) before being stored.

### Pull a local LLM model

```bash
ollama pull qwen2.5:3b-instruct
```

Any instruction-tuned model works. Larger models (7b, 14b) give better email classification at the cost of speed.

### Run the app

```bash
pnpm dev
```

The Chrome extension can be loaded unpacked from `apps/extension/dist/` after running:

```bash
pnpm dev:extension
```

## Sync (experimental)

Jobsmith uses [libSQL](https://github.com/tursodatabase/libsql) as its database engine, which supports **embedded replica mode** — reads and writes go to a local SQLite file, and changes are synced to a remote [Turso](https://turso.tech) database automatically.

To enable:

1. Create a free Turso account and database: `turso db create jobsmith`
2. Get the database URL and a token: `turso db show jobsmith` / `turso db tokens create jobsmith`
3. In Jobsmith → **Settings → Sync**, enter the URL and token and click **Enable sync**
4. Restart the app

Sync runs every 5 minutes automatically and can be triggered manually from Settings. The app works fully offline; changes sync when connectivity is available.

## Sharing builds (macOS quarantine workaround)

Unsigned macOS builds are quarantined by Gatekeeper. To open a build shared with you:

```bash
xattr -dr com.apple.quarantine /Applications/Jobsmith.app
```

Or right-click the app → Open → Open anyway (works once).

## Build

```bash
pnpm build
```

This produces a packaged Electron app in `apps/desktop/dist/`. Code signing and notarization require an Apple Developer account and are not set up in this repo.

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
- **Gmail API** (googleapis) — OAuth 2.0, History API delta scans
- **Fastify** — local HTTP server for Chrome extension communication
- **node-cron** — scheduled email scans and reminders
- **safeStorage** (Electron) — OS keychain encryption for credentials

## Security notes

- OAuth tokens and the extension pairing token are encrypted at rest via Electron `safeStorage`
- The local database is not encrypted (SQLCipher support is a future option)
- The local HTTP server for the extension binds to `127.0.0.1` only
- Never commit your `.env` file — it is gitignored
