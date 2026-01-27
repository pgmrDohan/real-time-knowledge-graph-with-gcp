/**
 * 데모 모드 훅
 * STT, 그래프, 번역을 시뮬레이션하여 실제처럼 보이게 함
 */

import { useCallback, useRef, useEffect } from 'react';
import { useGraphStore } from '../store/graphStore';
import { useDemoStore } from './demoStore';
import {
  DEMO_STT_ENTRIES,
  DEMO_GRAPH_DELTAS,
  DEMO_TRANSLATIONS,
  PROCESSING_STAGE_SEQUENCE,
  DEMO_TIMING,
} from './demoData';

interface UseDemoModeReturn {
  /** 데모 모드 활성화 여부 */
  isDemoMode: boolean;
  /** 데모 진행 중 여부 */
  isDemoRunning: boolean;
  /** 데모 모드 토글 */
  setDemoMode: (enabled: boolean) => void;
  /** 데모 캡처 시작 (녹음 버튼 대체) */
  startDemoCapture: () => void;
  /** 데모 캡처 중지 */
  stopDemoCapture: () => void;
  /** 데모 번역 (번역 버튼 대체) */
  demoTranslate: (targetLanguage: string) => void;
  /** 가짜 연결 상태 (항상 true) */
  isConnected: boolean;
  /** 캡처 중 상태 */
  isCapturing: boolean;
}

export function useDemoMode(): UseDemoModeReturn {
  const {
    isDemoMode,
    isDemoRunning,
    setDemoMode,
    startDemo,
    stopDemo,
    nextSTT,
    resetDemo,
  } = useDemoStore();

  const {
    setProcessingStage,
    addPartialSTT,
    addFinalSTT,
    applyDelta,
    resetGraph,
    setGraphState,
    setIsTranslating,
    applyTranslation,
    clearTranscripts,
    setFeedbackRequest,
  } = useGraphStore();

  // 타이머 ref
  const mainTimerRef = useRef<NodeJS.Timeout | null>(null);
  const partialTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);

  // 모든 타이머 정리
  const clearAllTimers = useCallback(() => {
    if (mainTimerRef.current) {
      clearInterval(mainTimerRef.current);
      mainTimerRef.current = null;
    }
    if (partialTimerRef.current) {
      clearTimeout(partialTimerRef.current);
      partialTimerRef.current = null;
    }
    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }, []);

  // 처리 상태 전환 애니메이션
  const animateProcessingStages = useCallback(
    (callback: () => void) => {
      let stageIndex = 0;

      const advanceStage = () => {
        if (stageIndex < PROCESSING_STAGE_SEQUENCE.length) {
          setProcessingStage(PROCESSING_STAGE_SEQUENCE[stageIndex]);
          stageIndex++;

          if (stageIndex < PROCESSING_STAGE_SEQUENCE.length) {
            stageTimerRef.current = setTimeout(
              advanceStage,
              DEMO_TIMING.STAGE_TRANSITION
            );
          } else {
            callback();
          }
        }
      };

      advanceStage();
    },
    [setProcessingStage]
  );

  // 부분 텍스트 타이핑 효과
  const animatePartialTexts = useCallback(
    (partialTexts: string[], onComplete: () => void) => {
      let partialIndex = 0;

      const showNextPartial = () => {
        if (partialIndex < partialTexts.length) {
          addPartialSTT({
            text: partialTexts[partialIndex],
            confidence: 0.7 + Math.random() * 0.2,
            segmentId: `demo-partial-${Date.now()}`,
          });
          partialIndex++;
          partialTimerRef.current = setTimeout(
            showNextPartial,
            DEMO_TIMING.PARTIAL_INTERVAL
          );
        } else {
          onComplete();
        }
      };

      showNextPartial();
    },
    [addPartialSTT]
  );

  // 단일 STT 엔트리 처리
  const processDemoEntry = useCallback(
    (entryIndex: number) => {
      if (entryIndex >= DEMO_STT_ENTRIES.length) {
        // 모든 엔트리 처리 완료
        stopDemo();
        setProcessingStage('IDLE');
        return;
      }

      const entry = DEMO_STT_ENTRIES[entryIndex];

      // 1. 처리 상태 애니메이션 시작
      animateProcessingStages(() => {
        // 처리 상태 애니메이션 완료 후 실행됨
      });

      // 2. 부분 텍스트 타이핑 효과
      animatePartialTexts(entry.partialTexts, () => {
        // 3. 최종 STT 결과 추가
        const segmentId = `demo-final-${Date.now()}-${entryIndex}`;
        addFinalSTT({
          text: entry.text,
          confidence: 0.95,
          segmentId,
          isComplete: true,
        });

        // 4. 그래프 델타 적용
        if (entry.graphDeltaIndex < DEMO_GRAPH_DELTAS.length) {
          setTimeout(() => {
            applyDelta(DEMO_GRAPH_DELTAS[entry.graphDeltaIndex]);
          }, 500);
        }

        // 다음 STT로 인덱스 증가
        nextSTT();
      });
    },
    [
      animateProcessingStages,
      animatePartialTexts,
      addFinalSTT,
      applyDelta,
      nextSTT,
      stopDemo,
      setProcessingStage,
    ]
  );

  // 데모 캡처 시작
  const startDemoCapture = useCallback(() => {
    if (!isDemoMode || isRunningRef.current) return;

    // 기존 그래프/트랜스크립트 초기화
    resetGraph();
    clearTranscripts();
    resetDemo();

    // 빈 그래프 상태 초기화 (applyDelta가 동작하려면 필요)
    setGraphState({
      version: 0,
      entities: [],
      relations: [],
      lastUpdated: Date.now(),
    });

    // 데모 시작
    startDemo();
    isRunningRef.current = true;

    // 첫 번째 엔트리 즉시 처리
    setTimeout(() => {
      processDemoEntry(0);
    }, 1000);

    // 이후 엔트리들 주기적 처리
    let currentIndex = 1;
    mainTimerRef.current = setInterval(() => {
      // 사용자가 중지 버튼을 누른 경우에만 종료
      if (!isRunningRef.current) {
        clearAllTimers();
        return;
      }
      
      // 모든 데이터 처리 완료 - 타이머만 정리하고 캡처 상태는 유지
      if (currentIndex >= DEMO_STT_ENTRIES.length) {
        clearAllTimers();
        setProcessingStage('IDLE');
        // stopDemo() 호출하지 않음 - 사용자가 멈춤 버튼을 누를 때까지 캡처 상태 유지
        return;
      }

      processDemoEntry(currentIndex);
      currentIndex++;
    }, DEMO_TIMING.STT_INTERVAL);
  }, [
    isDemoMode,
    resetGraph,
    clearTranscripts,
    resetDemo,
    startDemo,
    setGraphState,
    processDemoEntry,
    clearAllTimers,
    stopDemo,
    setProcessingStage,
    setFeedbackRequest,
  ]);

  // 데모 캡처 중지
  const stopDemoCapture = useCallback(() => {
    clearAllTimers();
    isRunningRef.current = false;
    stopDemo();
    setProcessingStage('IDLE');
    
    // 그래프 데이터가 있으면 피드백 다이얼로그 표시
    const currentGraph = useGraphStore.getState().graphState;
    if (currentGraph && currentGraph.entities.length > 0) {
      setTimeout(() => {
        setFeedbackRequest({
          sessionId: `demo-${Date.now()}`,
          entitiesCount: currentGraph.entities.length,
          relationsCount: currentGraph.relations.length,
          durationSeconds: Math.floor((DEMO_STT_ENTRIES.length * DEMO_TIMING.STT_INTERVAL) / 1000),
        });
      }, 500);
    }
  }, [clearAllTimers, stopDemo, setProcessingStage, setFeedbackRequest]);

  // 데모 번역
  const demoTranslate = useCallback(
    (targetLanguage: string) => {
      if (!isDemoMode) return;

      setIsTranslating(true);

      // 번역 시뮬레이션 (지정된 시간 후 결과 적용)
      setTimeout(() => {
        const translationData = DEMO_TRANSLATIONS[targetLanguage];
        if (translationData) {
          applyTranslation(translationData);
        } else {
          // 지원하지 않는 언어는 영어로 대체
          applyTranslation(DEMO_TRANSLATIONS.en);
        }
      }, DEMO_TIMING.TRANSLATE_DURATION);
    },
    [isDemoMode, setIsTranslating, applyTranslation]
  );

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // isDemoRunning 변경 시 isRunningRef 동기화
  useEffect(() => {
    isRunningRef.current = isDemoRunning;
  }, [isDemoRunning]);

  return {
    isDemoMode,
    isDemoRunning,
    setDemoMode,
    startDemoCapture,
    stopDemoCapture,
    demoTranslate,
    // 데모 모드에서는 항상 연결됨으로 표시
    isConnected: isDemoMode ? true : false,
    isCapturing: isDemoRunning,
  };
}
