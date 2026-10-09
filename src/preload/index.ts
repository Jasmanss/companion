import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AgentEvent, AlertView, CompanionAPI, DockState, Mood, SessionView, TrayItem } from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: CompanionAPI = {
  dock: {
    expand: () => ipcRenderer.invoke('dock:expand'),
    collapse: () => ipcRenderer.invoke('dock:collapse'),
    hide: () => ipcRenderer.invoke('dock:hide'),
    view: () => ipcRenderer.invoke('dock:view'),
    setPinned: (pinned) => ipcRenderer.invoke('dock:pin', pinned),
    onState: (cb) => subscribe<DockState>('dock:state', cb),
  },
  tray: {
    list: () => ipcRenderer.invoke('tray:list'),
    addPaths: (paths) => ipcRenderer.invoke('tray:addPaths', paths),
    addUrl: (url, source) => ipcRenderer.invoke('tray:addUrl', url, source),
    addBytes: (data, mime, name) => ipcRenderer.invoke('tray:addBytes', data, mime, name),
    remove: (id) => ipcRenderer.invoke('tray:remove', id),
    clear: () => ipcRenderer.invoke('tray:clear'),
    startDrag: (ids) => ipcRenderer.send('tray:startDrag', ids),
    dragEnded: () => ipcRenderer.send('tray:dragEnded'),
    saveToProject: (ids) => ipcRenderer.invoke('tray:saveToProject', ids),
    reveal: (path) => ipcRenderer.invoke('tray:reveal', path),
    onChanged: (cb) => subscribe<TrayItem[]>('tray:changed', cb),
    pathForFile: (file) => webUtils.getPathForFile(file),
  },
  agent: {
    send: (text) => ipcRenderer.invoke('agent:send', text),
    approve: (id, approved) => ipcRenderer.invoke('agent:approve', id, approved),
    cancel: () => ipcRenderer.invoke('agent:cancel'),
    reset: () => ipcRenderer.invoke('agent:reset'),
    onEvent: (cb) => subscribe<AgentEvent>('agent:event', cb),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),
    setUnsplashKey: (key) => ipcRenderer.invoke('settings:setUnsplashKey', key),
    addProject: () => ipcRenderer.invoke('settings:addProject'),
    addProjectPath: (path) => ipcRenderer.invoke('settings:addProjectPath', path),
    removeProject: (path) => ipcRenderer.invoke('settings:removeProject', path),
    setCurrentProject: (path) => ipcRenderer.invoke('settings:setCurrentProject', path),
    setAllowlist: (list) => ipcRenderer.invoke('settings:setAllowlist', list),
    suggestProjects: () => ipcRenderer.invoke('settings:suggestProjects'),
  },
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    dismiss: (id) => ipcRenderer.invoke('sessions:dismiss', id),
    onChanged: (cb) => subscribe<SessionView[]>('sessions:changed', cb),
  },
  alerts: {
    onShow: (cb) => subscribe<AlertView[]>('alerts:show', cb),
    onMood: (cb) => subscribe<Mood | null>('alerts:mood', cb),
  },
  claude: {
    status: () => ipcRenderer.invoke('claude:status'),
    preview: () => ipcRenderer.invoke('claude:preview'),
    connect: () => ipcRenderer.invoke('claude:connect'),
    disconnect: () => ipcRenderer.invoke('claude:disconnect'),
  },
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
}

contextBridge.exposeInMainWorld('companion', api)
