const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app-version'),
  
  // Dialog methods
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  
  // Menu events listeners
  onMenuStartRecording: (callback) => ipcRenderer.on('menu-start-recording', callback),
  onMenuStopRecording: (callback) => ipcRenderer.on('menu-stop-recording', callback),
  
  onServerError: (callback) => ipcRenderer.on('server-error', callback),
  onServerStatusChanged: (callback) => ipcRenderer.on('server-status-changed', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Platform info
  platform: process.platform
})

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency])
  }
})