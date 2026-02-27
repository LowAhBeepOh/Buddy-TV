const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-video',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function getMimeType(filePath) {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'ogv':
      return 'video/ogg';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'vtt':
      return 'text/vtt';
    case 'srt':
      return 'application/x-subrip';
    case 'ssa':
    case 'ass':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false, // Custom title bar (turn this to TRUE if you want to use this program without full-screen all the time)
    fullscreen: true,
    icon: path.join(__dirname, 'Assets', 'buddy-logo.svg'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true
    }
  });

  win.loadFile('index.html');
  
  // IPC Handlers
  ipcMain.on('app:exit', () => {
    app.quit();
  });

  // Serve file as base64 via IPC
  ipcMain.handle('serve-file', async (event, filePath) => {
    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }
      const data = fs.readFileSync(filePath);
      return {
        success: true,
        data: data.toString('base64'),
        mimeType: getMimeType(filePath)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Transcode MKV to MP4
  ipcMain.handle('transcode-mkv', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      let ffmpegPath;
      try {
        ffmpegPath = require('ffmpeg-static');
      } catch (e) {
        return { success: false, error: 'FFmpeg not installed. Run: npm install ffmpeg-static' };
      }

      const tempDir = path.join(os.tmpdir(), 'buddy-tv-transcode');
      
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Generate output filename based on input
      const inputName = path.parse(filePath).name;
      const outputPath = path.join(tempDir, inputName + '.mp4');

      // If already transcoded, return it
      if (fs.existsSync(outputPath)) {
        return { success: true, path: outputPath };
      }

      return new Promise((resolve) => {
        const ffmpegProcess = execFile(ffmpegPath, [
          '-i', filePath,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-y',
          outputPath
        ]);

        ffmpegProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, path: outputPath });
          } else {
            resolve({ success: false, error: 'FFmpeg transcode failed' });
          }
        });

        ffmpegProcess.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
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
