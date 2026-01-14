/**
 * Electron 메인 프로세스
 * 시스템 오디오 캡처 및 IPC 통신 관리
 */

import { app, BrowserWindow, desktopCapturer, ipcMain, session } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV !== 'production';

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
  });

  // 로드 완료 후 표시 (깜빡임 방지)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 개발/프로덕션 URL
  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 화면 공유 권한 설정 (오디오 캡처용)
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      // 첫 번째 소스 자동 선택 (사용자 선택 UI 가능)
      callback({ video: sources[0], audio: 'loopback' });
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 앱 준비 완료
app.whenReady().then(createWindow);

// 모든 창이 닫히면 종료 (macOS 제외)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS: 독 클릭 시 창 재생성
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============================================
// IPC 핸들러
// ============================================

// 오디오 소스 목록 조회
ipcMain.handle('get-audio-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    fetchWindowIcons: true,
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }));
});

// 앱 버전 조회
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// 윈도우 최소화
ipcMain.on('minimize-window', () => {
  mainWindow?.minimize();
});

// 윈도우 최대화/복원
ipcMain.on('maximize-window', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.restore();
  } else {
    mainWindow?.maximize();
  }
});

// 윈도우 닫기
ipcMain.on('close-window', () => {
  mainWindow?.close();
});



