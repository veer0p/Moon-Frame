import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, extname } from 'path';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// FFmpeg path resolution
const nodeRequire = createRequire(import.meta.url);

function getFFmpegPath() {
    if (app.isPackaged) {
        const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        return join(process.resourcesPath, binaryName);
    }
    return nodeRequire('ffmpeg-static');
}

// Formats that need remuxing (Chromium can't play these containers natively)
const REMUX_EXTENSIONS = ['.mkv', '.avi', '.flv', '.wmv', '.ts', '.m2ts', '.mpg', '.mpeg', '.3gp'];

// Track active FFmpeg processes for cleanup
const activeFFmpegProcesses = new Set();

// Register custom protocol for video streaming
protocol.registerSchemesAsPrivileged([
    { scheme: 'video', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } }
]);

// Enable HEVC hardware decoding support if available
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

let mainWindow;

const isDev = !app.isPackaged || process.argv.includes('--dev');

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

    mainWindow.on('enter-full-screen', () => {
        mainWindow.webContents.send('fullscreen-change', true);
    });

    mainWindow.on('leave-full-screen', () => {
        mainWindow.webContents.send('fullscreen-change', false);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Handle native window fullscreen toggle
ipcMain.handle('toggle-fullscreen', async () => {
    if (mainWindow) {
        const flag = !mainWindow.isFullScreen();
        mainWindow.setFullScreen(flag);
        return flag;
    }
    return false;
});

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

// Get video metadata using ffmpeg -i (outputs info to stderr)
ipcMain.handle('get-video-info', async (event, filePath) => {
    return new Promise((resolve) => {
        let ffmpegBin;
        try {
            ffmpegBin = getFFmpegPath();
        } catch (e) {
            resolve({
                duration: 0,
                videoCodec: 'unknown',
                audioCodec: 'unknown',
                needsRemux: false,
                error: 'FFmpeg not available'
            });
            return;
        }

        const proc = spawn(ffmpegBin, ['-i', filePath, '-hide_banner']);
        let stderr = '';

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', () => {
            // Parse duration: "Duration: HH:MM:SS.ms"
            const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
            let duration = 0;
            if (durationMatch) {
                duration = parseInt(durationMatch[1]) * 3600 +
                    parseInt(durationMatch[2]) * 60 +
                    parseFloat(durationMatch[3]);
            }

            // Parse codecs
            const videoCodecMatch = stderr.match(/Video:\s*(\w+)/);
            const audioCodecMatch = stderr.match(/Audio:\s*(\w+)/);

            const ext = extname(filePath).toLowerCase();

            resolve({
                duration,
                videoCodec: videoCodecMatch?.[1] || 'unknown',
                audioCodec: audioCodecMatch?.[1] || 'unknown',
                needsRemux: REMUX_EXTENSIONS.includes(ext)
            });
        });

        proc.on('error', () => {
            resolve({
                duration: 0,
                videoCodec: 'unknown',
                audioCodec: 'unknown',
                needsRemux: false,
                error: 'FFmpeg not available'
            });
        });
    });
});

app.whenReady().then(() => {
    // Register video protocol with FFmpeg remux support for MKV and other unsupported containers
    protocol.handle('video', (request) => {
        const rawUrl = request.url.replace('video://', '');
        // Split path and query string
        const queryIndex = rawUrl.indexOf('?');
        const pathPart = queryIndex >= 0 ? rawUrl.substring(0, queryIndex) : rawUrl;
        const queryPart = queryIndex >= 0 ? rawUrl.substring(queryIndex + 1) : '';

        const decodedPath = decodeURIComponent(pathPart);
        const finalPath = process.platform === 'win32' && decodedPath.startsWith('/')
            ? decodedPath.slice(1)
            : decodedPath;

        // Parse query params for seek time
        const params = new URLSearchParams(queryPart);
        const seekTime = params.get('t') || '0';

        const ext = extname(finalPath).toLowerCase();

        if (REMUX_EXTENSIONS.includes(ext)) {
            // Pipe through FFmpeg, remuxing to fragmented MP4 on the fly
            const ffmpegArgs = [
                ...(seekTime !== '0' ? ['-ss', seekTime] : []),
                '-i', finalPath,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                '-f', 'mp4',
                '-v', 'quiet',
                'pipe:1'
            ];

            let ffmpegProc;
            try {
                ffmpegProc = spawn(getFFmpegPath(), ffmpegArgs);
            } catch (err) {
                console.error('Failed to spawn FFmpeg:', err);
                return new Response('FFmpeg not available', { status: 500 });
            }

            activeFFmpegProcesses.add(ffmpegProc);

            ffmpegProc.on('close', () => {
                activeFFmpegProcesses.delete(ffmpegProc);
            });

            ffmpegProc.on('error', (err) => {
                console.error('FFmpeg process error:', err);
                activeFFmpegProcesses.delete(ffmpegProc);
            });

            // Convert Node.js Readable stream to Web ReadableStream for Response
            const webStream = Readable.toWeb(ffmpegProc.stdout);

            return new Response(webStream, {
                headers: {
                    'Content-Type': 'video/mp4',
                }
            });
        }

        // Default: serve file directly for natively supported formats
        return net.fetch(pathToFileURL(finalPath).toString());
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Clean up FFmpeg processes on quit
app.on('before-quit', () => {
    for (const proc of activeFFmpegProcesses) {
        try {
            proc.kill('SIGTERM');
        } catch (e) {
            // Process may have already exited
        }
    }
    activeFFmpegProcesses.clear();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
