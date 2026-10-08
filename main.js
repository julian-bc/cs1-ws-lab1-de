const { app, BrowserWindow } = require('electron');
// app, which controls your application's event lifecycle.
// BrowserWindow, which creates and manages app windows.

const createWindow = () => {
// The createWindow() function loads your web page into a new BrowserWindow instance
  const win = new BrowserWindow({
    width: 800,
    height: 600
  });

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
