// HTTP bridge on 127.0.0.1: receives Claude Code hook payloads (POST /hook, sent by curl) and
// turns them into widget events. A held-open response is how a question waits for the user's answer.
const http = require('http')
const path = require('path')
const helper = require('./winhelper')

const PORT = 47800

function start({ send, onAsk, onError }) {
  const pending = new Map()   // session id -> { ress, input, key }   (responses waiting for the user's answer)
  const recent = new Map()    // payload -> time, to drop duplicate events (plugin hooks + settings.json hooks both installed)
  const hwnds = new Map()     // session id -> terminal window handle

  const end = (res, body) => { try { res.writeHead(200, body ? { 'Content-Type': 'application/json' } : {}); res.end(body || '') } catch {} }

  async function terminalFor(sid, req) {
    if (!hwnds.has(sid)) {
      const h = await helper.resolve(req.socket.remotePort)   // only the first event of a session pays this (~10 ms)
      if (process.env.CB_DEBUG) console.log('terminal window for', sid, '->', h)
      if (h) hwnds.set(sid, h)
    }
    return hwnds.get(sid) || 0
  }

  async function onHook(d, raw, req, res) {
    const sid = d.session_id || 'default'
    const base = { session: sid, name: d.cwd ? path.basename(d.cwd) || d.cwd : 'session' }
    const ev = d.hook_event_name
    const now = Date.now()
    for (const [k, t] of recent) if (now - t > 3000) recent.delete(k)
    const dup = recent.has(raw) && ev !== 'PermissionRequest'
    recent.set(raw, now)
    if (dup) return end(res)
    if (ev === 'SessionEnd') {
      hwnds.delete(sid); send('state', { ...base, state: 'end' }); return end(res)
    }
    const hwnd = await terminalFor(sid, req)
    if (ev === 'UserPromptSubmit') send('state', { ...base, state: 'thinking', hwnd })
    else if (ev === 'Stop') send('state', { ...base, state: 'done', hwnd })
    else if (ev === 'Notification') send('state', { ...base, state: 'attention', message: d.message, hwnd })
    else if (ev === 'PermissionRequest' && d.tool_name === 'AskUserQuestion') {
      const input = d.tool_input || {}
      const cur = pending.get(sid)
      if (cur && cur.key === raw) { watch(sid, cur, res); return }          // same question delivered twice -> answer both
      if (cur) cur.ress.forEach(r => end(r))                               // superseded -> terminal fallback
      const p = { ress: [], input, key: raw }
      pending.set(sid, p); watch(sid, p, res)
      send('ask', { ...base, hwnd, questions: input.questions || [] })
      onAsk && onAsk()
      return
    }
    end(res)
  }

  function watch(sid, p, res) {
    p.ress.push(res)
    res.on('close', () => {
      p.ress = p.ress.filter(r => r !== res)
      if (!p.ress.length && pending.get(sid) === p) { pending.delete(sid); send('ask-cancel', sid) }
    })
  }

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      let d = {}
      try { d = JSON.parse(body) } catch {}
      if (req.url === '/hook') onHook(d, body, req, res).catch(() => end(res))
      else if (req.url === '/ping') end(res, JSON.stringify({ ok: true, app: 'claude-bubble' }))
      else if (req.url === '/state') { send('state', d); end(res, '{"ok":true}') }   // dev/test helper
      else end(res)
    })
  })
  server.on('error', e => onError && onError(e))
  server.listen(PORT, '127.0.0.1')

  return {
    // the user answered (or chose "Terminal") in the widget
    answer(obj) {
      const sid = obj.session || 'default'
      const p = pending.get(sid); if (!p) return
      pending.delete(sid)
      const body = obj.answers ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest',
        decision: { behavior: 'allow', updatedInput: { ...p.input, answers: obj.answers } } } }) : ''
      p.ress.forEach(r => end(r, body))   // empty reply -> Claude falls back to its normal terminal prompt
    },
    close() { server.close() }
  }
}

module.exports = { start, PORT }
