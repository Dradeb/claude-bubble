const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  onState: cb => ipcRenderer.on('state', (_e, d) => cb(d)),
  onAsk: cb => ipcRenderer.on('ask', (_e, d) => cb(d)),
  onAskCancel: cb => ipcRenderer.on('ask-cancel', (_e, sid) => cb(sid)),
  answer: obj => ipcRenderer.send('answer', obj),
  layout: o => ipcRenderer.invoke('layout', o),
  setIgnore: v => ipcRenderer.send('ignore', v),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: patch => ipcRenderer.send('config:set', patch),
  onOpenSettings: cb => ipcRenderer.on('open-settings', () => cb()),
  integrationStatus: () => ipcRenderer.invoke('integration:status'),
  integrationSet: on => ipcRenderer.invoke('integration:set', on),
  loginGet: () => ipcRenderer.invoke('login:get'),
  loginSet: on => ipcRenderer.send('login:set', on),
  focusTerminal: hwnd => ipcRenderer.send('focus-terminal', hwnd),
  quit: () => ipcRenderer.send('quit')
})
