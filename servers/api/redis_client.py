"""
Redis 클라이언트 및 큐 관리
"""

import asyncio
import json
from typing import Any, AsyncGenerator

import redis.asyncio as redis
from redis.asyncio import Redis

from config import get_settings
from logger import get_logger

logger = get_logger(__name__)


class RedisManager:
    """Redis 연결 및 큐 관리자"""

    # 큐 키 상수
    AUDIO_BUFFER = "rkg:audio_buffer"
    STT_BUFFER = "rkg:stt_buffer"
    EXTRACTION_QUEUE = "rkg:extraction_queue"
    GRAPH_STATE = "rkg:graph_state"
    PROCESSING_STATUS = "rkg:processing_status"

    def __init__(self) -> None:
        self._client: Redis | None = None
        self._pubsub: redis.client.PubSub | None = None

    async def connect(self) -> None:
        """Redis 연결"""
        settings = get_settings()
        self._client = await redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        logger.info("redis_connected", url=settings.redis_url)

    async def disconnect(self) -> None:
        """Redis 연결 해제"""
        if self._pubsub:
            await self._pubsub.close()
        if self._client:
            await self._client.close()
        logger.info("redis_disconnected")

    @property
    def client(self) -> Redis:
        """Redis 클라이언트 반환"""
        if not self._client:
            raise RuntimeError("Redis not connected")
        return self._client

    # ============================================
    # 오디오 버퍼 (Sorted Set - 시퀀스 번호 기준)
    # ============================================

    async def push_audio_chunk(
        self, session_id: str, sequence: int, data: str
    ) -> None:
        """오디오 청크 추가"""
        key = f"{self.AUDIO_BUFFER}:{session_id}"
        await self.client.zadd(key, {data: sequence})
        await self.client.expire(key, 3600)  # 1시간 TTL

    async def pop_audio_chunks(
        self, session_id: str, count: int = 10
    ) -> list[tuple[str, float]]:
        """오디오 청크 팝 (시퀀스 순서대로)"""
        key = f"{self.AUDIO_BUFFER}:{session_id}"
        # ZPOPMIN: 가장 낮은 점수(시퀀스)부터 팝
        chunks = await self.client.zpopmin(key, count)
        return chunks

    async def get_audio_buffer_size(self, session_id: str) -> int:
        """오디오 버퍼 크기 확인"""
        key = f"{self.AUDIO_BUFFER}:{session_id}"
        return await self.client.zcard(key)

    # ============================================
    # STT 버퍼 (List - FIFO)
    # ============================================

    async def push_stt_result(self, session_id: str, result: dict[str, Any]) -> None:
        """STT 결과 추가"""
        key = f"{self.STT_BUFFER}:{session_id}"
        await self.client.rpush(key, json.dumps(result, ensure_ascii=False))
        await self.client.expire(key, 3600)

    async def pop_stt_results(
        self, session_id: str, count: int = 5
    ) -> list[dict[str, Any]]:
        """STT 결과 팝"""
        key = f"{self.STT_BUFFER}:{session_id}"
        results = []
        for _ in range(count):
            data = await self.client.lpop(key)
            if data:
                results.append(json.loads(data))
            else:
                break
        return results

    async def get_stt_buffer_size(self, session_id: str) -> int:
        """STT 버퍼 크기 확인"""
        key = f"{self.STT_BUFFER}:{session_id}"
        return await self.client.llen(key)

    # ============================================
    # 추출 큐 (Stream)
    # ============================================

    async def push_extraction_task(
        self, session_id: str, task: dict[str, Any]
    ) -> str:
        """추출 작업 추가"""
        key = f"{self.EXTRACTION_QUEUE}:{session_id}"
        task_id = await self.client.xadd(
            key, {"data": json.dumps(task, ensure_ascii=False)}, maxlen=1000
        )
        return task_id

    async def read_extraction_tasks(
        self, session_id: str, count: int = 1, block_ms: int = 0
    ) -> list[tuple[str, dict[str, Any]]]:
        """추출 작업 읽기"""
        key = f"{self.EXTRACTION_QUEUE}:{session_id}"
        
        # XREAD로 새 메시지 읽기
        result = await self.client.xread(
            {key: "0"}, count=count, block=block_ms
        )
        
        tasks = []
        if result:
            for _, messages in result:
                for msg_id, msg_data in messages:
                    data = json.loads(msg_data["data"])
                    tasks.append((msg_id, data))
        return tasks

    async def ack_extraction_task(self, session_id: str, task_id: str) -> None:
        """추출 작업 완료 처리"""
        key = f"{self.EXTRACTION_QUEUE}:{session_id}"
        await self.client.xdel(key, task_id)

    # ============================================
    # 그래프 상태 (String - JSON)
    # ============================================

    async def save_graph_state(
        self, session_id: str, state: dict[str, Any]
    ) -> None:
        """그래프 상태 저장"""
        key = f"{self.GRAPH_STATE}:{session_id}"
        await self.client.set(
            key, json.dumps(state, ensure_ascii=False), ex=86400
        )  # 24시간 TTL

    async def load_graph_state(self, session_id: str) -> dict[str, Any] | None:
        """그래프 상태 로드"""
        key = f"{self.GRAPH_STATE}:{session_id}"
        data = await self.client.get(key)
        if data:
            return json.loads(data)
        return None

    async def save_graph_snapshot(
        self, session_id: str, version: int, state: dict[str, Any]
    ) -> None:
        """그래프 스냅샷 저장"""
        key = f"{self.GRAPH_STATE}:{session_id}:snapshot:{version}"
        await self.client.set(
            key, json.dumps(state, ensure_ascii=False), ex=86400
        )

    # ============================================
    # Pub/Sub
    # ============================================

    async def publish_event(
        self, channel: str, event: dict[str, Any]
    ) -> int:
        """이벤트 발행"""
        return await self.client.publish(
            channel, json.dumps(event, ensure_ascii=False)
        )

    async def subscribe(self, channel: str) -> AsyncGenerator[dict[str, Any], None]:
        """채널 구독"""
        if not self._pubsub:
            self._pubsub = self.client.pubsub()
        
        await self._pubsub.subscribe(channel)
        
        try:
            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    yield json.loads(message["data"])
        finally:
            await self._pubsub.unsubscribe(channel)

    # ============================================
    # 유틸리티
    # ============================================

    async def clear_session(self, session_id: str) -> None:
        """세션 관련 모든 키 삭제"""
        keys = await self.client.keys(f"rkg:*:{session_id}*")
        if keys:
            await self.client.delete(*keys)
        logger.info("session_cleared", session_id=session_id, keys_deleted=len(keys))

    async def health_check(self) -> bool:
        """Redis 연결 상태 확인"""
        if not self._client:
            logger.warning("redis_not_connected_for_health_check")
            return False
        try:
            await self._client.ping()
            return True
        except Exception as e:
            logger.error("redis_health_check_failed", error=str(e))
            return False


# 싱글톤 인스턴스
redis_manager = RedisManager()


async def get_redis() -> RedisManager:
    """Redis 매니저 의존성"""
    return redis_manager



