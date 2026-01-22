/**
 * WebSocket 훅
 * 실시간 서버 통신 관리
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useGraphStore } from '../store/graphStore';

// Session ID 관리 상수
const SESSION_ID_KEY = 'rkg_session_id';

// 메시지 타입
type WSMessageType =
  | 'AUDIO_CHUNK'
  | 'START_SESSION'
  | 'END_SESSION'
  | 'PING'
  | 'SUBMIT_FEEDBACK'
  | 'TRANSLATE_GRAPH'
  | 'STT_PARTIAL'
  | 'STT_FINAL'
  | 'GRAPH_DELTA'
  | 'GRAPH_FULL'
  | 'PROCESSING_STATUS'
  | 'ERROR'
  | 'PONG'
  | 'FEEDBACK_RESULT'
  | 'REQUEST_FEEDBACK'
  | 'TRANSLATE_RESULT';

interface AudioFormat {
  codec: string;
  sampleRate: number;
  channels: number;
  bitDepth?: number;
}

interface AudioChunkPayload {
  data: string; // Base64
  format: AudioFormat;
  sequenceNumber: number;
  startTime: number;
  duration: number;
}

interface WSMessage {
  type: WSMessageType;
  payload: Record<string, unknown>;
  timestamp: number;
  messageId: string;
}

// Session ID 유틸리티 함수
function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

function clearSessionId(): void {
  localStorage.removeItem(SESSION_ID_KEY);
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const pingIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const sequenceRef = useRef(0);
  const sessionIdRef = useRef<string>(getOrCreateSessionId());
  
  // 세션 활성 상태 추적 (녹음 중인지)
  const isSessionActiveRef = useRef(false);
  const lastLanguageCodesRef = useRef<string[] | undefined>(undefined);
  
  // 연결 상태 모니터링
  const lastPongTimeRef = useRef<number>(Date.now());
  const connectionHealthCheckRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const {
    setGraphState,
    applyDelta,
    setProcessingStage,
    addPartialSTT,
    addFinalSTT,
    setFeedbackRequest,
    setIsTranslating,
    applyTranslation,
  } = useGraphStore();

  // 메시지 핸들러
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'GRAPH_FULL': {
            const payload = message.payload as { entities?: unknown[]; relations?: unknown[]; version?: number };
            const hasEntities = payload.entities && payload.entities.length > 0;
            const hasRelations = payload.relations && payload.relations.length > 0;
            const isServerEmpty = !hasEntities && !hasRelations;
            
            // 서버에서 빈 그래프가 오고, 클라이언트에 이미 데이터가 있으면 무시
            // (재연결 시 새 session_id로 인한 초기화 방지)
            const currentState = useGraphStore.getState().graphState;
            const hasLocalData = currentState && 
              (currentState.entities.length > 0 || currentState.relations.length > 0);
            
            if (isServerEmpty && hasLocalData) {
              console.log('[WS] Ignoring empty GRAPH_FULL - local data exists');
              break;
            }
            
            setGraphState(payload as any);
            break;
          }

          case 'GRAPH_DELTA':
            applyDelta(message.payload as any);
            break;

          case 'STT_PARTIAL':
            addPartialSTT(message.payload as any);
            break;

          case 'STT_FINAL':
            addFinalSTT(message.payload as any);
            break;

          case 'PROCESSING_STATUS':
            setProcessingStage((message.payload as any).stage);
            break;

          case 'REQUEST_FEEDBACK':
            // 피드백 요청 수신
            setFeedbackRequest({
              sessionId: (message.payload as any).sessionId,
              entitiesCount: (message.payload as any).entitiesCount,
              relationsCount: (message.payload as any).relationsCount,
              durationSeconds: (message.payload as any).durationSeconds,
            });
            break;

          case 'FEEDBACK_RESULT':
            // 피드백 결과 처리
            const feedbackResult = message.payload as { success: boolean; message: string };
            if (feedbackResult.success) {
              console.log('Feedback submitted successfully');
            } else {
              console.error('Feedback submission failed:', feedbackResult.message);
            }
            break;

          case 'TRANSLATE_RESULT':
            // 번역 결과 처리
            const translateResult = message.payload as {
              success: boolean;
              message?: string;
              entities: Array<{ id: string; label: string; type: string }>;
              relations: Array<{ source: string; target: string; relation: string }>;
            };
            if (translateResult.success) {
              applyTranslation({
                entities: translateResult.entities,
                relations: translateResult.relations,
              });
              console.log('Translation applied successfully');
            } else {
              setIsTranslating(false);
              console.error('Translation failed:', translateResult.message);
            }
            break;

          case 'ERROR':
            console.error('WebSocket error:', message.payload);
            break;

          case 'PONG':
            // 연결 유지 확인 - 마지막 응답 시간 업데이트
            lastPongTimeRef.current = Date.now();
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
    [setGraphState, applyDelta, addPartialSTT, addFinalSTT, setProcessingStage, setFeedbackRequest, setIsTranslating, applyTranslation]
  );

  // 연결
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // 개발/프로덕션 환경에 따른 URL 설정
    const wsUrl = import.meta.env.VITE_WS_URL || 'wss://knowledge-graph-api-l7xzsmm33q-du.a.run.app/ws';

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);

      // 마지막 PONG 시간 초기화
      lastPongTimeRef.current = Date.now();
      
      // Ping 인터벌 시작 - 15초로 단축 (Cloud Run WebSocket 안정성)
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'PING',
              payload: {},
              timestamp: Date.now(),
              messageId: crypto.randomUUID(),
            })
          );
        } else {
          // 연결이 끊어진 상태면 재연결 시도
          console.warn('[WS] Ping failed - connection not open, attempting reconnect');
          clearInterval(pingIntervalRef.current);
          wsRef.current = null;
          connect();
        }
      }, 15000); // 30초 → 15초로 단축
      
      // 연결 상태 모니터링 - PONG 응답 체크 (45초 이상 응답 없으면 재연결)
      connectionHealthCheckRef.current = setInterval(() => {
        const timeSinceLastPong = Date.now() - lastPongTimeRef.current;
        if (timeSinceLastPong > 45000) {  // 45초 이상 PONG 없음
          console.warn('[WS] No PONG received for 45s, reconnecting...');
          ws.close();
        }
      }, 10000);  // 10초마다 체크
      
      // 세션이 활성화 상태였으면 자동으로 재시작 (재연결 시)
      if (isSessionActiveRef.current) {
        console.log('[WS] Reconnected - restoring session:', sessionIdRef.current);
        ws.send(
          JSON.stringify({
            type: 'START_SESSION',
            payload: {
              sessionId: sessionIdRef.current,
              config: lastLanguageCodesRef.current ? { languageCodes: lastLanguageCodesRef.current } : null,
            },
            timestamp: Date.now(),
            messageId: crypto.randomUUID(),
          })
        );
      }
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = undefined;
      }
      
      if (connectionHealthCheckRef.current) {
        clearInterval(connectionHealthCheckRef.current);
        connectionHealthCheckRef.current = undefined;
      }

      // 자동 재연결 - 지수 백오프 적용 (최대 30초)
      const baseDelay = 1000;
      const maxDelay = 30000;
      const delay = Math.min(baseDelay * Math.pow(2, Math.random()), maxDelay);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[WS] Attempting reconnection...');
        connect();
      }, delay);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [handleMessage]);

  // 연결 해제
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = undefined;
    }
    if (connectionHealthCheckRef.current) {
      clearInterval(connectionHealthCheckRef.current);
      connectionHealthCheckRef.current = undefined;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // 메시지 전송
  const sendMessage = useCallback((type: WSMessageType, payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    const message: WSMessage = {
      type,
      payload,
      timestamp: Date.now(),
      messageId: crypto.randomUUID(),
    };

    wsRef.current.send(JSON.stringify(message));
  }, []);

  // 오디오 청크 전송
  const sendAudioChunk = useCallback(
    (audioData: ArrayBuffer, format: AudioFormat, duration: number) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      // ArrayBuffer를 Base64로 변환
      const base64 = btoa(
        new Uint8Array(audioData).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );

      const payload: AudioChunkPayload = {
        data: base64,
        format: {
          codec: format.codec,
          sampleRate: format.sampleRate,
          channels: format.channels,
          bitDepth: format.bitDepth,
        },
        sequenceNumber: sequenceRef.current++,
        startTime: Date.now(),
        duration,
      };

      sendMessage('AUDIO_CHUNK', payload as unknown as Record<string, unknown>);
    },
    [sendMessage]
  );

  // 세션 시작
  const startSession = useCallback(
    (languageCodes?: string[]) => {
      sequenceRef.current = 0;
      isSessionActiveRef.current = true;  // 세션 활성화 상태 저장
      lastLanguageCodesRef.current = languageCodes;  // 언어 코드 저장 (재연결용)
      
      console.log('[WS] Starting session:', sessionIdRef.current);
      sendMessage('START_SESSION', {
        sessionId: sessionIdRef.current,  // 기존 session_id 전달
        config: languageCodes ? { languageCodes } : null,
      });
    },
    [sendMessage]
  );

  // 세션 종료
  const endSession = useCallback((clearSession = false) => {
    isSessionActiveRef.current = false;  // 세션 비활성화
    sendMessage('END_SESSION', { clearSession });
    if (clearSession) {
      // 명시적 종료 시에만 session_id 삭제
      clearSessionId();
      sessionIdRef.current = getOrCreateSessionId();
    }
  }, [sendMessage]);

  // 피드백 제출
  const submitFeedback = useCallback(
    (rating: number, comment: string | null) => {
      sendMessage('SUBMIT_FEEDBACK', { rating, comment });
    },
    [sendMessage]
  );

  // 그래프 번역 요청
  const translateGraph = useCallback(
    (targetLanguage: string) => {
      sendMessage('TRANSLATE_GRAPH', { targetLanguage });
    },
    [sendMessage]
  );

  // 정리
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected,
    sendAudioChunk,
    startSession,
    endSession,
    submitFeedback,
    translateGraph,
  };
}
