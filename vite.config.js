import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { spawn } from 'child_process'
import { join, extname } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import os from 'os'
import ffmpegStatic from 'ffmpeg-static'

// Custom Vite plugin to serve local video transcoding/remuxing on the fly
function localVideoTranscodePlugin() {
  return {
    name: 'local-video-transcode',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        
        if (url.pathname === '/api/transcode') {
          const filename = url.searchParams.get('filename');
          const seekTime = url.searchParams.get('t') || '0';

          if (!filename) {
            res.statusCode = 400;
            res.end('Missing filename parameter');
            return;
          }

          const foundPath = findLocalFile(filename);

          if (!foundPath) {
            res.statusCode = 404;
            res.end(`File not found on local disk: ${filename}`);
            return;
          }

          console.log(`[Transcode API] Found local file path: ${foundPath}`);

          // Set content headers for streaming MP4
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Connection': 'keep-alive',
          });

          // Pipe through FFmpeg, remuxing to fragmented MP4 on the fly (exactly like Electron does!)
          const ffmpegArgs = [
            ...(seekTime !== '0' ? ['-ss', seekTime] : []),
            '-i', foundPath,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            '-v', 'quiet',
            'pipe:1'
          ];

          const ffmpegProc = spawn(ffmpegStatic, ffmpegArgs);

          ffmpegProc.stdout.pipe(res);

          ffmpegProc.on('error', (err) => {
            console.error('[Transcode API] FFmpeg process error:', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end('FFmpeg process error');
            }
          });

          req.on('close', () => {
            try {
              ffmpegProc.kill('SIGKILL');
            } catch (e) {}
          });
          return;
        }

        if (url.pathname === '/api/video-info') {
          const filename = url.searchParams.get('filename');
          if (!filename) {
            res.statusCode = 400;
            res.end('Missing filename parameter');
            return;
          }

          const foundPath = findLocalFile(filename);

          if (!foundPath) {
            res.statusCode = 404;
            res.end(`File not found on local disk: ${filename}`);
            return;
          }

          const proc = spawn(ffmpegStatic, ['-i', foundPath, '-hide_banner']);
          let stderr = '';
          proc.stderr.on('data', (data) => { stderr += data.toString(); });
          proc.on('close', () => {
            const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
            let duration = 0;
            if (durationMatch) {
              duration = parseInt(durationMatch[1]) * 3600 +
                         parseInt(durationMatch[2]) * 60 +
                         parseFloat(durationMatch[3]);
            }
            
            // Inspect codecs
            const hasDolby = /Audio:\s*(ac3|eac3|truehd|dts)/i.test(stderr);
            const isHevc = /Video:\s*(hevc|h265)/i.test(stderr);
            const isMkv = extname(foundPath).toLowerCase() === '.mkv';
            const needsRemux = isMkv || hasDolby || isHevc;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              duration, 
              needsRemux,
              audioCodec: hasDolby ? 'ac3' : 'unknown',
              videoCodec: isHevc ? 'hevc' : 'unknown'
            }));
          });
          return;
        }

        next();
      });
    }
  }
}

function findLocalFile(filename) {
  const searchDirs = [
    join(os.homedir(), 'Videos'),
    join(os.homedir(), 'Downloads'),
    join(os.homedir(), 'Desktop'),
    join(os.homedir(), 'Documents'),
    process.cwd(),
  ];

  let foundPath = null;

  function searchFile(dir, targetName) {
    try {
      if (!existsSync(dir)) return;
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        try {
          const stat = statSync(fullPath);
          if (!stat.isDirectory() && file === targetName) {
            foundPath = fullPath;
            return;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  // Search common folders first (shallow search)
  for (const dir of searchDirs) {
    searchFile(dir, filename);
    if (foundPath) return foundPath;
  }

  // Deep search (1 level of folders)
  for (const dir of searchDirs) {
    try {
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            searchFile(fullPath, filename);
            if (foundPath) return foundPath;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  return null;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    localVideoTranscodePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Moon-Frame Watch Party',
        short_name: 'Moon-Frame',
        description: 'Watch videos together in sync with friends',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  base: './', // Ensure assets are loaded correctly in Electron
})
