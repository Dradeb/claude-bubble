// Windows-only chores, done by calling the Win32 API directly (koffi FFI, prebuilt - no compile, no helper process):
//   focus(hwnd)     bring a terminal window to the front
//   resolve(port)   find the terminal window that owns the process on the other end of a loopback connection
let koffi = null
try { koffi = require('koffi') } catch (e) { console.error('winhelper: koffi not available, terminal focus disabled:', e.message) }

let w = null
function init() {
  if (w) return w
  if (!koffi) throw new Error('koffi not available')
  const user32 = koffi.load('user32.dll'), kernel32 = koffi.load('kernel32.dll'), iphlp = koffi.load('iphlpapi.dll')
  const WNDENUMPROC = koffi.proto('bool __stdcall WNDENUMPROC(uintptr_t hwnd, intptr_t lparam)')
  w = {
    WNDENUMPROC,
    IsWindow: user32.func('bool __stdcall IsWindow(uintptr_t h)'),
    IsIconic: user32.func('bool __stdcall IsIconic(uintptr_t h)'),
    ShowWindow: user32.func('bool __stdcall ShowWindow(uintptr_t h, int cmd)'),
    SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(uintptr_t h)'),
    keybd_event: user32.func('void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)'),
    EnumWindows: user32.func('bool __stdcall EnumWindows(WNDENUMPROC *cb, intptr_t lparam)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(uintptr_t h)'),
    GetWindow: user32.func('uintptr_t __stdcall GetWindow(uintptr_t h, uint32_t cmd)'),
    GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(uintptr_t h, _Out_ uint32_t *pid)'),
    CreateToolhelp32Snapshot: kernel32.func('uintptr_t __stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)'),
    Process32FirstW: kernel32.func('bool __stdcall Process32FirstW(uintptr_t snap, void *entry)'),
    Process32NextW: kernel32.func('bool __stdcall Process32NextW(uintptr_t snap, void *entry)'),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(uintptr_t h)'),
    GetExtendedTcpTable: iphlp.func('uint32_t __stdcall GetExtendedTcpTable(void *table, _Inout_ uint32_t *size, bool order, uint32_t af, int cls, uint32_t reserved)')
  }
  return w
}

// pid -> parent pid for every running process
function parentMap() {
  const api = init(), map = new Map()
  const snap = Number(api.CreateToolhelp32Snapshot(2, 0))          // TH32CS_SNAPPROCESS
  const entry = Buffer.alloc(568)                                   // PROCESSENTRY32W
  entry.writeUInt32LE(568, 0)
  if (api.Process32FirstW(snap, entry)) {
    do { map.set(entry.readUInt32LE(8), entry.readUInt32LE(32)) } while (api.Process32NextW(snap, entry))
  }
  api.CloseHandle(snap)
  return map
}

// pid -> first visible, un-owned top-level window of that process
function windowMap() {
  const api = init(), map = new Map()
  const cb = koffi.register(h => {
    if (api.IsWindowVisible(h) && Number(api.GetWindow(h, 4)) === 0) {   // GW_OWNER
      const pid = [0]; api.GetWindowThreadProcessId(h, pid)
      if (!map.has(pid[0])) map.set(pid[0], Number(h))
    }
    return true
  }, koffi.pointer(w.WNDENUMPROC))
  try { api.EnumWindows(cb, 0) } finally { koffi.unregister(cb) }
  return map
}

// pid owning the local end `localPort` of a connection to `remotePort` (IPv4)
function ownerOfConnection(localPort, remotePort) {
  const api = init()
  const size = [0]
  api.GetExtendedTcpTable(null, size, false, 2, 5, 0)              // AF_INET, TCP_TABLE_OWNER_PID_ALL
  for (let tries = 0; tries < 4; tries++) {
    const buf = Buffer.alloc(size[0] + 4096)
    size[0] = buf.length
    if (api.GetExtendedTcpTable(buf, size, false, 2, 5, 0) !== 0) continue
    const n = buf.readUInt32LE(0)
    for (let i = 0; i < n; i++) {
      const o = 4 + i * 24                                          // MIB_TCPROW_OWNER_PID
      if (buf.readUInt16BE(o + 8) === localPort && buf.readUInt16BE(o + 16) === remotePort) return buf.readUInt32LE(o + 20)
    }
    return 0
  }
  return 0
}

module.exports = {
  warm() { try { init() } catch (e) { console.error('winhelper: koffi unavailable:', e.message) } },
  focus(hwnd) {
    try {
      const api = init(), h = Number(hwnd)
      if (!Number.isFinite(h) || h <= 0 || !api.IsWindow(h)) return
      if (api.IsIconic(h)) api.ShowWindow(h, 9)                     // SW_RESTORE
      api.keybd_event(0x12, 0, 0, 0); api.keybd_event(0x12, 0, 2, 0) // tap Alt so Windows allows the focus change
      api.SetForegroundWindow(h)
    } catch (e) { console.error('winhelper.focus:', e.message) }
  },
  // first ancestor (starting at the process that opened the connection) that owns a visible window; 0 if unknown
  async resolve(port) {
    try {
      if (!port) return 0
      const pid = ownerOfConnection(port, 47800)
      if (!pid) return 0
      const parents = parentMap(), windows = windowMap()
      let id = parents.get(pid)
      for (let i = 0; i < 15 && id; i++) {
        if (windows.has(id)) return windows.get(id)
        id = parents.get(id)
      }
    } catch (e) { console.error('winhelper.resolve:', e.message) }
    return 0
  },
  stop() {}
}
