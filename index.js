const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.env.NODE_ENV !== 'production') {
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
        hardResetMethod: 'exit'
    });
}

const logFilePath = path.join(app.getPath('userData'), 'status_log.txt');

function createWindow() {
    const win = new BrowserWindow({
        width: 800, // Widened to fit DevTools cleanly
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    win.loadFile('index.html');

    // FOR DEBUGGING: Opens DevTools immediately on launch
    win.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('write-status', (event, status) => {
    const timestamp = new Date().toLocaleString();
    const logMessage = `[${timestamp}] Статус: ${status}\n`;

    console.log("qqqqq logFilePath", logFilePath);


    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) {
            console.error('Ошибка записи файла:', err);
        } else {
            console.log(`Записано: ${logMessage}`);
        }
    });
});
