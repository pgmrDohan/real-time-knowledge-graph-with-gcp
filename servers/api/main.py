"""
FastAPI 메인 애플리케이션
실시간 지식 그래프 API 서버 (GCP 기반)
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from graph_state import get_graph_manager
from logger import get_logger, setup_logging
from nlp import get_nlp
from redis_client import redis_manager
from websocket import ws_handler

# GCP 서비스 임포트
from gcp.speech_to_text import get_speech_client
from gcp.vertex_ai import get_vertex_client
from gcp.storage import get_storage_client
from gcp.bigquery_client import get_bigquery_client
from gcp.feedback import get_feedback_manager

# 로깅 설정
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """애플리케이션 라이프사이클 관리"""
    import os
    
    # Cloud Run은 PORT 환경 변수를 자동 설정
    port = int(os.environ.get("PORT", "8000"))
    settings = get_settings()
    logger.info(
        "application_starting",
        host=settings.host,
        port=port,
        gcp_project=settings.gcp_project_id,
        region=settings.gcp_region,
    )

    # Redis 연결 (실패해도 애플리케이션은 시작)
    try:
        await redis_manager.connect()
        logger.info("redis_connection_initiated")
    except Exception as e:
        logger.warning("redis_connection_failed_continuing", error=str(e))
        # Redis 연결 실패해도 애플리케이션은 시작

    # GCP 서비스 초기화 (비동기로 처리하여 애플리케이션 시작을 블로킹하지 않음)
    async def initialize_services():
        try:
            logger.info("initializing_gcp_services")

            # Cloud Speech-to-Text v2
            try:
                await get_speech_client()
                logger.info("cloud_speech_initialized")
            except Exception as e:
                logger.warning("cloud_speech_init_failed", error=str(e))

            # Vertex AI
            try:
                await get_vertex_client()
                logger.info("vertex_ai_initialized")
            except Exception as e:
                logger.warning("vertex_ai_init_failed", error=str(e))

            # Cloud Storage (선택적)
            if settings.gcs_bucket_name:
                try:
                    await get_storage_client()
                    logger.info("cloud_storage_initialized")
                except Exception as e:
                    logger.warning("cloud_storage_init_failed", error=str(e))

            # BigQuery (선택적)
            if settings.enable_feedback:
                try:
                    await get_bigquery_client()
                    logger.info("bigquery_initialized")
                except Exception as e:
                    logger.warning("bigquery_init_failed", error=str(e))

            # NLP 초기화
            try:
                await get_nlp()
                logger.info("nlp_initialized")
            except Exception as e:
                logger.warning("nlp_init_failed", error=str(e))

            logger.info("service_initialization_completed")
        except Exception as e:
            logger.error("service_initialization_error", error=str(e))
            # 서비스 초기화 실패해도 애플리케이션은 계속 실행

    # 서비스 초기화를 백그라운드에서 실행 (애플리케이션 시작을 블로킹하지 않음)
    asyncio.create_task(initialize_services())

    logger.info("application_ready")
    yield

    # 종료 시 정리
    logger.info("application_shutting_down")
    try:
        await redis_manager.disconnect()
    except Exception:
        pass  # 이미 연결이 끊어진 경우 무시
    logger.info("application_stopped")


# FastAPI 앱 생성
app = FastAPI(
    title="실시간 지식 그래프 API",
    description="음성을 실시간으로 분석하여 지식 그래프를 생성하는 서비스 (GCP 기반)",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS 설정
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else ["https://*.run.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# REST 엔드포인트
# ============================================


@app.get("/")
async def root() -> dict[str, str]:
    """루트 엔드포인트"""
    return {
        "service": "realtime-knowledge-graph",
        "version": "2.0.0",
        "platform": "Google Cloud Platform",
        "status": "running",
    }


@app.get("/health")
async def health_check() -> JSONResponse:
    """헬스 체크"""
    try:
        redis_healthy = await redis_manager.health_check()
    except Exception as e:
        logger.error("health_check_error", error=str(e))
        redis_healthy = False

    # 서비스는 실행 중이므로 항상 200 반환, Redis 상태는 degraded로 표시
    status = "healthy" if redis_healthy else "degraded"
    status_code = 200

    return JSONResponse(
        status_code=status_code,
        content={
            "status": status,
            "components": {
                "redis": "healthy" if redis_healthy else "unhealthy",
            },
        },
    )


@app.get("/api/graph/{session_id}")
async def get_graph_state(session_id: str) -> dict:
    """세션의 그래프 상태 조회"""
    manager = await get_graph_manager()
    state = await manager.get_full_state_for_client(session_id)
    return state


@app.delete("/api/graph/{session_id}")
async def reset_graph_state(session_id: str) -> dict[str, str]:
    """세션의 그래프 상태 초기화"""
    manager = await get_graph_manager()
    await manager.reset_state(session_id)
    return {"status": "reset", "session_id": session_id}


@app.get("/api/feedback/analytics")
async def get_feedback_analytics() -> dict:
    """피드백 분석 통계 조회"""
    settings = get_settings()
    if not settings.enable_feedback:
        raise HTTPException(status_code=404, detail="Feedback feature is disabled")

    feedback_manager = await get_feedback_manager()
    return await feedback_manager.get_analytics()


# ============================================
# WebSocket 엔드포인트
# ============================================


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """실시간 오디오 처리 WebSocket"""
    await ws_handler.handle_connection(websocket)


# ============================================
# 개발용 엔트리포인트
# ============================================

if __name__ == "__main__":
    import os
    import uvicorn

    settings = get_settings()
    # Cloud Run은 PORT 환경 변수를 자동 설정
    port = int(os.environ.get("PORT", settings.port))
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
