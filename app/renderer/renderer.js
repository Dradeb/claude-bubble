const { animate, stagger } = Motion
const $ = s => document.querySelector(s)
const anchor = $('#anchor'), stack = $('#stack'), card = $('#card'), pill = $('#pill'), orb = $('#orb'), label = $('#label'), gear = $('#gear'), settings = $('#settings')
const fin = a => (a && a.finished) || a
const SPRING = { type: 'spring', stiffness: 380, damping: 26 }

const svg = (inner, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}">${inner}</svg>`
const ICON = {
  idle: svg('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>', 'spark'),
  thinking: svg('<circle cx="12" cy="12" r="11" stroke-dasharray="18 52"/>', 'ring') + svg('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>', 'spark'),
  done: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'tick').replace('class="tick"', '').replace('<path', '<path class="tick"'),
  attention: svg('<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 21h4"/>'),
  ask: svg('<path d="M9.2 9a3 3 0 115.2 2c-.9.9-2.4 1.4-2.4 3"/><path d="M12 17.5v.01"/>')
}
const COLOR = { idle: 'var(--ink)', thinking: '#f25c4e', done: '#2ed8a3', attention: '#ffb840', ask: '#6c63ff' }
const TICK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
const OPT_COLORS = ['#f25c4e', '#6c63ff', '#ffb840', '#2ed8a3']

let cfg = { fx: 1, fy: 1, size: 1, theme: 'auto' }
let state = 'idle'
let ask = null
let doneTimer = null
let cardToken = 0
let labelOpen = false

// ---------- theme ----------
const mq = window.matchMedia('(prefers-color-scheme: dark)')
function applyTheme() {
  const t = cfg.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : cfg.theme
  document.documentElement.dataset.theme = t
}
mq.onchange = applyTheme

// ---------- position ----------
function applyCfg() {
  anchor.style.setProperty('--fx', cfg.fx)
  anchor.style.setProperty('--fy', cfg.fy)
  anchor.style.setProperty('--scale', cfg.size)
  applyTheme()
  stack.classList.toggle('a-start', cfg.fx < .34)
  stack.classList.toggle('a-end', cfg.fx > .66)
  stack.classList.toggle('a-center', cfg.fx >= .34 && cfg.fx <= .66)
  stack.classList.toggle('below', cfg.fy < .5)
}

// ---------- click-through: only the widget itself catches the mouse ----------
let ignoring = true, lock = false
document.addEventListener('mousemove', e => {
  if (lock) return
  const hit = !!e.target.closest('.hit')
  if (ignoring === hit) { ignoring = !hit; api.setIgnore(ignoring) }
})
document.addEventListener('pointerdown', e => { if (e.target.closest('input[type=range]')) lock = true })
window.addEventListener('pointerup', () => { lock = false })

// ---------- pill label (width spring) ----------
async function setLabel(html) {
  const span = label.firstElementChild
  const from = label.offsetWidth
  if (!html) {
    if (!labelOpen) return
    labelOpen = false
    await fin(animate(label, { width: [from + 'px', '0px'] }, { duration: .22, ease: 'easeInOut' }))
    return
  }
  span.innerHTML = html
  label.style.width = 'auto'
  const to = label.offsetWidth
  label.style.width = from + 'px'
  labelOpen = true
  animate(label, { width: [from + 'px', to + 'px'] }, { type: 'spring', duration: .5, bounce: .25 })
    .then?.(() => { if (labelOpen) label.style.width = 'auto' })
}

// ---------- state ----------
const sessions = new Map()   // id -> { id, name, state, msg, ask, ts }
const PRIO = ['idle', 'done', 'thinking', 'attention', 'ask']   // ascending priority for the orb
const DOT = { idle: '#cfc6bf', thinking: '#f25c4e', done: '#2ed8a3', attention: '#ffb840', ask: '#6c63ff' }
const ROW_TEXT = { idle: 'Idle', thinking: 'Working', done: 'Answered', attention: 'Needs you', ask: 'Question' }
const listEl = $('#sessions')
let shown = null, noticeSid = null

function getS(id, name) {
  id = id || 'default'
  let s = sessions.get(id)
  if (!s) { s = { id, name: name || 'session', state: 'idle', msg: '', ask: null }; sessions.set(id, s) }
  if (name) s.name = name
  s.ts = Date.now()
  return s
}

function refresh() {
  let s = 'idle'
  for (const x of sessions.values()) if (PRIO.indexOf(x.state) > PRIO.indexOf(s)) s = x.state
  const n = sessions.size, cnt = [...sessions.values()].filter(x => x.state === s).length
  const key = [s, n, cnt].join('|')
  if (key !== shown) { shown = key; renderOrb(s, n, cnt) }
  renderList()
}

function renderOrb(s, n, cnt) {
  state = s
  clearTimeout(doneTimer)
  orb.dataset.s = s
  orb.style.background = COLOR[s]
  orb.innerHTML = ICON[s] + (n > 1 ? `<span class="badge">${n}</span>` : '')
  animate(orb, { scale: [.55, 1] }, { type: 'spring', stiffness: 520, damping: 13 })
  const many = cnt > 1
  const L = {
    idle: null,
    thinking: (many ? cnt + ' working' : 'Thinking') + '<span class="dots"><i></i><i></i><i></i></span>',
    done: many ? cnt + ' answered' : 'Answered',
    attention: many ? cnt + ' need you' : 'Needs you',
    ask: many ? cnt + ' questions' : 'Question'
  }
  setLabel(L[s])
  if (s === 'done') doneTimer = setTimeout(() => { if (state === 'done') setLabel(null) }, 4000)
}

function renderList() {
  const arr = [...sessions.values()]
  if (arr.length < 2) { listEl.hidden = true; return }
  const seen = {}
  listEl.innerHTML = ''
  arr.forEach(s => {
    const dup = arr.filter(x => x.name === s.name).length > 1
    seen[s.name] = (seen[s.name] || 0) + 1
    const r = document.createElement('button')
    r.className = 'srow-s'; r.dataset.s = s.state
    r.innerHTML = `<i class="d" style="background:${DOT[s.state]}"></i><b></b><span>${ROW_TEXT[s.state]}</span>`
    r.querySelector('b').textContent = s.name + (dup ? ' #' + seen[s.name] : '')
    r.onclick = () => rowClick(s)
    listEl.appendChild(r)
  })
  if (listEl.hidden) { listEl.hidden = false; animate(listEl, { opacity: [0, 1], y: [8, 0] }, SPRING) }
}

function focusTerm(s) { if (s && s.hwnd) api.focusTerminal(s.hwnd) }

function rowClick(s) {
  if (s.ask) { ask = s.ask; renderQ(true); return }
  if (s.state === 'done' || s.state === 'attention') { s.state = 'idle'; if (noticeSid === s.id) { noticeSid = null; closeCard() } }
  focusTerm(s); refresh()
}

setInterval(() => {   // drop sessions that went silent (crashed without SessionEnd)
  for (const [id, s] of sessions) if (!s.ask && Date.now() - s.ts > 3 * 3600e3) sessions.delete(id)
  refresh()
}, 60e3)

// ---------- card open/close ----------
async function openCard(build) {
  const t = ++cardToken
  if (!card.hidden) await closeCard(false)
  if (t !== cardToken) return
  card.innerHTML = ''
  build(card)
  card.hidden = false
  const dir = stack.classList.contains('below') ? -14 : 14
  animate(card, { opacity: [0, 1], scale: [.88, 1], y: [dir, 0] }, SPRING)
  animate(card.querySelectorAll('.opt'), { opacity: [0, 1], x: [-10, 0] }, { delay: stagger(.05, { startDelay: .08 }), duration: .3 })
}
async function closeCard(bump = true) {
  if (bump) cardToken++
  if (card.hidden) return
  await fin(animate(card, { opacity: 0, scale: .94 }, { duration: .15 }))
  card.hidden = true
}

// ---------- notice card ----------
function showNotice(s) {
  noticeSid = s.id
  openCard(c => {
    c.innerHTML = `<span class="chip" style="color:#b57a00;background:#ffb84022"></span>
      <p class="note"></p>
      <div class="foot"><div class="btns"><button class="btn dark" id="dismiss">Dismiss</button></div></div>`
    c.querySelector('.chip').textContent = sessions.size > 1 ? s.name + ' · Heads up' : 'Heads up'
    c.querySelector('.note').textContent = s.msg || 'Claude needs your attention.'
    c.querySelector('#dismiss').onclick = () => { s.state = 'idle'; noticeSid = null; closeCard(); refresh() }
  })
}

// ---------- ask flow ----------
function startAsk(d) {
  const qs = (d && d.questions) || []
  if (!qs.length) return
  const s = getS(d.session, d.name)
  if (d.hwnd) s.hwnd = d.hwnd
  s.state = 'ask'
  s.ask = { sid: s.id, name: s.name, qs, i: 0, st: qs.map(() => ({ sel: new Set(), other: '', text: '' })) }
  if (!ask) { noticeSid = null; ask = s.ask; renderQ(true) }   // otherwise it queues behind the open question
  refresh()
}
function nextAsk() {
  const nxt = [...sessions.values()].find(x => x.ask)
  if (nxt) setTimeout(() => { ask = nxt.ask; renderQ(true) }, 250)
}

function hasAnswer(i) {
  const q = ask.qs[i], s = ask.st[i]
  return (q.options && q.options.length) ? (s.sel.size > 0 || s.other.trim()) : s.text.trim().length > 0
}

function questionDom(i) {
  const q = ask.qs[i], s = ask.st[i], last = i === ask.qs.length - 1
  const w = document.createElement('div')
  const tag = [ask.qs && sessions.size > 1 ? ask.name : '', q.header].filter(Boolean).join(' · ')
  const chip = tag ? `<span class="chip"></span>` : ''
  w.innerHTML = `${chip}<h2></h2><div class="body"></div>
    <div class="foot">
      <div class="dotsnav">${ask.qs.length > 1 ? ask.qs.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('') : ''}</div>
      <div class="btns"><button class="btn ghost" id="skip">Terminal</button><button class="btn primary" id="next">${last ? 'Submit' : 'Next'}</button></div>
    </div>`
  if (tag) w.querySelector('.chip').textContent = tag
  w.querySelector('h2').textContent = q.question
  const body = w.querySelector('.body'), next = w.querySelector('#next')
  const refresh = () => { next.disabled = !hasAnswer(i) }

  if (q.options && q.options.length) {
    const list = document.createElement('div'); list.className = 'opts'
    q.options.forEach((o, k) => {
      const b = document.createElement('button')
      b.className = 'opt' + (q.multiSelect ? ' multi' : '') + (s.sel.has(o.label) ? ' sel' : '')
      b.innerHTML = `<span class="ico" style="background:${OPT_COLORS[k % 4]}"></span>
        <span class="t"><b></b><small></small></span><span class="mark">${TICK}</span>`
      b.querySelector('.ico').textContent = (o.label || '?').trim().charAt(0).toUpperCase()
      b.querySelector('b').textContent = o.label
      if (o.description) b.querySelector('small').textContent = o.description; else b.querySelector('small').remove()
      b.onclick = () => {
        if (q.multiSelect) { s.sel.has(o.label) ? s.sel.delete(o.label) : s.sel.add(o.label) }
        else { s.sel.clear(); s.sel.add(o.label); s.other = ''; other.value = '' }
        list.querySelectorAll('.opt').forEach((el, j) => el.classList.toggle('sel', s.sel.has(q.options[j].label)))
        animate(b, { scale: [.97, 1] }, { type: 'spring', stiffness: 600, damping: 18 })
        refresh()
      }
      list.appendChild(b)
    })
    body.appendChild(list)
    var other = document.createElement('input')
    other.className = 'field'; other.placeholder = 'Something else…'; other.value = s.other
    other.oninput = () => { s.other = other.value; if (!q.multiSelect && other.value) { s.sel.clear(); list.querySelectorAll('.opt').forEach(el => el.classList.remove('sel')) } refresh() }
    other.onkeydown = e => { if (e.key === 'Enter' && !next.disabled) next.click() }
    body.appendChild(other)
  } else {
    const t = document.createElement('textarea')
    t.className = 'field'; t.placeholder = 'Type your answer…'; t.value = s.text
    t.oninput = () => { s.text = t.value; refresh() }
    t.onkeydown = e => { if (e.key === 'Enter' && e.ctrlKey && !next.disabled) next.click() }
    body.appendChild(t)
    setTimeout(() => t.focus(), 250)
  }

  next.onclick = () => (last ? submitAsk() : go(i + 1))
  w.querySelector('#skip').onclick = skipAsk
  refresh()
  return w
}

function renderQ(first) {
  if (first) openCard(c => c.appendChild(questionDom(ask.i)))
}
async function go(i) {
  await fin(animate(card, { opacity: 0, x: -16 }, { duration: .12 }))
  ask.i = i
  card.innerHTML = ''; card.appendChild(questionDom(i))
  animate(card, { opacity: [0, 1], x: [16, 0] }, SPRING)
  animate(card.querySelectorAll('.opt'), { opacity: [0, 1], x: [-10, 0] }, { delay: stagger(.04), duration: .25 })
}
function submitAsk() {
  const answers = {}
  ask.qs.forEach((q, i) => {
    const s = ask.st[i]
    if (q.options && q.options.length) {
      const sel = [...s.sel]; const o = s.other.trim()
      if (o) { if (q.multiSelect) sel.push(o); else sel.splice(0, sel.length, o) }
      answers[q.question] = sel.join(', ')
    } else answers[q.question] = s.text.trim()
  })
  api.answer({ session: ask.sid, answers }); endAsk()
}
function skipAsk() { const s = sessions.get(ask.sid); api.answer({ session: ask.sid, skip: true }); endAsk(); focusTerm(s) }
function endAsk() {
  const s = sessions.get(ask.sid)
  if (s) { s.ask = null; s.state = 'thinking' }
  ask = null; closeCard(); nextAsk(); refresh()
}

// ---------- window fitting: the OS window hugs the widget; full-screen only while dragging / in settings ----------
const PAD = 40, html = document.documentElement
let lastBox = ''
function boxSize() {
  const R = anchor.getBoundingClientRect()
  return { w: Math.ceil(Math.max(R.width, 300 * cfg.size)) + 2 * PAD, h: Math.ceil(R.height) + 2 * PAD }
}
function fit() {
  if (html.classList.contains('full')) return
  const b = boxSize(), k = b.w + 'x' + b.h
  if (k === lastBox) return
  lastBox = k
  api.layout({ full: false, ...b })
}
let fitQueued = false
new ResizeObserver(() => { if (!fitQueued) { fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fit() }) } }).observe(stack)
async function enterFull() {
  if (html.classList.contains('full')) return
  await api.layout({ full: true })
  html.classList.add('full')
}
async function leaveFull() {
  const b = boxSize()
  lastBox = b.w + 'x' + b.h
  await api.layout({ full: false, ...b })
  html.classList.remove('full')
}

// ---------- settings (size + theme) ----------
async function openSettings() {
  await enterFull()
  settings.innerHTML = `<span class="chip">Settings</span><h2 style="margin-bottom:4px">Appearance</h2>
    <p class="hint">Drag the bubble anywhere to move it.</p>
    <div class="srow"><label>Size <span id="vs"></span></label><input type="range" id="ss" min="70" max="150" step="5"></div>
    <div class="srow"><label>Theme</label><div class="seg" id="seg">
      <button data-t="light">Light</button><button data-t="dark">Dark</button><button data-t="auto">Auto</button></div></div>
    <div class="srow"><label>Claude Code <span id="vc">…</span></label>
      <div class="line"><span class="sub" id="cmsg">Shows when Claude works, answers or asks you something.</span><button class="btn primary" id="conn">Connect</button></div></div>
    <div class="srow line"><label style="margin:0">Launch at login</label><button class="sw" id="login" aria-label="Launch at login"></button></div>
    <div class="foot" style="margin-top:20px"><button class="btn dark" id="quit">Quit</button>
      <div class="btns"><button class="btn ghost" id="reset">Reset position</button><button class="btn primary" id="done">Done</button></div></div>`
  const ss = settings.querySelector('#ss'), vs = settings.querySelector('#vs'), seg = settings.querySelector('#seg')
  const sync = () => {
    ss.value = Math.round(cfg.size * 100)
    ss.style.setProperty('--v', ((ss.value - 70) / 80 * 100) + '%')
    vs.textContent = ss.value + '%'
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === cfg.theme))
  }
  ss.oninput = () => { cfg.size = ss.value / 100; applyCfg(); sync(); api.setConfig({ size: cfg.size }) }
  seg.onclick = e => { const t = e.target.dataset && e.target.dataset.t; if (t) { cfg.theme = t; applyCfg(); sync(); api.setConfig({ theme: t }) } }
  settings.querySelector('#reset').onclick = () => { cfg.fx = 1; cfg.fy = 1; applyCfg(); api.setConfig({ fx: 1, fy: 1 }) }
  settings.querySelector('#done').onclick = closeSettings
  settings.querySelector('#quit').onclick = () => api.quit()
  const conn = settings.querySelector('#conn'), vc = settings.querySelector('#vc'), cmsg = settings.querySelector('#cmsg')
  const refreshConn = async res => {
    const s = res || await api.integrationStatus()
    vc.textContent = s.connected ? 'Connected' : 'Not connected'
    vc.style.color = s.connected ? '#1fa97d' : ''
    conn.textContent = s.connected ? 'Disconnect' : 'Connect'
    conn.className = 'btn ' + (s.connected ? 'ghost' : 'primary'); conn.dataset.c = s.connected ? '1' : ''
    cmsg.textContent = s.error || (s.connected ? 'New Claude Code sessions will report here.' : 'Adds hooks to ~/.claude/settings.json (backed up).')
    const plugin = s.via === 'plugin'
    conn.hidden = plugin
    if (plugin) { vc.textContent = 'Connected (plugin)'; cmsg.textContent = 'The Claude Code plugin provides the hooks.' }
  }
  conn.onclick = async () => { conn.disabled = true; await refreshConn(await api.integrationSet(!conn.dataset.c)); conn.disabled = false }
  refreshConn()
  const sw = settings.querySelector('#login')
  api.loginGet().then(l => { sw.classList.toggle('on', l.on) })
  sw.onclick = () => { const on = !sw.classList.contains('on'); sw.classList.toggle('on', on); api.loginSet(on) }
  sync()
  settings.hidden = false
  settings.style.margin = `${-settings.offsetHeight / 2}px 0 0 ${-settings.offsetWidth / 2}px`
  animate(settings, { opacity: [0, 1], scale: [.9, 1] }, SPRING)
}
async function closeSettings() {
  await fin(animate(settings, { opacity: 0, scale: .94 }, { duration: .15 }))
  settings.hidden = true
  await leaveFull()
}

// ---------- drag the pill anywhere (screen coordinates, window goes full-screen while dragging) ----------
let drag = null, justDragged = false
pill.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('#gear')) return
  lock = true
  const r = pill.getBoundingClientRect()
  drag = { x: e.screenX, y: e.screenY, cx: e.clientX, cy: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, on: false, ready: false, wasFull: html.classList.contains('full') }
  pill.setPointerCapture(e.pointerId)
})
pill.addEventListener('pointermove', async e => {
  if (!drag) return
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 6) return
    drag.on = true
    document.documentElement.classList.add('dragging')   // hides card/list so the anchor is just the pill
    drag.entering = enterFull().then(() => { drag.ready = true })
  }
  if (!drag.ready) return
  const m = 20, R = anchor.getBoundingClientRect()
  const aL = screen.availLeft || 0, aT = screen.availTop || 0
  const W = screen.availWidth - 2 * m - R.width, H = screen.availHeight - 2 * m - R.height
  // pill's top-left in screen coords = pointer minus where inside the pill it was grabbed
  cfg.fx = Math.min(1, Math.max(0, (e.screenX - drag.gx - aL - m) / W))
  cfg.fy = Math.min(1, Math.max(0, (e.screenY - drag.gy - aT - m) / H))
  applyCfg()
})
async function endDrag() {
  const d = drag; if (!d) return
  drag = null
  if (d.on) {
    await d.entering
    api.setConfig({ fx: cfg.fx, fy: cfg.fy })
    justDragged = true; setTimeout(() => (justDragged = false), 0)
    document.documentElement.classList.remove('dragging')
    if (!settings.hidden) { lock = false; return }   // settings still open -> stay full-screen
    await leaveFull()
  }
  lock = false
}
pill.addEventListener('pointerup', endDrag)
pill.addEventListener('pointercancel', endDrag)

// ---------- wiring ----------
gear.innerHTML = svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>')
gear.onclick = e => { e.stopPropagation(); settings.hidden ? openSettings() : closeSettings() }
pill.oncontextmenu = e => { e.preventDefault(); settings.hidden ? openSettings() : closeSettings() }
pill.onclick = () => {
  if (justDragged) return
  if (ask) { card.hidden ? renderQ(true) : closeCard(); return }
  // Jump to the terminal of the most relevant session: one that finished / needs you first (and clear that flag),
  // then one that is working, then any other; most recently active wins ties.
  const rank = x => (x.state === 'done' || x.state === 'attention') ? 2 : x.state === 'thinking' ? 1 : 0
  const ordered = [...sessions.values()].sort((a, b) => rank(b) - rank(a) || b.ts - a.ts)
  const s = ordered[0]
  if (!s) return
  if (s.state === 'done' || s.state === 'attention') {
    s.state = 'idle'
    if (noticeSid === s.id) { noticeSid = null; closeCard() }
  }
  focusTerm(s.hwnd ? s : ordered.find(x => x.hwnd))   // terminal not known for the top session -> fall back to one that is
  refresh()
}

api.onState(d => {
  const id = d.session || 'default'
  if (d.state === 'end') {
    const hadCard = ask && ask.sid === id
    sessions.delete(id)                      // delete first so nextAsk() can't pick this session again
    if (hadCard) { ask = null; closeCard(); nextAsk() }
    if (noticeSid === id) { noticeSid = null; closeCard() }
    refresh(); return
  }
  const s = getS(id, d.name)
  if (d.hwnd) s.hwnd = d.hwnd
  if (s.ask || !['thinking', 'done', 'idle', 'attention'].includes(d.state)) return
  s.state = d.state; s.msg = d.message || ''
  if (d.state === 'attention') { if (!ask && (card.hidden || noticeSid)) showNotice(s) }
  else if (noticeSid === id) { noticeSid = null; closeCard() }
  refresh()
})
api.onAsk(startAsk)
api.onAskCancel(sid => {
  const s = sessions.get(sid)
  if (s) { s.ask = null; s.state = 'idle' }
  if (ask && ask.sid === sid) { ask = null; closeCard(); nextAsk() }
  refresh()
})

api.getConfig().then(async c => {
  cfg = { ...cfg, ...c }; applyCfg()
  const s = await api.integrationStatus()
  if (!s.connected && !cfg.onboarded) { cfg.onboarded = true; api.setConfig({ onboarded: true }); openSettings() }   // first run: offer to connect
})
api.onOpenSettings(() => { if (settings.hidden) openSettings() })
applyCfg(); refresh()
