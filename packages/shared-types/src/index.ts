/**
 * @rkg/shared-types
 * 실시간 지식 그래프 서비스의 모든 공유 타입 정의
 * GCP 통합 버전
 */

// ============================================
// 기본 엔티티 타입
// ============================================

/**
 * 그래프 노드 엔티티
 */
export interface GraphEntity {
  /** 고유 식별자 (UUID) */
  id: string;
  /** 표시 라벨 */
  label: string;
  /** 엔티티 유형 */
  type: EntityType;
  /** 생성 타임스탬프 */
  createdAt: number;
  /** 마지막 수정 타임스탬프 */
  updatedAt: number;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * 엔티티 유형 열거
 */
export type EntityType =
  | 'PERSON' // 인물
  | 'ORGANIZATION' // 조직/기관
  | 'LOCATION' // 장소
  | 'CONCEPT' // 개념
  | 'EVENT' // 이벤트
  | 'PRODUCT' // 제품/서비스
  | 'TECHNOLOGY' // 기술
  | 'DATE' // 날짜/시간
  | 'METRIC' // 수치/지표
  | 'ACTION' // 행동/동작
  | 'UNKNOWN'; // 미분류

/**
 * 엔티티 간 관계
 */
export interface GraphRelation {
  /** 관계 고유 식별자 */
  id: string;
  /** 출발 노드 ID */
  source: string;
  /** 도착 노드 ID */
  target: string;
  /** 관계 유형/설명 */
  relation: string;
  /** 관계 강도 (0-1) */
  weight?: number;
  /** 생성 타임스탬프 */
  createdAt: number;
}

// ============================================
// 그래프 상태 타입
// ============================================

/**
 * 전체 그래프 상태
 */
export interface GraphState {
  /** 그래프 버전 */
  version: number;
  /** 모든 노드 */
  entities: GraphEntity[];
  /** 모든 관계 */
  relations: GraphRelation[];
  /** 마지막 업데이트 타임스탬프 */
  lastUpdated: number;
}

/**
 * 그래프 업데이트 델타
 */
export interface GraphDelta {
  /** 추가된 노드 */
  addedEntities: GraphEntity[];
  /** 추가된 관계 */
  addedRelations: GraphRelation[];
  /** 업데이트된 노드 */
  updatedEntities: GraphEntity[];
  /** 삭제된 노드 ID */
  removedEntityIds: string[];
  /** 삭제된 관계 ID */
  removedRelationIds: string[];
  /** 이 델타의 버전 */
  fromVersion: number;
  /** 적용 후 버전 */
  toVersion: number;
}

// ============================================
// LLM 추출 결과 타입
// ============================================

/**
 * LLM 추출 원시 결과
 */
export interface ExtractionResult {
  /** 추출된 엔티티 */
  entities: ExtractedEntity[];
  /** 추출된 관계 */
  relations: ExtractedRelation[];
}

/**
 * 추출된 엔티티 (정규화 전)
 */
export interface ExtractedEntity {
  /** 임시 ID 또는 기존 ID */
  id: string;
  /** 표시 라벨 */
  label: string;
  /** 엔티티 유형 */
  type: EntityType;
}

/**
 * 추출된 관계 (정규화 전)
 */
export interface ExtractedRelation {
  /** 출발 노드 ID */
  source: string;
  /** 도착 노드 ID */
  target: string;
  /** 관계 설명 */
  relation: string;
}

// ============================================
// WebSocket 메시지 타입
// ============================================

/**
 * WebSocket 메시지 기본 구조
 */
export interface WSMessage<T = unknown> {
  /** 메시지 유형 */
  type: WSMessageType;
  /** 페이로드 */
  payload: T;
  /** 메시지 타임스탬프 */
  timestamp: number;
  /** 메시지 ID (추적용) */
  messageId: string;
}

/**
 * WebSocket 메시지 유형
 */
export type WSMessageType =
  // 클라이언트 → 서버
  | 'AUDIO_CHUNK' // 오디오 청크 전송
  | 'START_SESSION' // 세션 시작
  | 'END_SESSION' // 세션 종료
  | 'PING' // 연결 확인
  | 'SUBMIT_FEEDBACK' // 피드백 제출
  // 서버 → 클라이언트
  | 'STT_PARTIAL' // 부분 STT 결과
  | 'STT_FINAL' // 최종 STT 결과
  | 'GRAPH_DELTA' // 그래프 변경사항
  | 'GRAPH_FULL' // 전체 그래프 (초기화 또는 복구)
  | 'PROCESSING_STATUS' // 처리 상태 업데이트
  | 'ERROR' // 에러 메시지
  | 'PONG' // Ping 응답
  | 'FEEDBACK_RESULT' // 피드백 결과
  | 'REQUEST_FEEDBACK'; // 피드백 요청

// ============================================
// 오디오 관련 타입
// ============================================

/**
 * 오디오 청크 페이로드
 */
export interface AudioChunkPayload {
  /** Base64 인코딩된 오디오 데이터 */
  data: string;
  /** 오디오 포맷 */
  format: AudioFormat;
  /** 청크 시퀀스 번호 */
  sequenceNumber: number;
  /** 청크 시작 타임스탬프 (ms) */
  startTime: number;
  /** 청크 지속 시간 (ms) */
  duration: number;
}

/**
 * 지원 오디오 포맷
 */
export interface AudioFormat {
  /** 코덱 */
  codec: 'pcm' | 'wav' | 'webm' | 'opus' | 'mp3' | 'flac';
  /** 샘플레이트 (Hz) */
  sampleRate: number;
  /** 채널 수 */
  channels: number;
  /** 비트 깊이 */
  bitDepth?: number;
}

// ============================================
// STT 관련 타입
// ============================================

/**
 * STT 부분 결과
 */
export interface STTPartialPayload {
  /** 부분 텍스트 */
  text: string;
  /** 확신도 (0-1) */
  confidence: number;
  /** 세그먼트 ID */
  segmentId: string;
}

/**
 * STT 최종 결과
 */
export interface STTFinalPayload {
  /** 최종 텍스트 */
  text: string;
  /** 확신도 (0-1) */
  confidence: number;
  /** 세그먼트 ID */
  segmentId: string;
  /** 형태소 분석 결과 */
  morphemes?: KiwiMorpheme[];
  /** 문장 완결 여부 */
  isComplete: boolean;
}

/**
 * Kiwi 형태소 분석 결과
 */
export interface KiwiMorpheme {
  /** 형태소 */
  form: string;
  /** 품사 태그 */
  tag: string;
  /** 시작 위치 */
  start: number;
  /** 끝 위치 */
  end: number;
}

// ============================================
// 처리 상태 타입
// ============================================

/**
 * 처리 상태 페이로드
 */
export interface ProcessingStatusPayload {
  /** 파이프라인 단계 */
  stage: ProcessingStage;
  /** 처리 중인 청크 ID */
  chunkId?: string;
  /** 진행률 (0-100) */
  progress?: number;
  /** 상태 메시지 */
  message?: string;
}

/**
 * 처리 파이프라인 단계
 */
export type ProcessingStage =
  | 'RECEIVING' // 오디오 수신 중
  | 'STT_PROCESSING' // STT 처리 중
  | 'NLP_ANALYZING' // 형태소 분석 중
  | 'EXTRACTING' // 엔티티/관계 추출 중
  | 'UPDATING_GRAPH' // 그래프 업데이트 중
  | 'SAVING_DATA' // 데이터 저장 중
  | 'IDLE'; // 대기 중

// ============================================
// 세션 관련 타입
// ============================================

/**
 * 세션 시작 페이로드
 */
export interface StartSessionPayload {
  /** 세션 설정 */
  config?: SessionConfig;
}

/**
 * 세션 설정
 */
export interface SessionConfig {
  /** 오디오 포맷 */
  audioFormat: AudioFormat;
  /** 추출 모드 */
  extractionMode: 'realtime' | 'batch';
  /** 그래프 초기 상태 (기존 그래프 이어서 사용 시) */
  initialGraphState?: GraphState;
  /** 인식할 언어 코드 목록 */
  languageCodes?: string[];
}

// ============================================
// 피드백 관련 타입
// ============================================

/**
 * 피드백 제출 페이로드
 */
export interface FeedbackPayload {
  /** 만족도 (1-5) */
  rating: number;
  /** 사용자 코멘트 */
  comment?: string;
}

/**
 * 피드백 결과 페이로드
 */
export interface FeedbackResultPayload {
  /** 성공 여부 */
  success: boolean;
  /** 메시지 */
  message: string;
  /** 저장된 오디오 URI */
  audioUri?: string;
  /** 저장된 그래프 URI */
  graphUri?: string;
}

/**
 * 피드백 요청 페이로드
 */
export interface RequestFeedbackPayload {
  /** 세션 ID */
  sessionId: string;
  /** 엔티티 수 */
  entitiesCount: number;
  /** 관계 수 */
  relationsCount: number;
  /** 세션 지속 시간 (초) */
  durationSeconds: number;
}

// ============================================
// 에러 타입
// ============================================

/**
 * 에러 페이로드
 */
export interface ErrorPayload {
  /** 에러 코드 */
  code: ErrorCode;
  /** 에러 메시지 */
  message: string;
  /** 복구 가능 여부 */
  recoverable: boolean;
  /** 상세 정보 */
  details?: Record<string, unknown>;
}

/**
 * 에러 코드
 */
export type ErrorCode =
  | 'AUDIO_FORMAT_UNSUPPORTED'
  | 'STT_FAILED'
  | 'EXTRACTION_FAILED'
  | 'GRAPH_UPDATE_FAILED'
  | 'RATE_LIMITED'
  | 'SESSION_EXPIRED'
  | 'FEEDBACK_FAILED'
  | 'STORAGE_ERROR'
  | 'INTERNAL_ERROR';

// ============================================
// 유틸리티 타입
// ============================================

/**
 * React Flow 노드 데이터
 */
export interface RFNodeData {
  entity: GraphEntity;
  isNew?: boolean;
  isUpdated?: boolean;
}

/**
 * React Flow 엣지 데이터
 */
export interface RFEdgeData {
  relation: GraphRelation;
  isNew?: boolean;
}

/**
 * ID 생성기 유틸리티 타입
 */
export type IdGenerator = () => string;

/**
 * 타임스탬프 유틸리티
 */
export const createTimestamp = (): number => Date.now();

/**
 * UUID v4 생성 (브라우저/노드 호환)
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
