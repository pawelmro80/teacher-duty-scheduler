"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  send: (channel, args) => electron.ipcRenderer.send(channel, args),
  on: (channel, func) => {
    const subscription = (_event, ...args) => func(...args);
    electron.ipcRenderer.on(channel, subscription);
    return () => electron.ipcRenderer.removeListener(channel, subscription);
  }
});
