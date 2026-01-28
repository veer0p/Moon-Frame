import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Register custom protocol for video streaming
protocol.registerSchemesAsPrivileged([
    { scheme: 'video', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } }
]);

let mainWindow;

const isDev = process.env.NODE_ENV !== 'production' || process.argv.includes('--dev');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
        },
        backgroundColor: '#0f0f23',
        title: 'Watch Together',
        show: false,
    });

    // Show window when ready to prevent flashing
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Handle file selection for videos
ipcMain.handle('select-video', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            {
                name: 'Videos',
                extensions: [
                    'mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv',
                    'flv', 'wmv', 'm4v', 'mpg', 'mpeg', '3gp',
                    'ts', 'm2ts'
                ]
            },
            { name: 'All Files', extensions: ['*'] }
        ],
        title: 'Select Video File'
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

app.whenReady().then(() => {
    // Register video protocol
    protocol.handle('video', (request) => {
        const filePath = request.url.replace('video://', '');
        // Handle Windows paths (remove leading slash if present)
        const decodedPath = decodeURIComponent(filePath);
        const finalPath = process.platform === 'win32' && decodedPath.startsWith('/')
            ? decodedPath.slice(1)
            : decodedPath;

        return net.fetch(pathToFileURL(finalPath).toString());
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
