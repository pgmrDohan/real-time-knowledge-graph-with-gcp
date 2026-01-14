"""
FastAPI 메인 애플리케이션
실시간 지식 그래프 API 서버
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from graph_state import get_graph_manager
from logger import get_logger, setup_logging
from nlp import get_nlp
from redis_client import redis_manager
from stt import get_stt
from websocket import ws_handler

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
        debug=settings.debug,
    )

    # 시작 시 초기화
    try:
        # Redis 연결
        await redis_manager.connect()

        # STT 초기화
        stt = await get_stt()

        # NLP 초기화
        nlp = await get_nlp()

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
    description="음성을 실시간으로 분석하여 지식 그래프를 생성하는 서비스",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 환경용, 프로덕션에서는 제한 필요
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
    return {"service": "realtime-knowledge-graph", "status": "running"}


@app.get("/health")
async def health_check() -> JSONResponse:
    """헬스 체크"""
    redis_healthy = await redis_manager.health_check()

    status = "healthy" if redis_healthy else "degraded"
    status_code = 200 if redis_healthy else 503

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



