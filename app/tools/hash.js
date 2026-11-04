// Writes dist/Claude-Bubble-Setup.exe.sha256 (the plugin's install script verifies it before running the installer).
const fs = require('fs'), crypto = require('crypto'), path = require('path')
const f = path.join(__dirname, '..', 'dist', 'Claude-Bubble-Setup.exe')
const h = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
fs.writeFileSync(f + '.sha256', `${h}  Claude-Bubble-Setup.exe\n`)
console.log('sha256', h)
