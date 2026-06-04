import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'

// Module-level quit flag so tray close handler can distinguish hide vs quit
let isQuitting = false
import { createIPCHandler } from 'electron-trpc/main'
import path from 'path'
import pino from 'pino'
import fs from 'fs'
import { initClient } from './db/client'
import { runMigrations } from './db/migrate'
import { appRouter } from './ipc/router'
import { startHttpServer } from './services/httpServer'
import { getOrCreatePairingToken } from './services/pairing'

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

  win.on('close', (e) => {
    // On macOS, close hides to tray rather than quitting
    if (process.platform === 'darwin' && !isQuitting) {
      e.preventDefault()
      win?.hide()
    }
  })

  win.on('closed', () => {
    win = null
  })
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

let tray: Tray | null = null

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray-icon.png')
    : path.join(__dirname, '../assets/tray-icon.png')

  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  tray = new Tray(icon)
  tray.setToolTip('Job Tracker')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Job Tracker',
      click: () => {
        if (win) {
          win.show()
        } else {
          createWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(menu)
  tray.on('double-click', () => {
    if (win) {
      win.show()
    } else {
      createWindow()
    }
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

  // Ensure pairing token exists on startup
  await getOrCreatePairingToken()

  // Start local HTTP server for Chrome extension
  try {
    const port = await startHttpServer()
    logger.info({ port }, 'HTTP server started')
  } catch (err) {
    logger.error({ err }, 'Failed to start HTTP server')
  }

  createWindow()
  createTray()

  app.on('activate', () => {
    if (win) {
      win.show()
    } else {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS keep running in tray; on other platforms quit
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
})
