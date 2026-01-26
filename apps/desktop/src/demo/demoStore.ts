/**
 * 데모 모드 상태 관리
 * Zustand 기반 데모 모드 활성화/비활성화 및 상태 관리
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DemoStoreState {
  /** 데모 모드 활성화 여부 */
  isDemoMode: boolean;
  /** 데모 진행 중 여부 */
  isDemoRunning: boolean;
  /** 현재 STT 인덱스 */
  currentSTTIndex: number;
  /** 데모 모드 토글 */
  setDemoMode: (enabled: boolean) => void;
  /** 데모 시작 */
  startDemo: () => void;
  /** 데모 중지 */
  stopDemo: () => void;
  /** STT 인덱스 증가 */
  nextSTT: () => void;
  /** 데모 리셋 */
  resetDemo: () => void;
}

export const useDemoStore = create<DemoStoreState>()(
  persist(
    (set) => ({
      isDemoMode: false,
      isDemoRunning: false,
      currentSTTIndex: 0,

      setDemoMode: (enabled) => set({ isDemoMode: enabled }),

      startDemo: () =>
        set({
          isDemoRunning: true,
          currentSTTIndex: 0,
        }),

      stopDemo: () =>
        set({
          isDemoRunning: false,
        }),

      nextSTT: () =>
        set((state) => ({
          currentSTTIndex: state.currentSTTIndex + 1,
        })),

      resetDemo: () =>
        set({
          isDemoRunning: false,
          currentSTTIndex: 0,
        }),
    }),
    {
      name: 'rkg-demo-mode',
      partialize: (state) => ({ isDemoMode: state.isDemoMode }),
    }
  )
);
