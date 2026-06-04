import { app, BrowserWindow, shell } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'
import path from 'path'
import pino from 'pino'
import fs from 'fs'
import { initClient } from './db/client'
import { runMigrations } from './db/migrate'
import { appRouter } from './ipc/router'

// ─── Logger ───────────────────────────────────────────────────────────────────

function createLogger() {
  const logDir = path.join(app.getPath('userData'), 'logs')
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, 'app.log')
  const dest = pino.destination({ dest: logFile, sync: false })
  return pino({ level: 'info' }, dest)
}

// ─── DB ───────────────────────────────────────────────────────────────────────

async function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'data.db')
  initClient(`file:${dbPath}`)

  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'migrations')
    : path.join(__dirname, '../electron/db/migrations')

  await runMigrations(migrationsFolder)
}

// ─── Window ───────────────────────────────────────────────────────────────────

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  createIPCHandler({ router: appRouter, windows: [win] })

  if (process.env['VITE_DEV_SERVER_URL']) {
    win.loadURL(process.env['VITE_DEV_SERVER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => {
    win = null
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const logger = createLogger()

  try {
    await initDb()
    logger.info('Database initialized')
  } catch (err) {
    logger.error({ err }, 'Failed to initialize database')
    app.quit()
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
