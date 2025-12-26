import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
    send: (channel: string, args: unknown[]) => ipcRenderer.send(channel, args),
    on: (channel: string, func: (...args: unknown[]) => void) => {
        const subscription = (_event: any, ...args: unknown[]) => func(...args)
        ipcRenderer.on(channel, subscription)
        return () => ipcRenderer.removeListener(channel, subscription)
    },
})
