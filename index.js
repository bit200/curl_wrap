const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Путь к файлу логов (сохраняется в папке пользователя)
const logFilePath = path.join(app.getPath('userData'), 'status_log.txt');

function createWindow() {
    const win = new BrowserWindow({
        width: 400,
        height: 300,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    win.loadFile('index.html');
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

// Слушаем нажатия кнопок из интерфейса
ipcMain.on('write-status', (event, status) => {
    const timestamp = new Date().toLocaleString();
    const logMessage = `[${timestamp}] Статус: ${status}\n`;

    // Запись в файл (добавление в конец)
    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) {
            console.error('Ошибка записи файла:', err);
        } else {
            console.log(`Записано: ${logMessage}`);
        }
    });
});
