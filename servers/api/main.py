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
    settings = get_settings()
    logger.info(
        "application_starting",
        host=settings.host,
        port=settings.port,
        gcp_project=settings.gcp_project_id,
        region=settings.gcp_region,
    )

    try:
        # Redis 연결
        await redis_manager.connect()

        # GCP 서비스 초기화
        logger.info("initializing_gcp_services")

        # Cloud Speech-to-Text v2
        await get_speech_client()
        logger.info("cloud_speech_initialized")

        # Vertex AI
        await get_vertex_client()
        logger.info("vertex_ai_initialized")

        # Cloud Storage (선택적)
        if settings.gcs_bucket_name:
            await get_storage_client()
            logger.info("cloud_storage_initialized")

        # BigQuery (선택적)
        if settings.enable_feedback:
            await get_bigquery_client()
            logger.info("bigquery_initialized")

        # NLP 초기화
        await get_nlp()
        logger.info("nlp_initialized")

        logger.info("application_initialized")

    except Exception as e:
        logger.error("initialization_failed", error=str(e))
        raise

    yield

    # 종료 시 정리
    logger.info("application_shutting_down")
    await redis_manager.disconnect()
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
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
