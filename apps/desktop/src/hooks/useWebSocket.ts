/**
 * WebSocket 연결 및 메시지 처리 훅
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useGraphStore } from '../store/graphStore';
import type {
  WSMessage,
  WSMessageType,
  AudioChunkPayload,
  GraphState,
  GraphDelta,
  STTPartialPayload,
  STTFinalPayload,
  ProcessingStatusPayload,
  ProcessingStage,
} from '@rkg/shared-types';

const WS_URL = 'ws://localhost:8000/ws';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

interface UseWebSocketReturn {
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  sendAudioChunk: (data: ArrayBuffer, sequenceNumber: number) => void;
  sendMessage: (type: WSMessageType, payload: Record<string, unknown>) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  // Store 액션
  const setGraphState = useGraphStore((state) => state.setGraphState);
  const applyDelta = useGraphStore((state) => state.applyDelta);
  const setProcessingStage = useGraphStore((state) => state.setProcessingStage);
  const addPartialSTT = useGraphStore((state) => state.addPartialSTT);
  const addFinalSTT = useGraphStore((state) => state.addFinalSTT);

  // 메시지 핸들러
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'GRAPH_FULL':
            setGraphState(message.payload as GraphState);
            break;

          case 'GRAPH_DELTA':
            applyDelta(message.payload as GraphDelta);
            break;

          case 'STT_PARTIAL':
            addPartialSTT(message.payload as STTPartialPayload);
            break;

          case 'STT_FINAL':
            addFinalSTT(message.payload as STTFinalPayload);
            break;

          case 'PROCESSING_STATUS': {
            const status = message.payload as ProcessingStatusPayload;
            setProcessingStage(status.stage as ProcessingStage);
            break;
          }

          case 'ERROR':
            console.error('서버 에러:', message.payload);
            break;

          case 'PONG':
            // Pong 응답 처리
            break;

          default:
            console.log('알 수 없는 메시지:', message);
        }
      } catch (error) {
        console.error('메시지 파싱 오류:', error);
      }
    },
    [setGraphState, applyDelta, setProcessingStage, addPartialSTT, addFinalSTT]
  );

  // 연결
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        console.log('WebSocket 연결됨');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // 세션 시작 메시지
        wsRef.current?.send(
          JSON.stringify({
            type: 'START_SESSION',
            payload: {
              config: {
                audioFormat: {
                  codec: 'pcm',
                  sampleRate: 48000,
                  channels: 2,
                  bitDepth: 16,
                },
                extractionMode: 'realtime',
              },
            },
            timestamp: Date.now(),
            messageId: crypto.randomUUID(),
          })
        );
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onclose = (event) => {
        console.log('WebSocket 연결 종료:', event.code);
        setIsConnected(false);

        // 자동 재연결
        if (
          event.code !== 1000 &&
          reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
        ) {
          reconnectAttempts.current++;
          console.log(
            `재연결 시도 ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS}...`
          );
          
          reconnectTimeout.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket 에러:', error);
      };
    } catch (error) {
      console.error('WebSocket 연결 실패:', error);
    }
  }, [handleMessage]);

  // 연결 해제
  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }

    if (wsRef.current) {
      // 세션 종료 메시지
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'END_SESSION',
            payload: {},
            timestamp: Date.now(),
            messageId: crypto.randomUUID(),
          })
        );
      }

      wsRef.current.close(1000, '정상 종료');
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  // 오디오 청크 전송
  const sendAudioChunk = useCallback(
    (data: ArrayBuffer, sequenceNumber: number) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      // ArrayBuffer를 Base64로 변환
      const base64Data = arrayBufferToBase64(data);

      const payload: AudioChunkPayload = {
        data: base64Data,
        format: {
          codec: 'webm',
          sampleRate: 48000,
          channels: 2,
        },
        sequenceNumber,
        startTime: Date.now(),
        duration: 5000, // MediaRecorder는 5초마다 전송
      };

      wsRef.current.send(
        JSON.stringify({
          type: 'AUDIO_CHUNK',
          payload,
          timestamp: Date.now(),
          messageId: crypto.randomUUID(),
        })
      );
    },
    []
  );

  // 일반 메시지 전송
  const sendMessage = useCallback(
    (type: WSMessageType, payload: Record<string, unknown>) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      wsRef.current.send(
        JSON.stringify({
          type,
          payload,
          timestamp: Date.now(),
          messageId: crypto.randomUUID(),
        })
      );
    },
    []
  );

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Ping 전송 (연결 유지)
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      sendMessage('PING', {});
    }, 30000);

    return () => clearInterval(pingInterval);
  }, [isConnected, sendMessage]);

  return {
    isConnected,
    connect,
    disconnect,
    sendAudioChunk,
    sendMessage,
  };
}

// ArrayBuffer를 Base64로 변환
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}


