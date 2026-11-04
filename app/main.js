const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const bridge = require('./bridge')
const helper = require('./winhelper')
const integration = require('./integration')

const DEFAULTS = { fx: 1, fy: 1, size: 1, theme: 'auto', onboarded: false }   // fx/fy: 0..1 position inside the work area
let cfg = { ...DEFAULTS }
let win = null, tray = null, hub = null
let saveTimer = null

const cfgFile = () => path.join(app.getPath('userData'), 'config.json')
function loadCfg() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) } } catch {}
}
function saveCfg() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)) } catch {}
  }, 300)
}

const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data) }

// The window hugs the widget (cheap to composite). It only goes full-screen while dragging / in settings.
const M = 20, PAD = 40            // screen margin of the widget / transparent padding for shadows
const box = { full: false, w: 360, h: 140 }
function applyBounds() {
  if (!win || win.isDestroyed()) return
  const wa = screen.getPrimaryDisplay().workArea
  if (box.full) return win.setBounds(wa)
  const W = Math.min(Math.round(box.w), wa.width), H = Math.min(Math.round(box.h), wa.height)
  const sw = W - 2 * PAD, sh = H - 2 * PAD            // size of the widget itself
  win.setBounds({
    x: Math.round(wa.x + M + cfg.fx * (wa.width - 2 * M - sw) - PAD),
    y: Math.round(wa.y + M + cfg.fy * (wa.height - 2 * M - sh) - PAD),
    width: W, height: H
  })
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea
  win = new BrowserWindow({
    x: wa.x + wa.width - 380, y: wa.y + wa.height - 160, width: box.w, height: box.h,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false, hasShadow: false, show: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })   // click-through until the pointer is over the widget
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.once('ready-to-show', () => win.showInactive())
  screen.on('display-metrics-changed', applyBounds)
}

function createTray() {
  const file = path.join(__dirname, 'assets', 'icon.png')
  if (!fs.existsSync(file)) return
  tray = new Tray(nativeImage.createFromPath(file).resize({ width: 16, height: 16 }))
  tray.setToolTip('Claude Bubble')
  const open = () => { send('open-settings'); if (win) win.showInactive() }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Settings', click: open },
    { type: 'separator' },
    { label: 'Quit Claude Bubble', click: () => app.quit() }
  ]))
  tray.on('click', open)
}

// ---- renderer <-> main ----
ipcMain.handle('config:get', () => cfg)
ipcMain.on('config:set', (_e, patch) => { cfg = { ...cfg, ...patch }; saveCfg(); applyBounds() })
ipcMain.handle('layout', (_e, p) => { Object.assign(box, p); applyBounds(); return true })
ipcMain.on('ignore', (_e, v) => { if (win) win.setIgnoreMouseEvents(v, { forward: true }) })
ipcMain.on('answer', (_e, obj) => hub && hub.answer(obj))
ipcMain.on('focus-terminal', (_e, hwnd) => helper.focus(hwnd))
ipcMain.on('quit', () => app.quit())

ipcMain.handle('integration:status', () => integration.status())
ipcMain.handle('integration:set', (_e, on) => {
  try { return on ? integration.connect() : integration.disconnect() } catch (e) { return { connected: integration.status().connected, error: e.message } }
})
const loginArgs = () => (app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] })
ipcMain.handle('login:get', () => ({ on: app.getLoginItemSettings(loginArgs()).openAtLogin, packaged: app.isPackaged }))
ipcMain.on('login:set', (_e, on) => app.setLoginItemSettings({ openAtLogin: !!on, ...loginArgs() }))

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => send('open-settings'))   // launching it again from the Start menu opens settings
  app.whenReady().then(() => {
    loadCfg(); createWindow(); createTray(); helper.warm()
    hub = bridge.start({ send, onAsk: () => { if (win) win.focus() }, onError: () => app.quit() })
  })
}
app.on('before-quit', () => { helper.stop(); hub && hub.close() })
app.on('window-all-closed', () => app.quit())
