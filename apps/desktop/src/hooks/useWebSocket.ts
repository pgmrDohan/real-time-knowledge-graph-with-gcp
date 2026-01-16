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
  | 'STT_PARTIAL'
  | 'STT_FINAL'
  | 'GRAPH_DELTA'
  | 'GRAPH_FULL'
  | 'PROCESSING_STATUS'
  | 'ERROR'
  | 'PONG'
  | 'FEEDBACK_RESULT'
  | 'REQUEST_FEEDBACK';

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

  const {
    setGraphState,
    applyDelta,
    setProcessingStage,
    addPartialSTT,
    addFinalSTT,
    setFeedbackRequest,
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
            const result = message.payload as { success: boolean; message: string };
            if (result.success) {
              console.log('Feedback submitted successfully');
            } else {
              console.error('Feedback submission failed:', result.message);
            }
            break;

          case 'ERROR':
            console.error('WebSocket error:', message.payload);
            break;

          case 'PONG':
            // 연결 유지 확인
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
    [setGraphState, applyDelta, addPartialSTT, addFinalSTT, setProcessingStage, setFeedbackRequest]
  );

  // 연결
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // 개발/프로덕션 환경에 따른 URL 설정
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);

      // Ping 인터벌 시작
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
        }
      }, 30000);
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }

      // 자동 재연결
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
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
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
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
      sendMessage('START_SESSION', {
        sessionId: sessionIdRef.current,  // 기존 session_id 전달
        config: languageCodes ? { languageCodes } : null,
      });
    },
    [sendMessage]
  );

  // 세션 종료
  const endSession = useCallback((clearSession = false) => {
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
  };
}
