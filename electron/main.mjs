import { app, BrowserWindow, dialog } from 'electron';

let mainWindow;
let serverStarted = false;

async function startBackend() {
  process.env.NODE_ENV = 'production';
  process.env.PORT = '32145';
  await import('../server.mjs');
  serverStarted = true;
}

async function waitForBackend() {
  const url = 'http://127.0.0.1:32145';
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return url;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Локальный сервер Sona не запустился.');
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    title: 'Sona',
    backgroundColor: '#080808',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const url = await waitForBackend();
  await mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    await createWindow();
  } catch (error) {
    dialog.showErrorBox('Не удалось запустить Sona', String(error));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(() => app.quit());
});
