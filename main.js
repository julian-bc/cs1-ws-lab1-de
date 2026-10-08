const { app, BrowserWindow, ipcMain } = require('electron');
// app, which controls your application's event lifecycle.
// BrowserWindow, which creates and manages app windows.
const path = require('node:path');

try { process.loadEnvFile(path.join(__dirname, '.env')) } catch {}

const API_BASE = 'https://cs1-ws-lab1-guhsfnbgecejg8ed.brazilsouth-01.azurewebsites.net';
const ENDPOINTS = {
  mnist: '/mnist',
  catsdogs: '/catsdogs'
};

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp'
];

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

ipcMain.handle('api:predict', async (_e, { endpoint, name, type, bytes }) => {
  const route = ENDPOINTS[endpoint];
  
  if (!route) {
    throw new Error('Servicio desconocido.');
  }

  if (!ALLOWED_TYPES.includes(type)) {
    throw new Error('Formato no admitido. Usa PNG, JPG, WEBP o BMP.');
  }

  if (!bytes || bytes.byteLength === 0) {
    throw new Error('El archivo está vacío.');
  }

  if (bytes.byteLength > MAX_BYTES) {
    throw new Error('La imagen supera los 5 MB.');
  }

  const key = process.env.FUNCTION_KEY;

  if (!key) {
    throw new Error('Falta la variable FUNCTION_KEY.');
  }

  const form = new FormData();

  form.append(
    'image',
    new Blob([bytes], { type }),
    name || 'image'
  );

  const url = `${API_BASE}${route}?code=${encodeURIComponent(key)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('La Function Key fue rechazada.');
    }

    if (!response.ok) {
      throw new Error(`El servicio respondió ${response.status}.`);
    }

    return data;
  } catch (error) {
    if (error.message.includes('Function Key')) {
      throw error;
    }
    throw new Error('No se pudo conectar con el servicio.');
  }
});

const createWindow = () => {
// The createWindow() function loads your web page into a new BrowserWindow instance
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#08090e',
    title: 'CSLab',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false); 
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
