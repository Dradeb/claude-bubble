const { app, BrowserWindow } = require('electron'); const fs = require('fs'), path = require('path')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  let last = null; win.webContents.on('paint', (_e, _d, img) => { last = img })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a63"/><stop offset="1" stop-color="#f0453a"/></linearGradient>
  <filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#b02a20" flood-opacity=".35"/></filter></defs>
  <circle cx="256" cy="250" r="214" fill="url(#g)" filter="url(#s)"/>
  <g stroke="#fff" stroke-width="30" stroke-linecap="round" transform="translate(256 250)"><path d="M0-112V112M-112 0H112M-79-79L79 79M79-79L-79 79"/></g></svg>`
  await win.loadURL('data:text/html,<body style="margin:0;background:transparent">' + encodeURIComponent(svg) + '</body>')
  win.webContents.setFrameRate(10); await new Promise(r => setTimeout(r, 1200))
  fs.writeFileSync(path.join(process.argv[2], 'icon.png'), last.toPNG()); app.quit()
})
