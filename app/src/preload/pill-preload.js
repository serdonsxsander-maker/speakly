const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pillBridge', {
  platform: process.platform,
  toggleRecording: () => ipcRenderer.send('voxflow:ui-toggle-recording'),
  cancelRecording: () => ipcRenderer.send('voxflow:ui-cancel-recording'),
  openDashboard: () => ipcRenderer.send('voxflow:open-dashboard'),
  sendAudioCaptured: (payload) => ipcRenderer.send('voxflow:audio-captured', payload),
  sendCaptureError: (msg) => ipcRenderer.send('voxflow:capture-error', msg),

  onStateSync: (cb) => {
    ipcRenderer.on('voxflow:state-sync', (_e, state) => cb(state));
  },
  onStartCapture: (cb) => {
    ipcRenderer.on('voxflow:start-capture', (_e, opts) => cb(opts));
  },
  onStopCapture: (cb) => {
    ipcRenderer.on('voxflow:stop-capture', (_e, opts) => cb(opts));
  },
  onCancelCapture: (cb) => {
    ipcRenderer.on('voxflow:cancel-capture', (_e, opts) => cb(opts));
  },
  onToast: (cb) => {
    ipcRenderer.on('voxflow:pill-toast', (_e, data) => cb(data));
  }
});
