/**
 * Electron Preload 스크립트
 * 렌더러와 메인 프로세스 간 안전한 통신 브릿지
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * 오디오 소스 정보
 */
export interface AudioSource {
  id: string;
  name: string;
  thumbnail: string;
}

/**
 * Electron API 인터페이스
 */
export interface ElectronAPI {
  // 오디오 캡처
  getAudioSources: () => Promise<AudioSource[]>;
  
  // 앱 정보
  getAppVersion: () => Promise<string>;
  
  // 윈도우 컨트롤
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  
  // 플랫폼
  platform: NodeJS.Platform;
}

// contextBridge로 안전하게 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 오디오 소스 조회
  getAudioSources: () => ipcRenderer.invoke('get-audio-sources'),
  
  // 앱 버전
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 윈도우 컨트롤
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // 플랫폼
  platform: process.platform,
} satisfies ElectronAPI);

// 타입 선언
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}



