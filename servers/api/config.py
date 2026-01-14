"""
서버 설정 모듈
환경 변수 및 설정값 관리
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """애플리케이션 설정"""

    # Gemini API
    gemini_api_key: str = Field(default="", description="Gemini API 키")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", description="Redis 연결 URL")

    # Server
    host: str = Field(default="0.0.0.0", description="서버 호스트")
    port: int = Field(default=8000, description="서버 포트")
    debug: bool = Field(default=True, description="디버그 모드")

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO", description="로그 레벨"
    )
    log_format: Literal["json", "console"] = Field(
        default="json", description="로그 포맷"
    )

    # Processing
    stt_chunk_duration_ms: int = Field(
        default=1000, description="STT 청크 지속 시간 (ms)"
    )
    extraction_batch_size: int = Field(
        default=3, description="추출 배치 크기 (문장 수)"
    )
    max_concurrent_extractions: int = Field(
        default=3, description="최대 동시 추출 작업 수"
    )

    # Timeouts
    stt_timeout_seconds: float = Field(default=30.0, description="STT 타임아웃")
    extraction_timeout_seconds: float = Field(default=60.0, description="추출 타임아웃")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache
def get_settings() -> Settings:
    """싱글톤 설정 인스턴스 반환"""
    return Settings()



