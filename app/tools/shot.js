// Dev helper: renders widget states to PNGs offscreen (no real display needed).  usage: electron shot.js
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path'), fs = require('fs')
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true })
const wait = ms => new Promise(r => setTimeout(r, ms))
ipcMain.handle('config:get', () => ({ fx: 1, fy: 1 }))
for (const c of ['config:set', 'ignore', 'answer']) ipcMain.on(c, () => {})
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 760, height: 820, show: false, transparent: true, frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, offscreen: true } })
  let last = null
  win.webContents.on('paint', (_e, _d, img) => { last = img })
  win.webContents.setFrameRate(30)
  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  const snap = async n => { await wait(900); fs.writeFileSync(path.join(out, n + '.png'), last.toPNG()) }
  const js = c => win.webContents.executeJavaScript(c)
  const emit = (ch, d) => win.webContents.send(ch, d)
  await js(`document.body.style.background='#f6ede6'`)   // stand-in desktop so white cards are visible
  await wait(500); await snap('1-idle')
  emit('state', { state: 'thinking' }); await snap('2-thinking')
  emit('state', { state: 'done' }); await snap('3-done')
  emit('state', { state: 'attention', message: 'Claude needs permission to run: npm install' }); await snap('4-attention')
  emit('ask', { questions: [
    { header: 'Approach', question: 'Which database should we use?', multiSelect: false, options: [
      { label: 'Postgres', description: 'Relational, battle tested' }, { label: 'SQLite', description: 'Zero setup, single file' }, { label: 'MongoDB', description: 'Document store' }] },
    { header: 'Notes', question: 'Anything else I should know?' }] })
  await snap('5-ask'); await js(`document.querySelector('.opt').click()`); await snap('6-ask-selected')
  await js(`document.querySelector('#next').click()`); await snap('7-ask-text')
  await js(`document.querySelector('#skip').click()`); await wait(300)
  await js(`document.querySelector('#gear').click()`); await snap('8-settings')
  await js(`document.querySelector('#done').click()`)
  for (const id of ['x','y','z']) emit('state', { session: id, name: { x: 'api-server', y: 'website', z: 'website' }[id], state: 'idle' })
  emit('state', { session: 'x', name: 'api-server', state: 'thinking' })
  emit('state', { session: 'y', name: 'website', state: 'done' })
  emit('state', { session: 'z', name: 'website', state: 'thinking' })
  await snap('9-sessions')
  emit('ask', { session: 'x', name: 'api-server', questions: [{ header: 'Deploy', question: 'Deploy to staging now?', options: [{ label: 'Yes' }, { label: 'No' }] }] })
  await snap('10-multi-ask')
  app.quit()
})
