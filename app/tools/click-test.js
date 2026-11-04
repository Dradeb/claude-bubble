// Dev test: clicking the pill focuses the right session's terminal. Offscreen, no display needed.  usage: electron tools/click-test.js
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const root = path.join(__dirname, '..')
const wait = ms => new Promise(r => setTimeout(r, ms))
const focused = []
ipcMain.handle('config:get', () => ({ fx: 1, fy: 1, size: 1, theme: 'light', onboarded: true }))
ipcMain.handle('layout', () => true)
ipcMain.handle('integration:status', () => ({ connected: true }))
ipcMain.handle('login:get', () => ({ on: false }))
ipcMain.on('focus-terminal', (_e, h) => focused.push(h))
for (const c of ['config:set', 'ignore', 'answer', 'login:set']) ipcMain.on(c, () => {})
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 760, height: 820, show: false, transparent: true, frame: false,
    webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true, offscreen: true } })
  win.webContents.setFrameRate(30)
  await win.loadFile(path.join(root, 'renderer', 'index.html'))
  const js = c => win.webContents.executeJavaScript(c)
  const emit = (ch, d) => win.webContents.send(ch, d)
  const click = async () => {
    const [x, y] = await js(`(()=>{const b=document.querySelector('#orb').getBoundingClientRect();return [Math.round(b.left+b.width/2),Math.round(b.top+b.height/2)]})()`)
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 })
    await wait(250)
  }
  let fails = 0
  const expect = (label, want) => { const got = focused.splice(0); const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', label, '-> focused', JSON.stringify(got), ok ? '' : 'expected ' + JSON.stringify(want)) }
  await wait(600)

  emit('state', { session: 'a', name: 'api', state: 'thinking', hwnd: 111 }); await wait(200)
  await click(); expect('one thinking session', [111])

  await wait(30); emit('state', { session: 'b', name: 'web', state: 'thinking', hwnd: 222 }); await wait(200)
  await click(); expect('two thinking sessions -> most recently active', [222])

  emit('state', { session: 'a', name: 'api', state: 'done', hwnd: 111 }); await wait(200)
  await click(); expect('one answered, one thinking -> the answered one first', [111])

  await click(); expect('answered cleared -> next is the working session', [222])

  emit('state', { session: 'c', name: 'nohwnd', state: 'thinking' }); await wait(200)
  await click(); expect('top session has no terminal known -> falls back to one that has', [222])

  emit('state', { session: 'c', state: 'end' }); emit('state', { session: 'a', state: 'end' }); emit('state', { session: 'b', state: 'end' }); await wait(200)
  await click(); expect('no sessions -> no-op', [])
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); app.exit(fails ? 1 : 0)
})
