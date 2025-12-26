"use strict";
const electron = require("electron");
const node_os = require("node:os");
const node_path = require("node:path");
const node_child_process = require("node:child_process");
if (node_os.release().startsWith("6.1")) electron.app.disableHardwareAcceleration();
if (process.platform === "win32") electron.app.setAppUserModelId(electron.app.getName());
if (!electron.app.requestSingleInstanceLock()) {
  electron.app.quit();
  process.exit(0);
}
let win = null;
let pythonProcess = null;
const distElectron = node_path.join(__dirname, "../");
const dist = node_path.join(__dirname, "../renderer");
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = node_path.join(dist, "index.html");
const isWin = process.platform === "win32";
const pythonExec = isWin ? "python" : "python3";
const venvPath = node_path.join(__dirname, "../../backend", isWin ? "venv/Scripts/python.exe" : "venv/bin/python");
const pythonPath = electron.app.isPackaged ? node_path.join(process.resourcesPath, "python", "main" + (isWin ? ".exe" : "")) : require("fs").existsSync(venvPath) ? venvPath : pythonExec;
function startPythonBackend() {
  var _a, _b;
  try {
    if (electron.app.isPackaged) {
      pythonProcess = node_child_process.spawn(pythonPath, [], {
        env: { ...process.env, PORT: "8765" }
      });
    } else {
      const scriptPath = node_path.join(__dirname, "../../backend/main.py");
      const cwd = node_path.join(__dirname, "../../backend");
      console.log("[Electron] Python Path:", pythonPath);
      console.log("[Electron] Script Path:", scriptPath);
      console.log("[Electron] CWD:", cwd);
      pythonProcess = node_child_process.spawn(pythonPath, [scriptPath], {
        cwd,
        env: { ...process.env, PORT: "8765", PYTHONUNBUFFERED: "1" }
      });
    }
    (_a = pythonProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
      console.log(`[Python]: ${data}`);
    });
    (_b = pythonProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
      console.error(`[Python Err]: ${data}`);
    });
    pythonProcess.on("error", (err) => {
      console.error("[Python Process Error]:", err);
    });
    pythonProcess.on("close", (code) => {
      console.log(`Python process exited with code ${code}`);
    });
  } catch (e) {
    console.error("[Electron] Failed to start Python backend:", e);
  }
}
async function createWindow() {
  startPythonBackend();
  win = new electron.BrowserWindow({
    title: "Teacher Duty Scheduler",
    width: 1200,
    height: 800,
    webPreferences: {
      preload: node_path.join(distElectron, "preload/index.js"),
      nodeIntegration: true,
      contextIsolation: true
    }
  });
  if (url) {
    win.loadURL(url);
    win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }
  win.webContents.setWindowOpenHandler(({ url: url2 }) => {
    if (url2.startsWith("https:")) electron.shell.openExternal(url2);
    return { action: "deny" };
  });
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  win = null;
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
