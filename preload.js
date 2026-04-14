const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a minimal, typed API to the renderer process.
 * Nothing else from Node / Electron leaks into the renderer.
 */
contextBridge.exposeInMainWorld('api', {
  getStats:      ()      => ipcRenderer.invoke('get-stats'),
  saveStats:     (s)     => ipcRenderer.invoke('save-stats', s),
  getSettings:   ()      => ipcRenderer.invoke('get-settings'),
  saveSettings:  (s)     => ipcRenderer.invoke('save-settings', s),
  setWindowHeight: (h)   => ipcRenderer.invoke('set-window-height', h),
  onWindowMoving: (cb)   => ipcRenderer.on('window-moving', () => cb()),
  quitApp:       ()      => ipcRenderer.invoke('quit-app'),
});
