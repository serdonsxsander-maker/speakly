const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voxflow', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('voxflow:get-state'),
  authLogin: (payload) => ipcRenderer.invoke('voxflow:auth-login', payload),
  authGoogle: () => ipcRenderer.invoke('voxflow:auth-google'),
  authLogout: () => ipcRenderer.invoke('voxflow:auth-logout'),
  updateSettings: (patch) => ipcRenderer.invoke('voxflow:update-settings', patch),
  validateKey: (payload) => ipcRenderer.invoke('voxflow:validate-key', payload),
  setDictionary: (words) => ipcRenderer.invoke('voxflow:set-dictionary', words),
  saveCustomMode: (mode) => ipcRenderer.invoke('voxflow:save-custom-mode', mode),
  deleteCustomMode: (modeId) => ipcRenderer.invoke('voxflow:delete-custom-mode', modeId),
  deleteHistoryItem: (id) => ipcRenderer.invoke('voxflow:delete-history-item', id),
  clearHistory: () => ipcRenderer.invoke('voxflow:clear-history'),
  exportData: () => ipcRenderer.invoke('voxflow:export-data'),
  deleteAccount: () => ipcRenderer.invoke('voxflow:delete-account'),
  copyText: (text) => ipcRenderer.invoke('voxflow:copy-text', text),
  openExternal: (url) => ipcRenderer.invoke('voxflow:open-external', url),
  requestMicPermission: () => ipcRenderer.invoke('voxflow:request-mic-permission'),
  requestAccessibility: () => ipcRenderer.invoke('voxflow:request-accessibility'),
  checkPermissions: () => ipcRenderer.invoke('voxflow:check-permissions'),
  toggleRecording: () => ipcRenderer.send('voxflow:ui-toggle-recording'),
  cancelRecording: () => ipcRenderer.send('voxflow:ui-cancel-recording'),
  submitFeedback: (payload) => ipcRenderer.invoke('feedback:submit', payload),

  onOpenFeedback: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('voxflow:open-feedback', handler);
    return () => ipcRenderer.removeListener('voxflow:open-feedback', handler);
  },
  onStateUpdated: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('voxflow:state-updated', handler);
    return () => ipcRenderer.removeListener('voxflow:state-updated', handler);
  },
  onRecordingStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('voxflow:recording-status', handler);
    return () => ipcRenderer.removeListener('voxflow:recording-status', handler);
  },
  onDictationResult: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('voxflow:dictation-result', handler);
    return () => ipcRenderer.removeListener('voxflow:dictation-result', handler);
  },
  onError: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('voxflow:error', handler);
    return () => ipcRenderer.removeListener('voxflow:error', handler);
  }
});
