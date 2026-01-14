/**
 * 시스템 오디오 캡처 훅
 * 각 청크가 독립적인 완전한 오디오 파일이 되도록 MediaRecorder를 재시작
 */

import { useCallback, useRef, useState } from 'react';

interface UseAudioCaptureReturn {
  isCapturing: boolean;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  error: string | null;
}

const CHUNK_DURATION_MS = 5000; // 5초마다 새 청크

export function useAudioCapture(
  onAudioChunk: (data: ArrayBuffer, sequenceNumber: number) => void
): UseAudioCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentRecorderRef = useRef<MediaRecorder | null>(null);
  const sequenceRef = useRef(0);
  const isActiveRef = useRef(false);

  const createAndStartRecorder = useCallback((audioStream: MediaStream) => {
    // 이전 레코더 정리
    if (currentRecorderRef.current && currentRecorderRef.current.state !== 'inactive') {
      currentRecorderRef.current.stop();
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(audioStream, {
      mimeType,
      audioBitsPerSecond: 128000,
    });

    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      if (chunks.length > 0) {
        // 청크들을 하나의 완전한 webm 파일로 결합
        const blob = new Blob(chunks, { type: mimeType });
        const buffer = await blob.arrayBuffer();
        
        if (buffer.byteLength > 0) {
          onAudioChunk(buffer, sequenceRef.current++);
        }
      }
    };

    recorder.onerror = (event) => {
      console.error('MediaRecorder 에러:', event);
    };

    // 녹음 시작 (전체 청크를 녹음 후 stop에서 전송)
    recorder.start();
    currentRecorderRef.current = recorder;

    return recorder;
  }, [onAudioChunk]);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      
      // 화면 공유 API로 시스템 오디오 캡처
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints,
      });

      // 오디오 트랙 확인
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('시스템 오디오를 캡처할 수 없습니다. 오디오가 포함된 소스를 선택하세요.');
      }

      // 비디오 트랙 중지
      stream.getVideoTracks().forEach((track) => track.stop());

      // 오디오 전용 스트림
      const audioStream = new MediaStream(audioTracks);
      mediaStreamRef.current = audioStream;
      isActiveRef.current = true;

      // 첫 번째 레코더 시작
      createAndStartRecorder(audioStream);

      // 5초마다 레코더 재시작 (각 청크가 독립적인 완전한 webm이 됨)
      recorderIntervalRef.current = setInterval(() => {
        if (!isActiveRef.current || !mediaStreamRef.current) return;
        
        // 현재 레코더 중지 (onstop에서 데이터 전송)
        if (currentRecorderRef.current && currentRecorderRef.current.state === 'recording') {
          currentRecorderRef.current.stop();
        }
        
        // 새 레코더 시작
        if (mediaStreamRef.current.active) {
          createAndStartRecorder(mediaStreamRef.current);
        }
      }, CHUNK_DURATION_MS);

      setIsCapturing(true);
      console.log('오디오 캡처 시작 (5초 청크)');

    } catch (err) {
      const message = err instanceof Error ? err.message : '오디오 캡처에 실패했습니다.';
      console.error('오디오 캡처 실패:', message);
      setError(message);
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    }
  }, [createAndStartRecorder]);

  const stopCapture = useCallback(() => {
    isActiveRef.current = false;

    // 인터벌 정리
    if (recorderIntervalRef.current) {
      clearInterval(recorderIntervalRef.current);
      recorderIntervalRef.current = null;
    }

    // 현재 레코더 중지
    if (currentRecorderRef.current && currentRecorderRef.current.state !== 'inactive') {
      currentRecorderRef.current.stop();
      currentRecorderRef.current = null;
    }

    // 미디어 스트림 정지
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // 상태 초기화
    sequenceRef.current = 0;
    setIsCapturing(false);
    setError(null);

    console.log('오디오 캡처 중지');
  }, []);

  return {
    isCapturing,
    startCapture,
    stopCapture,
    error,
  };
}
