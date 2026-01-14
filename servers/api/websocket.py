"""
WebSocket 엔드포인트 및 실시간 처리 파이프라인
멀티태스킹 기반 병렬 처리
"""

import asyncio
import base64
import time
import uuid
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from config import get_settings
from extraction import get_extraction_pipeline
from graph_state import get_graph_manager
from logger import LogContext, get_logger
from models import (
    AudioChunkPayload,
    AudioFormat,
    ErrorCode,
    ErrorPayload,
    GraphDelta,
    ProcessingStage,
    ProcessingStatusPayload,
    STTFinalPayload,
    STTPartialPayload,
    WSMessage,
    WSMessageType,
)
from nlp import KoreanNLP, SemanticChunkBuilder, get_nlp
from redis_client import get_redis
from stt import GeminiSTT, STTAccumulator, get_stt

logger = get_logger(__name__)


class SessionState:
    """WebSocket 세션 상태"""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.audio_format: AudioFormat | None = None
        self.is_active = True
        self.sequence_counter = 0
        self.created_at = time.time()
        self.last_activity = time.time()


class RealtimePipeline:
    """
    실시간 처리 파이프라인 - 병렬 멀티태스킹
    
    3개의 독립적인 워커가 병렬로 실행:
    1. STT Worker: 오디오 → 텍스트 (5초마다 계속 실행)
    2. NLP Worker: 텍스트 → 문장 분리/분석 (STT 결과 즉시 처리)
    3. Extraction Worker: 완성된 문장 → 엔티티/관계 추출 (문장 완성 시 처리)
    """

    def __init__(
        self,
        websocket: WebSocket,
        session: SessionState,
        stt: GeminiSTT,
        nlp: KoreanNLP,
    ) -> None:
        self._ws = websocket
        self._session = session
        self._stt = stt
        self._nlp = nlp
        
        # 독립적인 비동기 큐 (병렬 처리용)
        self._audio_queue: asyncio.Queue[tuple[bytes, AudioFormat]] = asyncio.Queue(maxsize=100)
        self._text_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        self._sentence_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        
        # 텍스트 누적 버퍼 (NLP 워커용)
        self._text_buffer: str = ""
        self._text_lock = asyncio.Lock()
        
        # 태스크
        self._tasks: list[asyncio.Task[Any]] = []

    async def start(self) -> None:
        """파이프라인 시작 - 3개의 독립적인 워커 실행"""
        self._tasks = [
            asyncio.create_task(self._stt_worker(), name="stt_worker"),
            asyncio.create_task(self._nlp_worker(), name="nlp_worker"),
            asyncio.create_task(self._extraction_worker(), name="extraction_worker"),
        ]
        logger.info("pipeline_started", session_id=self._session.session_id, workers=3)

    async def stop(self) -> None:
        """파이프라인 중지"""
        self._session.is_active = False
        
        for task in self._tasks:
            task.cancel()
        
        await asyncio.gather(*self._tasks, return_exceptions=True)
        logger.info("pipeline_stopped", session_id=self._session.session_id)

    async def process_audio_chunk(self, payload: AudioChunkPayload) -> None:
        """오디오 청크를 큐에 추가 (논블로킹)"""
        try:
            audio_data = base64.b64decode(payload.data)
            
            logger.debug("audio_chunk_received", size=len(audio_data), seq=payload.sequence_number)
            
            # 큐가 가득 차면 오래된 것 버림 (백프레셔)
            if self._audio_queue.full():
                try:
                    self._audio_queue.get_nowait()
                    logger.warning("audio_queue_full_dropped")
                except asyncio.QueueEmpty:
                    pass
            
            await self._audio_queue.put((audio_data, payload.format))
            self._session.last_activity = time.time()
            
            logger.debug("audio_chunk_queued", queue_size=self._audio_queue.qsize())
            
        except Exception as e:
            logger.error("audio_chunk_error", error=str(e))

    # ============================================
    # Worker 1: STT (완전 독립 실행)
    # ============================================
    async def _stt_worker(self) -> None:
        """STT 워커 - 오디오 청크를 받아서 텍스트로 변환"""
        logger.info("stt_worker_started")
        
        while self._session.is_active:
            try:
                # 오디오 청크 대기 (타임아웃으로 주기적 체크)
                try:
                    audio_data, audio_format = await asyncio.wait_for(
                        self._audio_queue.get(), timeout=0.5
                    )
                except asyncio.TimeoutError:
                    continue

                logger.info("stt_processing_audio", size=len(audio_data), codec=audio_format.codec)
                
                # 상태 업데이트
                await self._send_status(ProcessingStage.STT_PROCESSING)
                
                segment_id = f"{self._session.session_id}_{self._session.sequence_counter}"
                self._session.sequence_counter += 1

                # STT 처리 (별도 스레드에서 실행되므로 블로킹 안 함)
                result = await self._stt.transcribe_chunk(
                    audio_data, audio_format, segment_id
                )

                if result and result.text.strip():
                    # 부분 결과 클라이언트로 전송
                    await self._send_stt_partial(result)
                    
                    # 텍스트 큐에 추가 (NLP 워커로 전달)
                    await self._text_queue.put(result.text)
                    
                    logger.debug("stt_result", text=result.text[:50])

                await self._send_status(ProcessingStage.IDLE)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("stt_worker_error", error=str(e))
                await asyncio.sleep(0.1)

        logger.info("stt_worker_stopped")

    # ============================================
    # Worker 2: NLP (문장 분리 및 분석)
    # ============================================
    async def _nlp_worker(self) -> None:
        """NLP 워커 - 텍스트를 받아서 문장 단위로 분리"""
        logger.info("nlp_worker_started")
        
        text_buffer = ""
        
        while self._session.is_active:
            try:
                # 텍스트 대기
                try:
                    new_text = await asyncio.wait_for(
                        self._text_queue.get(), timeout=0.5
                    )
                except asyncio.TimeoutError:
                    # 타임아웃 시에도 버퍼에 완성된 문장 있으면 처리
                    if text_buffer:
                        sentences = self._extract_complete_sentences(text_buffer)
                        if sentences:
                            for sent, remaining in sentences:
                                await self._sentence_queue.put(sent)
                                text_buffer = remaining
                    continue

                await self._send_status(ProcessingStage.NLP_ANALYZING)
                
                # 버퍼에 추가
                text_buffer += " " + new_text
                text_buffer = text_buffer.strip()
                
                # 완성된 문장 추출
                sentences = self._extract_complete_sentences(text_buffer)
                
                for sentence, remaining in sentences:
                    # 최종 STT 결과 전송
                    await self._send_stt_final(
                        STTFinalPayload(
                            text=sentence,
                            confidence=0.9,
                            segmentId=f"{self._session.session_id}_sent",
                            morphemes=None,
                            isComplete=True,
                        )
                    )
                    
                    # 추출 큐에 추가
                    await self._sentence_queue.put(sentence)
                    text_buffer = remaining
                    
                    logger.debug("sentence_complete", text=sentence[:50])

                await self._send_status(ProcessingStage.IDLE)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("nlp_worker_error", error=str(e))
                await asyncio.sleep(0.1)

        logger.info("nlp_worker_stopped")

    def _extract_complete_sentences(self, text: str) -> list[tuple[str, str]]:
        """완성된 문장 추출 (문장, 남은텍스트) 튜플 리스트 반환"""
        results = []
        
        # 문장 종결 패턴
        endings = ["다.", "요.", "니다.", "세요.", "까요?", "습니다.", "입니다.", "네요.", "죠.", "요?"]
        
        remaining = text
        for ending in endings:
            while ending in remaining:
                idx = remaining.find(ending)
                if idx != -1:
                    sentence = remaining[:idx + len(ending)].strip()
                    remaining = remaining[idx + len(ending):].strip()
                    if len(sentence) > 10:  # 너무 짧은 문장 제외
                        results.append((sentence, remaining))
        
        # 마지막 remaining 업데이트
        if results:
            results[-1] = (results[-1][0], remaining)
        
        return results

    # ============================================
    # Worker 3: Extraction (엔티티/관계 추출)
    # ============================================
    async def _extraction_worker(self) -> None:
        """추출 워커 - 완성된 문장에서 엔티티/관계 추출"""
        logger.info("extraction_worker_started")
        
        pipeline = await get_extraction_pipeline()
        graph_manager = await get_graph_manager()
        
        # 배치 처리를 위한 버퍼
        sentence_buffer: list[str] = []
        last_extraction_time = time.time()
        
        while self._session.is_active:
            try:
                # 문장 대기
                try:
                    sentence = await asyncio.wait_for(
                        self._sentence_queue.get(), timeout=1.0
                    )
                    sentence_buffer.append(sentence)
                except asyncio.TimeoutError:
                    pass

                # 추출 조건: 3문장 이상 또는 5초 경과
                should_extract = (
                    len(sentence_buffer) >= 3 or 
                    (sentence_buffer and time.time() - last_extraction_time > 5)
                )
                
                if not should_extract:
                    continue

                await self._send_status(ProcessingStage.EXTRACTING)
                
                # 문장들을 하나의 텍스트로 결합
                combined_text = " ".join(sentence_buffer)
                sentence_buffer = []
                last_extraction_time = time.time()
                
                # 현재 그래프 상태 조회
                current_state = await graph_manager.get_state(self._session.session_id)

                # 추출 실행
                extraction_result = await pipeline.process_chunk(
                    text=combined_text,
                    morphemes=None,
                    existing_entities=current_state.entities,
                    existing_relations=current_state.relations,
                )

                # 결과가 있으면 그래프 업데이트
                if extraction_result.entities or extraction_result.relations:
                    await self._send_status(ProcessingStage.UPDATING_GRAPH)
                    
                    delta = await graph_manager.apply_extraction(
                        self._session.session_id, extraction_result
                    )
                    
                    await self._send_graph_delta(delta)
                    
                    logger.info(
                        "extraction_complete",
                        entities=len(extraction_result.entities),
                        relations=len(extraction_result.relations),
                    )

                await self._send_status(ProcessingStage.IDLE)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("extraction_worker_error", error=str(e))
                await asyncio.sleep(0.1)

        logger.info("extraction_worker_stopped")

    # ============================================
    # 메시지 전송 헬퍼
    # ============================================

    async def _send_message(self, msg_type: WSMessageType, payload: dict[str, Any]) -> None:
        """WebSocket 메시지 전송"""
        try:
            message = WSMessage(
                type=msg_type,
                payload=payload,
                timestamp=int(time.time() * 1000),
                messageId=str(uuid.uuid4()),
            )
            await self._ws.send_json(message.model_dump(by_alias=True))
        except Exception as e:
            logger.error("send_message_error", error=str(e))

    async def _send_status(self, stage: ProcessingStage, chunk_id: str | None = None) -> None:
        """처리 상태 전송"""
        payload = ProcessingStatusPayload(
            stage=stage,
            chunkId=chunk_id,
        )
        await self._send_message(
            WSMessageType.PROCESSING_STATUS, payload.model_dump(by_alias=True)
        )

    async def _send_stt_partial(self, result: STTPartialPayload) -> None:
        """부분 STT 결과 전송"""
        await self._send_message(
            WSMessageType.STT_PARTIAL, result.model_dump(by_alias=True)
        )

    async def _send_stt_final(self, result: STTFinalPayload) -> None:
        """최종 STT 결과 전송"""
        await self._send_message(
            WSMessageType.STT_FINAL, result.model_dump(by_alias=True)
        )

    async def _send_graph_delta(self, delta: GraphDelta) -> None:
        """그래프 델타 전송"""
        await self._send_message(
            WSMessageType.GRAPH_DELTA, delta.model_dump(by_alias=True)
        )

    async def _send_error(
        self, code: ErrorCode, message: str, recoverable: bool = True
    ) -> None:
        """에러 전송"""
        payload = ErrorPayload(
            code=code,
            message=message,
            recoverable=recoverable,
        )
        await self._send_message(WSMessageType.ERROR, payload.model_dump())


class WebSocketHandler:
    """WebSocket 연결 핸들러"""

    def __init__(self) -> None:
        self._active_sessions: dict[str, SessionState] = {}

    async def handle_connection(self, websocket: WebSocket) -> None:
        """WebSocket 연결 처리"""
        await websocket.accept()

        session_id = str(uuid.uuid4())
        session = SessionState(session_id)
        self._active_sessions[session_id] = session

        with LogContext(session_id=session_id):
            logger.info("websocket_connected")

            # 의존성 주입
            stt = await get_stt()
            nlp = await get_nlp()
            graph_manager = await get_graph_manager()

            # 파이프라인 생성
            pipeline = RealtimePipeline(websocket, session, stt, nlp)

            try:
                # 초기 그래프 상태 전송
                initial_state = await graph_manager.get_full_state_for_client(session_id)
                await self._send_message(
                    websocket,
                    WSMessageType.GRAPH_FULL,
                    initial_state,
                )

                # 파이프라인 시작 (3개 워커 병렬 실행)
                await pipeline.start()

                # 메시지 수신 루프
                while session.is_active:
                    try:
                        data = await websocket.receive_json()
                        await self._handle_message(websocket, session, pipeline, data)
                    except WebSocketDisconnect:
                        break

            except Exception as e:
                logger.error("websocket_error", error=str(e))
            finally:
                session.is_active = False
                await pipeline.stop()
                
                # Redis 정리
                redis = await get_redis()
                await redis.clear_session(session_id)
                
                del self._active_sessions[session_id]
                logger.info("websocket_disconnected")

    async def _handle_message(
        self,
        websocket: WebSocket,
        session: SessionState,
        pipeline: RealtimePipeline,
        data: dict[str, Any],
    ) -> None:
        """수신 메시지 처리"""
        try:
            msg_type = WSMessageType(data.get("type", ""))
            payload = data.get("payload", {})

            match msg_type:
                case WSMessageType.AUDIO_CHUNK:
                    chunk_payload = AudioChunkPayload(**payload)
                    session.audio_format = chunk_payload.format
                    # 논블로킹으로 오디오 큐에 추가
                    asyncio.create_task(pipeline.process_audio_chunk(chunk_payload))

                case WSMessageType.START_SESSION:
                    logger.info("session_started", session_id=session.session_id)

                case WSMessageType.END_SESSION:
                    session.is_active = False
                    logger.info("session_ended", session_id=session.session_id)

                case WSMessageType.PING:
                    await self._send_message(websocket, WSMessageType.PONG, {})

                case _:
                    logger.warning("unknown_message_type", type=msg_type)

        except Exception as e:
            logger.error("message_handling_error", error=str(e))
            await self._send_error(
                websocket, ErrorCode.INTERNAL_ERROR, str(e)
            )

    async def _send_message(
        self, websocket: WebSocket, msg_type: WSMessageType, payload: dict[str, Any]
    ) -> None:
        """메시지 전송"""
        message = WSMessage(
            type=msg_type,
            payload=payload,
            timestamp=int(time.time() * 1000),
            messageId=str(uuid.uuid4()),
        )
        await websocket.send_json(message.model_dump(by_alias=True))

    async def _send_error(
        self, websocket: WebSocket, code: ErrorCode, message: str
    ) -> None:
        """에러 전송"""
        payload = ErrorPayload(
            code=code,
            message=message,
            recoverable=True,
        )
        await self._send_message(websocket, WSMessageType.ERROR, payload.model_dump())


# 싱글톤 핸들러
ws_handler = WebSocketHandler()
