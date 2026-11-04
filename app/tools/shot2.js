// Dev helper #2: dark theme, size, settings and drag simulation (offscreen).
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path'), fs = require('fs')
const out = path.join(__dirname, 'shots2'); fs.mkdirSync(out, { recursive: true })
const wait = ms => new Promise(r => setTimeout(r, ms))
let cfg = { fx: 1, fy: 1, size: 1.3, theme: 'dark' }, focused = []
ipcMain.handle('config:get', () => cfg)
ipcMain.handle('layout', (_e, p) => { console.log('layout', JSON.stringify(p)); return true })
ipcMain.on('config:set', (_e, p) => { cfg = { ...cfg, ...p }; console.log('config:set', JSON.stringify(p)) })
ipcMain.on('focus-terminal', (_e, h) => { focused.push(h); console.log('focus-terminal', h) })
for (const c of ['ignore', 'answer']) ipcMain.on(c, () => {})
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 760, height: 820, show: false, transparent: true, frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, offscreen: true } })
  let last = null
  win.webContents.on('console-message', (_e, ...a) => console.log('[renderer]', a[1] ?? a[0]))
  win.webContents.on('paint', (_e, _d, img) => { last = img }); win.webContents.setFrameRate(30)
  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  const snap = async n => { await wait(900); fs.writeFileSync(path.join(out, n + '.png'), last.toPNG()) }
  const js = c => win.webContents.executeJavaScript(c)
  const emit = (ch, d) => win.webContents.send(ch, d)
  await wait(500)
  emit('state', { session: 'a', name: 'api-server', state: 'thinking' })
  emit('state', { session: 'b', name: 'website', state: 'done', hwnd: 123456 })
  await snap('1-dark-130-sessions')
  emit('ask', { session: 'a', name: 'api-server', questions: [{ header: 'Deploy', question: 'Deploy to staging now?', options: [{ label: 'Yes', description: 'Ship it' }, { label: 'No' }] }] })
  await js(`document.querySelector('.opt').click()`); await snap('2-dark-ask')
  await js(`document.querySelector('#skip').click()`); await wait(400)
  // click the pill -> should focus website's terminal
  const r = await js(`(()=>{const b=document.querySelector('#pill').getBoundingClientRect();return [b.left+20,b.top+20]})()`)
  win.webContents.sendInputEvent({ type: 'mouseMove', x: r[0], y: r[1] })
  win.webContents.sendInputEvent({ type: 'mouseDown', x: r[0], y: r[1], button: 'left', clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: r[0], y: r[1], button: 'left', clickCount: 1 })
  await wait(400); console.log('focused after click:', JSON.stringify(focused))
  // drag the pill to the top-left-ish
  const r2 = await js(`(()=>{const b=document.querySelector('#pill').getBoundingClientRect();return [b.left+20,b.top+20]})()`)
  const se = (t, x, y) => win.webContents.sendInputEvent({ type: t, x, y, button: 'left', clickCount: 1, modifiers: t === 'mouseMove' ? ['leftButtonDown'] : [] })
  win.webContents.sendInputEvent({ type: 'mouseMove', x: r2[0], y: r2[1] }); se('mouseDown', r2[0], r2[1])
  for (let i = 1; i <= 10; i++) { se('mouseMove', r2[0] - i * 45, r2[1] - i * 50); await wait(30) }
  console.log('mid:', await js('JSON.stringify({drag: drag && {on: drag.on, ready: drag.ready}, cls: document.documentElement.className, fx: cfg.fx, fy: cfg.fy, av: [screen.availLeft, screen.availTop, screen.availWidth, screen.availHeight]})'))
  se('mouseUp', r2[0] - 450, r2[1] - 500); await wait(300)
  console.log('after:', await js('JSON.stringify({drag: drag && {on: drag.on}, cls: document.documentElement.className, fx: cfg.fx, fy: cfg.fy})')); await snap('3-dragged')
  await js(`document.querySelector('#gear').click()`); await snap('4-settings-dark')
  await js(`document.querySelector('[data-t=light]').click()`); await snap('5-settings-light')
  app.quit()
})
