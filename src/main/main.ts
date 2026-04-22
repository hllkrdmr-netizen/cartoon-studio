import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';

if (started) {
  app.quit();
}

// Runtime window icon — used on Linux/Windows for the window chrome and
// the taskbar entry. macOS ignores this and uses the .icns from the app
// bundle (set via forge.config.ts packagerConfig.icon). In packaged builds
// the PNG is alongside the .icns/.ico inside the .app/.exe; in dev it's
// at ./resources/icon.png in the repo root.
const windowIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(app.getAppPath(), 'resources', 'icon.png');

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: windowIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // DevTools off by default. Open with Cmd/Ctrl+Opt+I (Electron's built-in
  // shortcut) when you need them — or set CARTOON_STUDIO_DEVTOOLS=1 to auto-open.
  if (process.env.CARTOON_STUDIO_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

app.on('ready', () => {
  // macOS dev: the dock icon comes from the running Electron binary (which
  // ships its own icon), not from packagerConfig.icon — that only applies
  // to packaged .app bundles. Override it at runtime so `npm start` shows
  // our icon too. Packaged builds get the .icns from Resources/ and don't
  // need this, but calling it is a no-op there.
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(windowIconPath);
  }
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
