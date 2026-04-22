import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';

if (started) {
  app.quit();
}

// Pin the app name + userData path so dev and packaged builds use the
// same directory. In packaged builds Electron reads productName from
// Info.plist; in dev it would otherwise fall back to the npm `name`
// field ("cartoon-studio") and split state across two dirs.
app.setName('Cartoon Studio');
app.setPath('userData', path.join(app.getPath('appData'), 'Cartoon Studio'));

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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
