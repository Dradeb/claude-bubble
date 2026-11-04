// Installs / removes the Claude Code hooks (in ~/.claude/settings.json) that feed the bubble.
// The hook is just curl.exe (ships with Windows 10+): it POSTs Claude's hook JSON to the widget, which does the rest.
const fs = require('fs')
const os = require('os')
const path = require('path')

const PORT = 47800
const URL_MARK = `127.0.0.1:${PORT}/hook`
// Exec form (no shell): '@-' is a syntax error in PowerShell, and Claude Code falls back to PowerShell when Git Bash is missing.
// cmd.exe keeps the hook silent (exit 0) when the widget isn't running; --connect-timeout stops Windows' slow
// loopback refusal (~2 s) from stalling Claude.
const HOOK = {
  command: 'cmd.exe',
  args: ['/d', '/s', '/c', `curl.exe -s --connect-timeout 0.4 -m 590 -X POST --data-binary @- http://${URL_MARK} & exit /b 0`]
}
const EVENTS = [
  { name: 'UserPromptSubmit', timeout: 10 },
  { name: 'Stop', timeout: 10 },
  { name: 'Notification', timeout: 10 },
  { name: 'SessionEnd', timeout: 10 },
  { name: 'PermissionRequest', timeout: 600, matcher: 'AskUserQuestion' }
]

const settingsPath = () => path.join(os.homedir(), '.claude', 'settings.json')
const isOurs = h => !!h && (
  (typeof h.command === 'string' && (h.command.includes(URL_MARK) || /claude-bubble[\\/](app[\\/])?(hook|bubble)\.ps1/i.test(h.command))) ||
  (Array.isArray(h.args) && h.args.some(a => String(a).includes(URL_MARK))))

function read() {
  try {
    const text = fs.readFileSync(settingsPath(), 'utf8').replace(/^﻿/, '')   // Windows tools often save a UTF-8 BOM
    return text.trim() ? JSON.parse(text) : {}
  } catch (e) { return e.code === 'ENOENT' ? {} : null }
}
function write(obj) {
  const p = settingsPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  if (fs.existsSync(p) && !fs.existsSync(p + '.bak-bubble')) fs.copyFileSync(p, p + '.bak-bubble')
  fs.writeFileSync(p, JSON.stringify(obj, null, 2))
}
const strip = settings => {
  const hooks = settings.hooks || {}
  for (const ev of Object.keys(hooks)) {
    hooks[ev] = (hooks[ev] || []).filter(g => !(g.hooks || []).some(isOurs))
    if (!hooks[ev].length) delete hooks[ev]
  }
  if (!Object.keys(hooks).length) delete settings.hooks; else settings.hooks = hooks
  return settings
}

function status() {
  const s = read()
  if (!s) return { connected: false, error: 'settings.json is not valid JSON' }
  const hooks = s.hooks || {}
  // installed with /plugin install bubble@...: the plugin ships the hooks itself
  const viaPlugin = Object.entries(s.enabledPlugins || {}).some(([k, on]) => on && /^bubble@/.test(k))
  const viaSettings = EVENTS.every(e => (hooks[e.name] || []).some(g => (g.hooks || []).some(isOurs)))
  return { connected: viaSettings || viaPlugin, via: viaPlugin ? 'plugin' : viaSettings ? 'settings' : null }
}

function connect() {
  const s = read()
  if (!s) throw new Error('~/.claude/settings.json is not valid JSON; fix it first')
  if (status().via === 'plugin') return status()   // the plugin already provides the hooks; adding more would double every event
  strip(s)
  s.hooks = s.hooks || {}
  for (const e of EVENTS) {
    const group = { hooks: [{ type: 'command', ...HOOK, timeout: e.timeout }] }
    if (e.matcher) group.matcher = e.matcher
    s.hooks[e.name] = [...(s.hooks[e.name] || []), group]
  }
  write(s)
  return status()
}

function disconnect() {
  const s = read()
  if (!s) throw new Error('~/.claude/settings.json is not valid JSON; fix it first')
  write(strip(s))
  return status()
}

module.exports = { status, connect, disconnect, PORT, HOOK, EVENTS }
