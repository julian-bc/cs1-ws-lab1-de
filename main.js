const { app, BrowserWindow, ipcMain, session } = require('electron');
// app, which controls your application's event lifecycle.
// BrowserWindow, which creates and manages app windows.
const path = require('node:path');
const crypto = require('node:crypto');

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

const EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/bmp': 'bmp'
};

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Pon DEBUG_API=1 en tu .env (o en la terminal) para ver los logs de cada petición
const DEBUG = process.env.DEBUG_API === '1' || !app.isPackaged;

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

  // Copia limpia de los bytes (evita problemas con vistas/offsets del IPC)
  const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);

  // Nombre único con extensión acorde al tipo: nada puede coincidir con una petición anterior
  const ext = EXTENSIONS[type];
  const base = (name || 'image').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_') || 'image';
  const uniqueName = `${base}-${Date.now()}.${ext}`;

  const form = new FormData();

  form.append(
    'image',
    new Blob([buffer], { type }),
    uniqueName
  );

  // `_t` evita cualquier caché intermedia que use la URL como llave
  const url = `${API_BASE}${route}?code=${encodeURIComponent(key)}&_t=${Date.now()}`;

  if (DEBUG) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    console.log(`[predict] ${endpoint} | ${uniqueName} | ${type} | ${buffer.length} bytes | sha256:${hash}`);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const text = await response.text();

    if (DEBUG) {
      console.log(`[predict] ${endpoint} <- ${response.status} | ${text.slice(0, 300)}`);
    }

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
    if (error.message.includes('Function Key') || error.message.includes('El servicio respondió')) {
      throw error;
    }
    if (DEBUG) console.error('[predict] error de red:', error);
    throw new Error('No se pudo conectar con el servicio.');
  }
});

const createWindow = () => {
// The createWindow() function loads your web page into a new BrowserWindow instance
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 1000,
    minHeight: 720,
    backgroundColor: '#08090e',
    title: 'CSLab',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  // win.setMenuBarVisibility(false); 
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  // Solo se permite el acceso a la cámara (media); el resto se deniega
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media';
  });

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