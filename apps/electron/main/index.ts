import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

let win: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null

const distElectron = join(__dirname, '../')
const dist = join(__dirname, '../renderer')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = join(dist, 'index.html')

// Determine python path
const isWin = process.platform === 'win32'
const cwd = process.cwd() // In dev, this is apps/electron

// Path to backend folder (go up two levels: apps/electron -> apps -> root, then into apps/backend)
// Actually, if cwd is apps/electron, we need to go ../../apps/backend
const backendDir = join(cwd, '../../apps/backend')

// Path to venv python executable
const venvPython = isWin
    ? join(backendDir, 'venv/Scripts/python.exe')
    : join(backendDir, 'venv/bin/python')

// Fallback to system python if venv not found (BUT prefer venv)
const pythonExec = isWin ? 'python' : 'python3'

const pythonPath = app.isPackaged
    ? join(process.resourcesPath, 'python', 'main' + (isWin ? '.exe' : ''))
    : (require('fs').existsSync(venvPython) ? venvPython : pythonExec)

function startPythonBackend() {
    try {
        if (app.isPackaged) {
            // In prod, spawn the binary
            pythonProcess = spawn(pythonPath, [], {
                env: { ...process.env, PORT: '8765' }
            })
        } else {
            // In dev, run main.py
            const scriptPath = join(backendDir, 'main.py')
            console.log('[Electron] Python Path:', pythonPath)
            console.log('[Electron] Script Path:', scriptPath)
            console.log('[Electron] CWD:', backendDir)

            pythonProcess = spawn(pythonPath, [scriptPath], {
                cwd: backendDir,
                env: { ...process.env, PORT: '8765', PYTHONUNBUFFERED: '1' }
            })
        }

        pythonProcess.stdout?.on('data', (data) => {
            console.log(`[Python]: ${data}`)
        })

        pythonProcess.stderr?.on('data', (data) => {
            console.error(`[Python Err]: ${data}`)
        })

        pythonProcess.on('error', (err) => {
            console.error('[Python Process Error]:', err)
        })

        pythonProcess.on('close', (code) => {
            console.log(`Python process exited with code ${code}`)
        })
    } catch (e) {
        console.error('[Electron] Failed to start Python backend:', e)
    }
}

async function createWindow() {
    startPythonBackend()

    win = new BrowserWindow({
        title: 'Teacher Duty Scheduler',
        width: 1200,
        height: 800,
        webPreferences: {
            preload: join(distElectron, 'preload/index.js'),
            nodeIntegration: true,
            contextIsolation: true,
        },
    })

    if (url) {
        win.loadURL(url)
        win.webContents.openDevTools()
    } else {
        win.loadFile(indexHtml)
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) shell.openExternal(url)
        return { action: 'deny' }
    })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    win = null
    if (pythonProcess) {
        pythonProcess.kill()
    }
    if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
    if (pythonProcess) {
        pythonProcess.kill()
    }
})
