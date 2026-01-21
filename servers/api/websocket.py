"""
WebSocket 엔드포인트 및 실시간 처리 파이프라인
멀티태스킹 기반 병렬 처리 + GCP 통합
"""

import asyncio
import base64
import time
import uuid
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from config import get_settings
from extraction import get_extraction_pipeline
from gcp.speech_to_text import get_speech_client
from gcp.feedback import get_feedback_manager
from gcp.storage import get_storage_client
from gcp.bigquery_client import get_bigquery_client
from graph_state import get_graph_manager
from logger import LogContext, get_logger
from models import (
    AudioChunkPayload,
    AudioFormat,
    ErrorCode,
    ErrorPayload,
    FeedbackPayload,
    FeedbackResultPayload,
    GraphDelta,
    ProcessingStage,
    ProcessingStatusPayload,
    RequestFeedbackPayload,
    STTFinalPayload,
    STTPartialPayload,
    WSMessage,
    WSMessageType,
)
from nlp import KoreanNLP, get_nlp
from redis_client import get_redis
from stt import STTAccumulator

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
        self.language_codes: list[str] | None = None
        
        # 세션 데이터 (피드백용)
        self.accumulated_audio: list[bytes] = []
        self.total_audio_duration_ms = 0
        
        # 연결 종료 시 Redis 데이터 삭제 여부
        self.should_clear_data = False


class RealtimePipeline:
    """
    실시간 처리 파이프라인 - 병렬 멀티태스킹
    
    3개의 독립적인 워커가 병렬로 실행:
    1. STT Worker: 오디오 → 텍스트 (Cloud Speech-to-Text v2)
    2. NLP Worker: 텍스트 → 문장 분리/분석
    3. Extraction Worker: 완성된 문장 → 엔티티/관계 추출 (Vertex AI)
    """

    def __init__(
        self,
        websocket: WebSocket,
        session: SessionState,
        nlp: KoreanNLP,
    ) -> None:
        self._ws = websocket
        self._session = session
        self._nlp = nlp
        
        # 독립적인 비동기 큐 (병렬 처리용)
        self._audio_queue: asyncio.Queue[tuple[bytes, AudioFormat]] = asyncio.Queue(maxsize=100)
        self._text_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        self._sentence_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        
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
            
            # 세션 오디오 누적 (피드백용)
            self._session.accumulated_audio.append(audio_data)
            self._session.total_audio_duration_ms += payload.duration
            
            # 큐가 가득 차면 오래된 것 버림 (백프레셔)
            if self._audio_queue.full():
                try:
                    self._audio_queue.get_nowait()
                    logger.warning("audio_queue_full_dropped")
                except asyncio.QueueEmpty:
                    pass
            
            await self._audio_queue.put((audio_data, payload.format))
            self._session.last_activity = time.time()
            
        except Exception as e:
            logger.error("audio_chunk_error", error=str(e))

    # ============================================
    # Worker 1: STT (Cloud Speech-to-Text v2)
    # ============================================
    async def _stt_worker(self) -> None:
        """STT 워커 - 오디오 청크를 받아서 텍스트로 변환"""
        logger.info("stt_worker_started")
        
        speech_client = await get_speech_client()
        settings = get_settings()
        language_codes = self._session.language_codes or settings.get_language_codes()
        
        while self._session.is_active:
            try:
                # 오디오 청크 대기
                try:
                    audio_data, audio_format = await asyncio.wait_for(
                        self._audio_queue.get(), timeout=0.5
                    )
                except asyncio.TimeoutError:
                    continue

                logger.info("stt_processing_audio", size=len(audio_data), codec=audio_format.codec)
                
                await self._send_status(ProcessingStage.STT_PROCESSING)
                
                segment_id = f"{self._session.session_id}_{self._session.sequence_counter}"
                self._session.sequence_counter += 1

                # Cloud Speech-to-Text v2 처리
                result = await speech_client.transcribe_chunk(
                    audio_data, audio_format, segment_id, language_codes
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
        sentence_counter = 0
        last_text_time = time.time()
        FORCE_FLUSH_TIMEOUT = 3.0  # 3초 동안 새 텍스트 없으면 강제 확정
        MIN_FLUSH_LENGTH = 50  # 최소 10자 이상이면 강제 확정 대상
        
        while self._session.is_active:
            try:
                try:
                    new_text = await asyncio.wait_for(
                        self._text_queue.get(), timeout=0.5
                    )
                    last_text_time = time.time()
                except asyncio.TimeoutError:
                    # 타임아웃: 버퍼에 텍스트가 있고 오래 되었으면 강제 확정
                    if text_buffer and len(text_buffer) >= MIN_FLUSH_LENGTH:
                        time_since_last = time.time() - last_text_time
                        if time_since_last >= FORCE_FLUSH_TIMEOUT:
                            # 완전한 문장이 아니어도 강제 확정
                            sentence_counter += 1
                            await self._send_stt_final(
                                STTFinalPayload(
                                    text=text_buffer.strip(),
                                    confidence=0.85,
                                    segmentId=f"{self._session.session_id}_sent_{sentence_counter}",
                                    morphemes=None,
                                    isComplete=True,
                                )
                            )
                            await self._sentence_queue.put(text_buffer.strip())
                            text_buffer = ""
                            logger.debug("forced_flush_incomplete_sentence")
                    continue

                await self._send_status(ProcessingStage.NLP_ANALYZING)
                
                text_buffer += " " + new_text
                text_buffer = text_buffer.strip()
                
                sentences = self._extract_complete_sentences(text_buffer)
                
                for sentence, remaining in sentences:
                    sentence_counter += 1
                    await self._send_stt_final(
                        STTFinalPayload(
                            text=sentence,
                            confidence=0.9,
                            segmentId=f"{self._session.session_id}_sent_{sentence_counter}",
                            morphemes=None,
                            isComplete=True,
                        )
                    )
                    
                    await self._sentence_queue.put(sentence)
                    text_buffer = remaining

                await self._send_status(ProcessingStage.IDLE)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("nlp_worker_error", error=str(e))
                await asyncio.sleep(0.1)

        logger.info("nlp_worker_stopped")

    def _extract_complete_sentences(self, text: str) -> list[tuple[str, str]]:
        """완성된 문장 추출 (다국어 지원, 유연한 매칭)"""
        results = []
        
        # 다국어 문장 종결 패턴 (우선순위 순서)
        endings = [
            # 한국어 종결 어미
            "습니다.", "입니다.", "합니다.", "됩니다.", "있습니다.", "없습니다.",
            "니다.", "세요.", "까요?", "나요?", "네요.", "군요.", "거든요.",
            "다.", "요.", "죠.", "요?", "죠?",
            # 영어/일반
            ". ", "! ", "? ", ".\n", "!\n", "?\n",
            # 일본어/중국어
            "。", "！", "？",
            # 쉼표로 끊기는 경우도 긴 텍스트면 분리
        ]
        
        remaining = text
        found_any = True
        
        while found_any:
            found_any = False
            best_idx = -1
            best_ending = ""
            
            # 가장 먼저 나오는 종결 패턴 찾기
            for ending in endings:
                idx = remaining.find(ending)
                if idx != -1 and (best_idx == -1 or idx < best_idx):
                    best_idx = idx
                    best_ending = ending
                    found_any = True
            
            if found_any and best_idx != -1:
                sentence = remaining[:best_idx + len(best_ending)].strip()
                remaining = remaining[best_idx + len(best_ending):].strip()
                if len(sentence) > 3:  # 최소 3자 이상
                    results.append((sentence, remaining))
        
        return results

    # ============================================
    # Worker 3: Extraction (Vertex AI Gemini)
    # ============================================
    async def _extraction_worker(self) -> None:
        """추출 워커 - Vertex AI로 엔티티/관계 추출"""
        logger.info("extraction_worker_started")
        
        pipeline = await get_extraction_pipeline()
        graph_manager = await get_graph_manager()
        
        sentence_buffer: list[str] = []
        last_extraction_time = time.time()
        
        while self._session.is_active:
            try:
                try:
                    sentence = await asyncio.wait_for(
                        self._sentence_queue.get(), timeout=1.0
                    )
                    sentence_buffer.append(sentence)
                except asyncio.TimeoutError:
                    pass

                should_extract = (
                    len(sentence_buffer) >= 3 or 
                    (sentence_buffer and time.time() - last_extraction_time > 5)
                )
                
                if not should_extract:
                    continue

                await self._send_status(ProcessingStage.EXTRACTING)
                
                combined_text = " ".join(sentence_buffer)
                sentence_buffer = []
                last_extraction_time = time.time()
                
                current_state = await graph_manager.get_state(self._session.session_id)

                extraction_result = await pipeline.process_chunk(
                    text=combined_text,
                    morphemes=None,
                    existing_entities=current_state.entities,
                    existing_relations=current_state.relations,
                )

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
        payload = ProcessingStatusPayload(stage=stage, chunkId=chunk_id)
        await self._send_message(WSMessageType.PROCESSING_STATUS, payload.model_dump(by_alias=True))

    async def _send_stt_partial(self, result: STTPartialPayload) -> None:
        await self._send_message(WSMessageType.STT_PARTIAL, result.model_dump(by_alias=True))

    async def _send_stt_final(self, result: STTFinalPayload) -> None:
        await self._send_message(WSMessageType.STT_FINAL, result.model_dump(by_alias=True))

    async def _send_graph_delta(self, delta: GraphDelta) -> None:
        await self._send_message(WSMessageType.GRAPH_DELTA, delta.model_dump(by_alias=True))

    async def _send_error(self, code: ErrorCode, message: str, recoverable: bool = True) -> None:
        payload = ErrorPayload(code=code, message=message, recoverable=recoverable)
        await self._send_message(WSMessageType.ERROR, payload.model_dump())


class WebSocketHandler:
    """WebSocket 연결 핸들러"""

    def __init__(self) -> None:
        self._active_sessions: dict[str, SessionState] = {}
        # 세션 ID → 연결 ID 매핑 (재연결 지원)
        self._session_connections: dict[str, str] = {}

    async def handle_connection(self, websocket: WebSocket) -> None:
        """WebSocket 연결 처리"""
        await websocket.accept()

        # 임시 연결 ID (START_SESSION에서 실제 session_id로 교체)
        connection_id = str(uuid.uuid4())
        session_id = connection_id  # 초기값
        session = SessionState(session_id)
        self._active_sessions[connection_id] = session
        
        # session_id가 변경되었는지 추적
        session_id_confirmed = False

        with LogContext(session_id=session_id):
            logger.info("websocket_connected", connection_id=connection_id)

            nlp = await get_nlp()
            graph_manager = await get_graph_manager()

            pipeline: RealtimePipeline | None = None

            try:
                # 메시지 수신 루프 (START_SESSION을 먼저 기다림)
                while True:
                    try:
                        data = await websocket.receive_json()
                        msg_type = data.get("type", "")
                        payload = data.get("payload", {})
                        
                        # START_SESSION에서 클라이언트 session_id 처리
                        if msg_type == "START_SESSION" and not session_id_confirmed:
                            client_session_id = payload.get("sessionId")
                            if client_session_id:
                                # 클라이언트가 제공한 session_id 사용
                                session_id = client_session_id
                                session.session_id = session_id
                                logger.info("session_id_restored", 
                                           client_session_id=client_session_id,
                                           connection_id=connection_id)
                            
                            session_id_confirmed = True
                            
                            # BigQuery에 세션 시작 이벤트 기록
                            settings = get_settings()
                            if settings.enable_feedback:
                                try:
                                    bigquery = await get_bigquery_client()
                                    await bigquery.insert_session_event(
                                        session_id, "session_start", {"timestamp": time.time()}
                                    )
                                except Exception as e:
                                    logger.warning("session_event_logging_failed", error=str(e))

                            # 초기 그래프 상태 전송 (기존 세션 복원)
                            initial_state = await graph_manager.get_full_state_for_client(session_id)
                            await self._send_message(websocket, WSMessageType.GRAPH_FULL, initial_state)

                            # 파이프라인 시작
                            pipeline = RealtimePipeline(websocket, session, nlp)
                            await pipeline.start()
                            
                            # 언어 코드 설정
                            if "config" in payload and payload["config"]:
                                config = payload["config"]
                                if "languageCodes" in config:
                                    session.language_codes = config["languageCodes"]
                            
                            logger.info("session_started", session_id=session_id)
                            continue
                        
                        if not session.is_active:
                            break
                            
                        await self._handle_message(websocket, session, pipeline, data)
                    except WebSocketDisconnect:
                        break

            except Exception as e:
                logger.error("websocket_error", error=str(e))
            finally:
                session.is_active = False
                if pipeline:
                    await pipeline.stop()
                
                # Redis 정리: 명시적 종료(END_SESSION with clearSession=True) 시에만 삭제
                # 일반 연결 종료 시에는 데이터 보존 (재연결 가능)
                if session.should_clear_data:
                    redis = await get_redis()
                    await redis.clear_session(session_id)
                    logger.info("session_data_cleared", session_id=session_id)
                
                if connection_id in self._active_sessions:
                    del self._active_sessions[connection_id]
                logger.info("websocket_disconnected", session_id=session_id)

    async def _handle_message(
        self,
        websocket: WebSocket,
        session: SessionState,
        pipeline: RealtimePipeline | None,
        data: dict[str, Any],
    ) -> None:
        """수신 메시지 처리"""
        try:
            msg_type = WSMessageType(data.get("type", ""))
            payload = data.get("payload", {})

            match msg_type:
                case WSMessageType.AUDIO_CHUNK:
                    if pipeline:
                        chunk_payload = AudioChunkPayload(**payload)
                        session.audio_format = chunk_payload.format
                        asyncio.create_task(pipeline.process_audio_chunk(chunk_payload))

                case WSMessageType.START_SESSION:
                    # 이미 handle_connection에서 처리됨
                    pass

                case WSMessageType.END_SESSION:
                    # clearSession 플래그 확인
                    clear_session = payload.get("clearSession", False)
                    session.should_clear_data = clear_session
                    await self._handle_end_session(websocket, session)

                case WSMessageType.SUBMIT_FEEDBACK:
                    await self._handle_feedback(websocket, session, payload)

                case WSMessageType.PING:
                    await self._send_message(websocket, WSMessageType.PONG, {})

                case _:
                    logger.warning("unknown_message_type", type=msg_type)

        except Exception as e:
            logger.error("message_handling_error", error=str(e))
            await self._send_error(websocket, ErrorCode.INTERNAL_ERROR, str(e))

    async def _handle_end_session(
        self, websocket: WebSocket, session: SessionState
    ) -> None:
        """세션 종료 처리 - 피드백 요청"""
        session.is_active = False
        logger.info("session_ended", session_id=session.session_id)

        settings = get_settings()
        if settings.enable_feedback:
            # 그래프 상태 조회
            graph_manager = await get_graph_manager()
            state = await graph_manager.get_state(session.session_id)

            # 피드백 요청 전송
            duration_seconds = int((time.time() - session.created_at))
            request_payload = RequestFeedbackPayload(
                sessionId=session.session_id,
                entitiesCount=len(state.entities),
                relationsCount=len(state.relations),
                durationSeconds=duration_seconds,
            )
            await self._send_message(
                websocket,
                WSMessageType.REQUEST_FEEDBACK,
                request_payload.model_dump(by_alias=True),
            )

    async def _handle_feedback(
        self,
        websocket: WebSocket,
        session: SessionState,
        payload: dict[str, Any],
    ) -> None:
        """피드백 제출 처리"""
        try:
            feedback = FeedbackPayload(**payload)
            
            # 그래프 상태 조회
            graph_manager = await get_graph_manager()
            state = await graph_manager.get_state(session.session_id)

            # 피드백 매니저로 저장
            feedback_manager = await get_feedback_manager()
            
            # 누적된 오디오 데이터 (있는 경우)
            audio_data = None
            if session.accumulated_audio:
                audio_data = b"".join(session.accumulated_audio)

            result_uris = await feedback_manager.submit_feedback(
                session_id=session.session_id,
                rating=feedback.rating,
                comment=feedback.comment,
                graph_state=state.model_dump(by_alias=True),
                audio_data=audio_data,
                audio_format=session.audio_format.codec if session.audio_format else "wav",
            )

            # 결과 전송
            result_payload = FeedbackResultPayload(
                success=True,
                message="피드백이 저장되었습니다. 감사합니다!",
                audioUri=result_uris.get("audio_uri"),
                graphUri=result_uris.get("graph_uri"),
            )
            await self._send_message(
                websocket,
                WSMessageType.FEEDBACK_RESULT,
                result_payload.model_dump(by_alias=True),
            )

            logger.info(
                "feedback_submitted",
                session_id=session.session_id,
                rating=feedback.rating,
            )

        except Exception as e:
            logger.error("feedback_submission_error", error=str(e))
            result_payload = FeedbackResultPayload(
                success=False,
                message=f"피드백 저장 실패: {str(e)}",
            )
            await self._send_message(
                websocket,
                WSMessageType.FEEDBACK_RESULT,
                result_payload.model_dump(by_alias=True),
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
        payload = ErrorPayload(code=code, message=message, recoverable=True)
        await self._send_message(websocket, WSMessageType.ERROR, payload.model_dump())


# 싱글톤 핸들러
ws_handler = WebSocketHandler()
