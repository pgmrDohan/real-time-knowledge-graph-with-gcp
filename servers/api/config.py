"""
서버 설정 모듈
환경 변수 및 GCP 설정값 관리
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """애플리케이션 설정"""

    # ============================================
    # GCP 기본 설정
    # ============================================
    gcp_project_id: str = Field(
        default="", description="GCP 프로젝트 ID"
    )
    gcp_region: str = Field(
        default="asia-northeast3", description="GCP 리전 (Cloud Run, Storage 등)"
    )

    # ============================================
    # Vertex AI (Gemini)
    # ============================================
    vertex_ai_location: str = Field(
        default="us-central1", 
        description="Vertex AI 리전 (모델 가용성에 따라 다름)"
    )
    vertex_ai_model: str = Field(
        default="gemini-2.5-flash-lite", description="Vertex AI 모델"
    )

    # ============================================
    # Cloud Speech-to-Text (Chirp 2 모델 BCP-47 코드)
    # ============================================
    speech_language_codes: str = Field(
        default="ko-KR",
        description="STT 지원 언어 코드 (us-central1에서는 단일 언어만 지원)"
    )

    # ============================================
    # Cloud Storage
    # ============================================
    gcs_bucket_name: str = Field(
        default="", description="Cloud Storage 버킷 이름"
    )

    # ============================================
    # BigQuery
    # ============================================
    bq_dataset_id: str = Field(
        default="knowledge_graph", description="BigQuery 데이터셋 ID"
    )

    # ============================================
    # Redis (Memorystore)
    # ============================================
    redis_host: str = Field(
        default="localhost", description="Redis 호스트"
    )
    redis_port: int = Field(
        default=6379, description="Redis 포트"
    )
    redis_password: str = Field(
        default="", description="Redis 비밀번호 (Memorystore AUTH)"
    )

    @property
    def redis_url(self) -> str:
        """Redis 연결 URL 생성"""
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/0"
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    # ============================================
    # VPC / 네트워크
    # ============================================
    vpc_connector: str = Field(
        default="", description="VPC 커넥터 이름 (Cloud Run용)"
    )

    # ============================================
    # Server
    # ============================================
    host: str = Field(default="0.0.0.0", description="서버 호스트")
    port: int = Field(default=8000, description="서버 포트")
    debug: bool = Field(default=False, description="디버그 모드")

    # ============================================
    # Logging
    # ============================================
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO", description="로그 레벨"
    )
    log_format: Literal["json", "console"] = Field(
        default="json", description="로그 포맷"
    )

    # ============================================
    # Processing
    # ============================================
    stt_chunk_duration_ms: int = Field(
        default=2000, description="STT 청크 지속 시간 (ms)"
    )
    extraction_batch_size: int = Field(
        default=3, description="추출 배치 크기 (문장 수)"
    )
    max_concurrent_extractions: int = Field(
        default=3, description="최대 동시 추출 작업 수"
    )

    # ============================================
    # Timeouts
    # ============================================
    stt_timeout_seconds: float = Field(default=30.0, description="STT 타임아웃")
    extraction_timeout_seconds: float = Field(
        default=60.0, description="추출 타임아웃"
    )

    # ============================================
    # Feedback
    # ============================================
    enable_feedback: bool = Field(
        default=True, description="피드백 기능 활성화"
    )
    feedback_improvement_threshold: float = Field(
        default=3.0, description="개선이 필요한 평균 평점 임계값"
    )

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }

    def get_language_codes(self) -> list[str]:
        """언어 코드 목록 반환"""
        return [code.strip() for code in self.speech_language_codes.split(",")]


@lru_cache
def get_settings() -> Settings:
    """싱글톤 설정 인스턴스 반환"""
    return Settings()
