"""
Pydantic 모델 정의
TypeScript 공유 타입과 동기화된 Python 모델
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ============================================
# 열거형
# ============================================


class EntityType(str, Enum):
    """엔티티 유형"""

    PERSON = "PERSON"
    ORGANIZATION = "ORGANIZATION"
    LOCATION = "LOCATION"
    CONCEPT = "CONCEPT"
    EVENT = "EVENT"
    PRODUCT = "PRODUCT"
    TECHNOLOGY = "TECHNOLOGY"
    DATE = "DATE"
    METRIC = "METRIC"
    ACTION = "ACTION"
    UNKNOWN = "UNKNOWN"


class WSMessageType(str, Enum):
    """WebSocket 메시지 유형"""

    # 클라이언트 → 서버
    AUDIO_CHUNK = "AUDIO_CHUNK"
    START_SESSION = "START_SESSION"
    END_SESSION = "END_SESSION"
    PING = "PING"
    SUBMIT_FEEDBACK = "SUBMIT_FEEDBACK"  # 피드백 제출
    TRANSLATE_GRAPH = "TRANSLATE_GRAPH"  # 그래프 번역 요청
    
    # 서버 → 클라이언트
    STT_PARTIAL = "STT_PARTIAL"
    STT_FINAL = "STT_FINAL"
    GRAPH_DELTA = "GRAPH_DELTA"
    GRAPH_FULL = "GRAPH_FULL"
    PROCESSING_STATUS = "PROCESSING_STATUS"
    ERROR = "ERROR"
    PONG = "PONG"
    FEEDBACK_RESULT = "FEEDBACK_RESULT"  # 피드백 결과
    REQUEST_FEEDBACK = "REQUEST_FEEDBACK"  # 피드백 요청
    TRANSLATE_RESULT = "TRANSLATE_RESULT"  # 번역 결과


class ProcessingStage(str, Enum):
    """처리 파이프라인 단계"""

    RECEIVING = "RECEIVING"
    STT_PROCESSING = "STT_PROCESSING"
    NLP_ANALYZING = "NLP_ANALYZING"
    EXTRACTING = "EXTRACTING"
    UPDATING_GRAPH = "UPDATING_GRAPH"
    SAVING_DATA = "SAVING_DATA"
    IDLE = "IDLE"


class ErrorCode(str, Enum):
    """에러 코드"""

    AUDIO_FORMAT_UNSUPPORTED = "AUDIO_FORMAT_UNSUPPORTED"
    STT_FAILED = "STT_FAILED"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    GRAPH_UPDATE_FAILED = "GRAPH_UPDATE_FAILED"
    RATE_LIMITED = "RATE_LIMITED"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    FEEDBACK_FAILED = "FEEDBACK_FAILED"
    STORAGE_ERROR = "STORAGE_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# ============================================
# 그래프 엔티티/관계
# ============================================


class GraphEntity(BaseModel):
    """그래프 노드 엔티티"""

    id: str
    label: str
    type: EntityType
    created_at: int = Field(alias="createdAt")
    updated_at: int = Field(alias="updatedAt")
    metadata: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}


class GraphRelation(BaseModel):
    """엔티티 간 관계"""

    id: str
    source: str
    target: str
    relation: str
    weight: float | None = None
    created_at: int = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class GraphState(BaseModel):
    """전체 그래프 상태"""

    version: int
    entities: list[GraphEntity]
    relations: list[GraphRelation]
    last_updated: int = Field(alias="lastUpdated")

    model_config = {"populate_by_name": True}


class GraphDelta(BaseModel):
    """그래프 업데이트 델타"""

    added_entities: list[GraphEntity] = Field(alias="addedEntities")
    added_relations: list[GraphRelation] = Field(alias="addedRelations")
    updated_entities: list[GraphEntity] = Field(alias="updatedEntities")
    removed_entity_ids: list[str] = Field(alias="removedEntityIds")
    removed_relation_ids: list[str] = Field(alias="removedRelationIds")
    from_version: int = Field(alias="fromVersion")
    to_version: int = Field(alias="toVersion")

    model_config = {"populate_by_name": True}


# ============================================
# LLM 추출 결과
# ============================================


class ExtractedEntity(BaseModel):
    """추출된 엔티티 (정규화 전)"""

    id: str
    label: str
    type: EntityType


class ExtractedRelation(BaseModel):
    """추출된 관계 (정규화 전)"""

    source: str
    target: str
    relation: str


class ExtractionResult(BaseModel):
    """LLM 추출 결과"""

    entities: list[ExtractedEntity]
    relations: list[ExtractedRelation]


# ============================================
# 오디오 관련
# ============================================


class AudioFormat(BaseModel):
    """오디오 포맷 정보"""

    codec: str  # pcm, wav, webm, opus
    sample_rate: int = Field(alias="sampleRate")
    channels: int
    bit_depth: int | None = Field(default=None, alias="bitDepth")

    model_config = {"populate_by_name": True}


class AudioChunkPayload(BaseModel):
    """오디오 청크 페이로드"""

    data: str  # Base64 인코딩
    format: AudioFormat
    sequence_number: int = Field(alias="sequenceNumber")
    start_time: int = Field(alias="startTime")
    duration: int

    model_config = {"populate_by_name": True}


# ============================================
# STT 결과
# ============================================


class KiwiMorpheme(BaseModel):
    """Kiwi 형태소 분석 결과"""

    form: str
    tag: str
    start: int
    end: int


class STTPartialPayload(BaseModel):
    """STT 부분 결과"""

    text: str
    confidence: float
    segment_id: str = Field(alias="segmentId")
    language_code: str | None = Field(default=None, alias="languageCode")

    model_config = {"populate_by_name": True}


class STTFinalPayload(BaseModel):
    """STT 최종 결과"""

    text: str
    confidence: float
    segment_id: str = Field(alias="segmentId")
    morphemes: list[KiwiMorpheme] | None = None
    is_complete: bool = Field(alias="isComplete")

    model_config = {"populate_by_name": True}


# ============================================
# 처리 상태
# ============================================


class ProcessingStatusPayload(BaseModel):
    """처리 상태 페이로드"""

    stage: ProcessingStage
    chunk_id: str | None = Field(default=None, alias="chunkId")
    progress: int | None = None
    message: str | None = None

    model_config = {"populate_by_name": True}


# ============================================
# 세션
# ============================================


class SessionConfig(BaseModel):
    """세션 설정"""

    audio_format: AudioFormat = Field(alias="audioFormat")
    extraction_mode: str = Field(default="realtime", alias="extractionMode")
    initial_graph_state: GraphState | None = Field(
        default=None, alias="initialGraphState"
    )
    language_codes: list[str] | None = Field(
        default=None, alias="languageCodes"
    )

    model_config = {"populate_by_name": True}


class StartSessionPayload(BaseModel):
    """세션 시작 페이로드"""

    config: SessionConfig | None = None


# ============================================
# 피드백
# ============================================


class FeedbackPayload(BaseModel):
    """피드백 제출 페이로드"""

    rating: int = Field(ge=1, le=5, description="만족도 (1-5)")
    comment: str | None = Field(default=None, description="사용자 코멘트")


class FeedbackResultPayload(BaseModel):
    """피드백 결과 페이로드"""

    success: bool
    message: str
    audio_uri: str | None = Field(default=None, alias="audioUri")
    graph_uri: str | None = Field(default=None, alias="graphUri")

    model_config = {"populate_by_name": True}


class RequestFeedbackPayload(BaseModel):
    """피드백 요청 페이로드"""

    session_id: str = Field(alias="sessionId")
    entities_count: int = Field(alias="entitiesCount")
    relations_count: int = Field(alias="relationsCount")
    duration_seconds: int = Field(alias="durationSeconds")

    model_config = {"populate_by_name": True}


# ============================================
# 에러
# ============================================


class ErrorPayload(BaseModel):
    """에러 페이로드"""

    code: ErrorCode
    message: str
    recoverable: bool
    details: dict[str, Any] | None = None


# ============================================
# WebSocket 메시지
# ============================================


class WSMessage(BaseModel):
    """WebSocket 메시지 기본 구조"""

    type: WSMessageType
    payload: dict[str, Any]
    timestamp: int
    message_id: str = Field(alias="messageId")

    model_config = {"populate_by_name": True}
