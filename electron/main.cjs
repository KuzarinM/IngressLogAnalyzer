const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Обработка белого экрана при запуске
// if (require('electron-squirrel-startup')) app.quit();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Log Geo Analyzer Pro",
        icon: path.join(__dirname, '../public/favicon.ico'), // Если есть иконка
        webPreferences: {
            nodeIntegration: false, // Безопасность
            contextIsolation: true, // Безопасность
            webSecurity: false // ВАЖНО: Разрешает загрузку локальных файлов и картинок карт (иногда нужно для Leaflet в файловой системе)
        }
    });

    // Убираем верхнее меню (File, Edit...), чтобы выглядело как современное приложение
    mainWindow.setMenuBarVisibility(false);

    // В режиме разработки (npm run electron:dev) грузим локальный сервер
    // В билде (npm run electron:build) грузим файл
    const isDev = !app.isPackaged;
    
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // Открываем DevTools автоматически в деве
        // mainWindow.webContents.openDevTools(); 
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Обработка ссылок (чтобы target="_blank" открывался в браузере, а не внутри приложения)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
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