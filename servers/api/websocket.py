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
from extraction import get_extraction_pipeline, ExtractionPipeline
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
    ExtractedEntity,
    ExtractedRelation,
    FeedbackPayload,
    FeedbackResultPayload,
    GraphDelta,
    GraphEntity,
    GraphRelation,
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
    
    # 메모리 제한 상수
    MAX_ACCUMULATED_AUDIO_SIZE = 50 * 1024 * 1024  # 50MB 최대
    MAX_AUDIO_DURATION_MS = 10 * 60 * 1000  # 10분 최대

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.audio_format: AudioFormat | None = None
        self.is_active = True
        self.sequence_counter = 0
        self.created_at = time.time()
        self.last_activity = time.time()
        self.language_codes: list[str] | None = None
        
        # 세션 데이터 (피드백용) - 메모리 제한 적용
        self.accumulated_audio: list[bytes] = []
        self.accumulated_audio_size = 0  # 현재 누적 크기 추적
        self.total_audio_duration_ms = 0
        
        # 연결 종료 시 Redis 데이터 삭제 여부
        self.should_clear_data = False
        
        # 메시지 전송 통계 (디버깅용)
        self.messages_sent = 0
        self.last_message_time = 0.0
    
    def add_audio_chunk(self, audio_data: bytes, duration_ms: int) -> bool:
        """
        오디오 청크 추가 (메모리 제한 적용)
        
        Returns:
            True if added, False if limit exceeded
        """
        chunk_size = len(audio_data)
        
        # 메모리 제한 체크
        if self.accumulated_audio_size + chunk_size > self.MAX_ACCUMULATED_AUDIO_SIZE:
            # 오래된 오디오 청크 제거 (FIFO)
            while (self.accumulated_audio and 
                   self.accumulated_audio_size + chunk_size > self.MAX_ACCUMULATED_AUDIO_SIZE):
                removed = self.accumulated_audio.pop(0)
                self.accumulated_audio_size -= len(removed)
        
        # 시간 제한 체크
        if self.total_audio_duration_ms >= self.MAX_AUDIO_DURATION_MS:
            # 시간 초과 시 오래된 것 제거
            if self.accumulated_audio:
                removed = self.accumulated_audio.pop(0)
                self.accumulated_audio_size -= len(removed)
                # 대략적인 duration 감소 (정확하지 않지만 제한용으로 충분)
                self.total_audio_duration_ms = max(0, self.total_audio_duration_ms - 500)
        
        self.accumulated_audio.append(audio_data)
        self.accumulated_audio_size += chunk_size
        self.total_audio_duration_ms += duration_ms
        self.last_activity = time.time()
        return True
    
    def clear_audio_buffer(self) -> None:
        """오디오 버퍼 정리"""
        self.accumulated_audio.clear()
        self.accumulated_audio_size = 0
        self.total_audio_duration_ms = 0


class RealtimePipeline:
    """
    실시간 처리 파이프라인 - 병렬 멀티태스킹
    
    4개의 독립적인 워커가 병렬로 실행:
    1. STT Worker: 오디오 → 텍스트 (Cloud Speech-to-Text v2)
    2. NLP Worker: 텍스트 → 문장 분리/분석
    3. Extraction Worker: 완성된 문장 → 엔티티/관계 추출 (Vertex AI)
    4. Heartbeat Worker: 서버 → 클라이언트 PING 전송 (연결 유지)
    """
    
    # Heartbeat 설정
    HEARTBEAT_INTERVAL = 15  # 15초마다 서버에서 PING 전송
    HEARTBEAT_TIMEOUT = 45   # 45초 동안 응답 없으면 연결 종료

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
        # 텍스트 큐: (텍스트, 언어 코드) 튜플 - 언어 코드는 None일 수 있음
        self._text_queue: asyncio.Queue[tuple[str, str | None]] = asyncio.Queue(maxsize=100)
        self._sentence_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        
        # 메시지 전송 큐 (배치 처리용)
        self._message_queue: asyncio.Queue[tuple[WSMessageType, dict[str, Any]]] = asyncio.Queue(maxsize=200)
        
        # 세션의 주요 언어 추적 (가장 많이 감지된 언어)
        self._detected_languages: dict[str, int] = {}
        
        # 클라이언트 마지막 응답 시간 (PONG 또는 메시지)
        self._last_client_activity = time.time()
        
        # 태스크
        self._tasks: list[asyncio.Task[Any]] = []

    async def start(self) -> None:
        """파이프라인 시작 - 4개의 독립적인 워커 실행"""
        self._tasks = [
            asyncio.create_task(self._stt_worker(), name="stt_worker"),
            asyncio.create_task(self._nlp_worker(), name="nlp_worker"),
            asyncio.create_task(self._extraction_worker(), name="extraction_worker"),
            asyncio.create_task(self._heartbeat_worker(), name="heartbeat_worker"),
            asyncio.create_task(self._message_sender_worker(), name="message_sender_worker"),
        ]
        
        # 태스크 예외 콜백 추가 - 예외 발생 시 로깅
        for task in self._tasks:
            task.add_done_callback(self._task_done_callback)
        
        logger.info("pipeline_started", session_id=self._session.session_id, workers=5)
    
    def _task_done_callback(self, task: asyncio.Task) -> None:
        """태스크 완료 콜백 - 예외 로깅"""
        try:
            exc = task.exception()
            if exc and not isinstance(exc, asyncio.CancelledError):
                logger.error(
                    "worker_task_failed",
                    task_name=task.get_name(),
                    error=str(exc),
                    session_id=self._session.session_id,
                )
        except asyncio.CancelledError:
            pass  # 정상 취소
        except asyncio.InvalidStateError:
            pass  # 태스크가 아직 실행 중

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
            
            # 세션 오디오 누적 (피드백용) - 메모리 제한 적용
            self._session.add_audio_chunk(audio_data, payload.duration)
            
            # 큐가 가득 차면 대기 (timeout으로 백프레셔 처리)
            try:
                await asyncio.wait_for(
                    self._audio_queue.put((audio_data, payload.format)),
                    timeout=0.5  # 500ms 대기
                )
            except asyncio.TimeoutError:
                # 큐가 가득 찼고 500ms 동안 공간이 안 생김 - 청크 드롭
                logger.warning(
                    "audio_queue_timeout_dropped",
                    seq=payload.sequence_number,
                    queue_size=self._audio_queue.qsize(),
                )
            
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
        
        # 에러 추적
        consecutive_errors = 0
        MAX_CONSECUTIVE_ERRORS = 10
        
        while self._session.is_active:
            try:
                # 오디오 청크 대기
                try:
                    audio_data, audio_format = await asyncio.wait_for(
                        self._audio_queue.get(), timeout=0.5
                    )
                except asyncio.TimeoutError:
                    continue

                logger.debug("stt_processing_audio", size=len(audio_data), codec=audio_format.codec)
                
                await self._send_status(ProcessingStage.STT_PROCESSING)
                
                segment_id = f"{self._session.session_id}_{self._session.sequence_counter}"
                self._session.sequence_counter += 1

                # Cloud Speech-to-Text v2 처리 (타임아웃 적용)
                try:
                    result = await asyncio.wait_for(
                        speech_client.transcribe_chunk(
                            audio_data, audio_format, segment_id, language_codes
                        ),
                        timeout=30.0  # 30초 타임아웃
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        "stt_transcribe_timeout",
                        segment_id=segment_id,
                        audio_size=len(audio_data),
                    )
                    consecutive_errors += 1
                    continue

                if result and result.text.strip():
                    # 부분 결과 클라이언트로 전송
                    send_success = await self._send_stt_partial(result)
                    
                    if send_success:
                        # 텍스트와 언어 코드를 함께 큐에 추가 (NLP 워커로 전달)
                        try:
                            await asyncio.wait_for(
                                self._text_queue.put((result.text, result.language_code)),
                                timeout=1.0
                            )
                        except asyncio.TimeoutError:
                            logger.warning("text_queue_full", text_preview=result.text[:30])
                        
                        logger.debug(
                            "stt_result",
                            text=result.text[:50],
                            language_code=result.language_code,
                        )
                    
                    # 성공 시 에러 카운터 리셋
                    consecutive_errors = 0

                await self._send_status(ProcessingStage.IDLE)

            except asyncio.CancelledError:
                break
            except Exception as e:
                consecutive_errors += 1
                logger.error(
                    "stt_worker_error",
                    error=str(e),
                    consecutive_errors=consecutive_errors,
                )
                
                # 연속 에러가 너무 많으면 잠시 대기
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                    logger.warning(
                        "stt_worker_too_many_errors",
                        consecutive_errors=consecutive_errors,
                        sleeping_seconds=5,
                    )
                    await asyncio.sleep(5)
                    consecutive_errors = 0
                else:
                    await asyncio.sleep(0.1)

        logger.info("stt_worker_stopped", total_sequences=self._session.sequence_counter)

    # ============================================
    # Worker 2: NLP (문장 분리 및 분석)
    # ============================================
    
    # 언어별 최소 강제 확정 길이
    _MIN_FLUSH_LENGTHS = {
        "ko": 30,  # 한국어: 30자
        "ja": 15,  # 일본어: 15자 (한자/가나 혼용으로 짧음)
        "zh": 15,  # 중국어: 15자
        "cmn": 15, # 중국어 (BCP-47: cmn-Hans-CN)
        "en": 50,  # 영어: 50자
        "default": 20,  # 기본값: 20자
    }
    
    # BCP-47 언어 코드 → 간단한 언어 코드 매핑
    _LANGUAGE_CODE_MAP = {
        "cmn": "zh",  # 중국어 만다린 → zh
        "yue": "zh",  # 중국어 광동어 → zh
        "wuu": "zh",  # 중국어 우어 → zh
    }
    
    async def _nlp_worker(self) -> None:
        """NLP 워커 - 텍스트를 받아서 문장 단위로 분리"""
        logger.info("nlp_worker_started")
        
        text_buffer = ""
        sentence_counter = 0
        last_text_time = time.time()
        current_language = None  # 현재 버퍼의 언어
        FORCE_FLUSH_TIMEOUT = 2.5  # 2.5초 동안 새 텍스트 없으면 강제 확정 (단축)
        
        while self._session.is_active:
            try:
                try:
                    text_data = await asyncio.wait_for(
                        self._text_queue.get(), timeout=0.5
                    )
                    # 텍스트와 언어 코드 분리
                    new_text, language_code = text_data
                    last_text_time = time.time()
                    
                    # 언어 코드 업데이트
                    if language_code:
                        current_language = language_code
                        self._detected_languages[language_code] = (
                            self._detected_languages.get(language_code, 0) + 1
                        )
                        
                except asyncio.TimeoutError:
                    # 타임아웃: 버퍼에 텍스트가 있으면 강제 확정 검토
                    if text_buffer:
                        time_since_last = time.time() - last_text_time
                        
                        # 언어별 최소 길이 결정
                        min_length = self._get_min_flush_length(current_language)
                        
                        # 조건: 시간 초과 AND (최소 길이 충족 OR 3자 이상)
                        should_flush = (
                            time_since_last >= FORCE_FLUSH_TIMEOUT and 
                            (len(text_buffer) >= min_length or len(text_buffer.strip()) >= 3)
                        )
                        
                        if should_flush:
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
                            logger.debug(
                                "forced_flush_incomplete_sentence",
                                text_preview=text_buffer[:30],
                                language=current_language,
                                length=len(text_buffer),
                            )
                            text_buffer = ""
                    continue

                await self._send_status(ProcessingStage.NLP_ANALYZING)
                
                text_buffer += " " + new_text
                text_buffer = text_buffer.strip()
                
                # 언어 코드에 따른 문장 분리
                sentences = self._extract_complete_sentences(text_buffer, current_language)
                
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
        
        # 세션 종료 시 남은 버퍼 처리
        if text_buffer and text_buffer.strip():
            sentence_counter += 1
            await self._send_stt_final(
                STTFinalPayload(
                    text=text_buffer.strip(),
                    confidence=0.8,
                    segmentId=f"{self._session.session_id}_sent_{sentence_counter}",
                    morphemes=None,
                    isComplete=True,
                )
            )
            await self._sentence_queue.put(text_buffer.strip())
            logger.debug("final_flush_on_stop", text_preview=text_buffer[:30])

        # 세션 종료 시 언어 통계 로깅
        if self._detected_languages:
            logger.info(
                "session_language_statistics",
                languages=self._detected_languages,
                primary_language=max(self._detected_languages, key=self._detected_languages.get),
            )
        
        logger.info("nlp_worker_stopped")
    
    def _normalize_language_code(self, language_code: str | None) -> str | None:
        """
        BCP-47 언어 코드를 간단한 형태로 정규화
        
        예시:
            ja-JP → ja
            ko-KR → ko
            en-US → en
            cmn-Hans-CN → zh
        """
        if not language_code:
            return None
        
        # 첫 번째 부분 추출 (ja-JP → ja, cmn-Hans-CN → cmn)
        lang = language_code.split("-")[0].lower()
        
        # 특수 매핑 적용 (cmn → zh 등)
        return self._LANGUAGE_CODE_MAP.get(lang, lang)
    
    def _get_min_flush_length(self, language_code: str | None) -> int:
        """언어별 최소 강제 확정 길이 반환"""
        lang = self._normalize_language_code(language_code)
        if not lang:
            return self._MIN_FLUSH_LENGTHS["default"]
        
        return self._MIN_FLUSH_LENGTHS.get(lang, self._MIN_FLUSH_LENGTHS["default"])

    def _extract_complete_sentences(
        self, text: str, language_code: str | None = None
    ) -> list[tuple[str, str]]:
        """
        완성된 문장 추출 (다국어 지원, 유연한 매칭)
        
        Args:
            text: 분석할 텍스트
            language_code: STT에서 감지된 BCP-47 언어 코드 (ko-KR, ja-JP, en-US 등)
        """
        results = []
        
        # 언어 코드 정규화 (ja-JP → ja, cmn-Hans-CN → zh)
        lang = self._normalize_language_code(language_code)
        
        # 언어별 종결 패턴 우선순위 조정
        if lang == "ja":
            # 일본어: 구두점 + 동사/형용사 종결형
            endings = [
                # 일본어 구두점
                "。", "！", "？",
                # 정중체 종결 (です・ます)
                "ます ", "です ", "ました ", "でした ",
                "ます", "です", "ました", "でした",
                # 보통체 종결
                "った ", "った", "だ ", "だ", "た ", 
                # 의문/추측
                "か ", "か", "ね ", "ね", "よ ", "よ",
                # 영어/일반 (혼합 텍스트 대응)
                ". ", "! ", "? ",
            ]
        elif lang == "zh":
            # 중국어
            endings = [
                "。", "！", "？", "了 ", "了", "的 ",
                ". ", "! ", "? ",
            ]
        elif lang == "en":
            # 영어
            endings = [
                ". ", "! ", "? ", ".\n", "!\n", "?\n",
            ]
        else:
            # 한국어 또는 미지정: 기존 패턴 (한국어 우선)
            endings = [
                # 한국어 종결 어미
                "습니다.", "입니다.", "합니다.", "됩니다.", "있습니다.", "없습니다.",
                "니다.", "세요.", "까요?", "나요?", "네요.", "군요.", "거든요.",
                "다.", "요.", "죠.", "요?", "죠?",
                # 영어/일반
                ". ", "! ", "? ", ".\n", "!\n", "?\n",
                # 일본어/중국어
                "。", "！", "？",
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
    # Worker 3: Heartbeat (연결 유지)
    # ============================================
    async def _heartbeat_worker(self) -> None:
        """
        Heartbeat 워커 - 서버에서 주기적으로 PING 전송
        
        Cloud Run WebSocket 연결 유지를 위해 서버 측에서도 PING을 보냄.
        클라이언트 응답이 없으면 연결 종료.
        """
        logger.info("heartbeat_worker_started")
        
        while self._session.is_active:
            try:
                await asyncio.sleep(self.HEARTBEAT_INTERVAL)
                
                if not self._session.is_active:
                    break
                
                # 클라이언트 응답 체크
                time_since_activity = time.time() - self._last_client_activity
                if time_since_activity > self.HEARTBEAT_TIMEOUT:
                    logger.warning(
                        "heartbeat_timeout",
                        session_id=self._session.session_id,
                        seconds_since_activity=time_since_activity,
                    )
                    # 세션 비활성화 (연결 종료 트리거)
                    self._session.is_active = False
                    break
                
                # 서버 → 클라이언트 PING 전송
                await self._send_message(WSMessageType.PING, {})
                
                # 연결 상태 로깅 (디버그)
                logger.debug(
                    "heartbeat_sent",
                    session_id=self._session.session_id,
                    messages_sent=self._session.messages_sent,
                    audio_buffer_mb=self._session.accumulated_audio_size / (1024 * 1024),
                )
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("heartbeat_worker_error", error=str(e))
                await asyncio.sleep(1)
        
        logger.info("heartbeat_worker_stopped")
    
    # ============================================
    # Worker 4: Message Sender (배치 전송)
    # ============================================
    async def _message_sender_worker(self) -> None:
        """
        메시지 전송 워커 - 큐에서 메시지를 가져와 배치로 전송
        
        여러 워커에서 동시에 WebSocket에 쓰는 것을 방지하고,
        메시지 전송을 순차적으로 처리합니다.
        """
        logger.info("message_sender_worker_started")
        
        batch_size = 10  # 한 번에 최대 10개 메시지 처리
        batch_interval = 0.05  # 50ms 배치 간격
        
        while self._session.is_active:
            try:
                messages_to_send: list[tuple[WSMessageType, dict[str, Any]]] = []
                
                # 첫 번째 메시지 대기
                try:
                    msg = await asyncio.wait_for(
                        self._message_queue.get(), timeout=0.5
                    )
                    messages_to_send.append(msg)
                except asyncio.TimeoutError:
                    continue
                
                # 추가 메시지 수집 (논블로킹)
                while len(messages_to_send) < batch_size:
                    try:
                        msg = self._message_queue.get_nowait()
                        messages_to_send.append(msg)
                    except asyncio.QueueEmpty:
                        break
                
                # 배치 전송
                for msg_type, payload in messages_to_send:
                    await self._send_message_direct(msg_type, payload)
                
                # 배치 간격
                if messages_to_send:
                    await asyncio.sleep(batch_interval)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("message_sender_worker_error", error=str(e))
                await asyncio.sleep(0.1)
        
        # 종료 시 남은 메시지 처리
        while not self._message_queue.empty():
            try:
                msg_type, payload = self._message_queue.get_nowait()
                await self._send_message_direct(msg_type, payload)
            except asyncio.QueueEmpty:
                break
            except Exception:
                pass
        
        logger.info("message_sender_worker_stopped")

    # ============================================
    # Worker 5: Extraction (Vertex AI Gemini) - 스트리밍 지원
    # ============================================
    async def _extraction_worker(self) -> None:
        """추출 워커 - Vertex AI로 엔티티/관계 추출 (스트리밍)"""
        logger.info("extraction_worker_started")
        
        pipeline = await get_extraction_pipeline()
        graph_manager = await get_graph_manager()
        
        sentence_buffer: list[str] = []
        last_extraction_time = time.time()
        
        # 스트리밍 중 부분 결과 추적용
        streaming_entities: list[ExtractedEntity] = []
        streaming_relations: list[ExtractedRelation] = []
        
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
                
                # 스트리밍 부분 결과 초기화
                streaming_entities.clear()
                streaming_relations.clear()
                
                # 스트리밍 중 ID 매핑 추적 (e1 → UUID)
                streaming_id_map: dict[str, str] = {}

                # 스트리밍 부분 결과 콜백 - 엔티티만 즉시 전송
                async def on_partial_result(
                    new_entities: list[ExtractedEntity],
                    new_relations: list[ExtractedRelation]
                ) -> None:
                    """엔티티가 파싱되면 즉시 그래프에 적용 (관계는 나중에 처리)"""
                    # 엔티티/관계 누적 (최종 처리용)
                    streaming_entities.extend(new_entities)
                    streaming_relations.extend(new_relations)
                    
                    # 엔티티만 즉시 전송 (관계는 ID 매핑 문제로 나중에 처리)
                    if not new_entities:
                        return
                    
                    from models import ExtractionResult
                    partial_result = ExtractionResult(
                        entities=new_entities,
                        relations=[]  # 관계는 제외
                    )
                    
                    try:
                        delta, id_map = await graph_manager.apply_extraction_with_id_map(
                            self._session.session_id, partial_result
                        )
                        
                        # ID 매핑 저장 (e1 → UUID)
                        streaming_id_map.update(id_map)
                        logger.debug("streaming_id_map_updated", id_map=id_map)
                        
                        if delta.added_entities or delta.updated_entities:
                            await self._send_graph_delta(delta)
                            logger.debug(
                                "streaming_entities_sent",
                                entities=len(delta.added_entities),
                            )
                    except Exception as e:
                        logger.warning("streaming_partial_apply_error", error=str(e))

                # 스트리밍 추출 실행
                extraction_result = await pipeline.process_chunk_streaming(
                    text=combined_text,
                    existing_entities=current_state.entities,
                    existing_relations=current_state.relations,
                    on_partial=on_partial_result,
                )

                # 최종 결과에서 관계 처리 (모든 엔티티가 그래프에 추가된 후)
                logger.info(
                    "extraction_result_received",
                    entities_count=len(extraction_result.entities),
                    relations_count=len(extraction_result.relations),
                    relations=[
                        {"source": r.source, "target": r.target, "relation": r.relation}
                        for r in extraction_result.relations
                    ]
                )
                
                if extraction_result.relations:
                    # 현재 상태 다시 조회 (스트리밍으로 추가된 엔티티 포함)
                    updated_state = await graph_manager.get_state(self._session.session_id)
                    
                    logger.info(
                        "processing_relations",
                        relations_count=len(extraction_result.relations),
                        current_entities=[e.id for e in updated_state.entities],
                        streaming_id_map=streaming_id_map,
                    )
                    
                    from models import ExtractionResult
                    relations_result = ExtractionResult(
                        entities=[],  # 엔티티는 이미 처리됨
                        relations=extraction_result.relations
                    )
                    
                    # ID 매핑을 전달하여 관계 처리
                    delta = await graph_manager.apply_extraction_with_existing_id_map(
                        self._session.session_id, 
                        relations_result,
                        existing_id_map=streaming_id_map
                    )
                    
                    logger.info(
                        "relations_delta_created",
                        added_relations=len(delta.added_relations),
                        relations=[
                            {"id": r.id, "source": r.source, "target": r.target, "relation": r.relation}
                            for r in delta.added_relations
                        ]
                    )
                    
                    if delta.added_relations:
                        await self._send_graph_delta(delta)
                        logger.debug(
                            "streaming_relations_sent",
                            relations=len(delta.added_relations),
                        )
                
                total_entities = len(extraction_result.entities)
                total_relations = len(extraction_result.relations)
                
                if total_entities > 0 or total_relations > 0:
                    logger.info(
                        "streaming_extraction_complete",
                        total_entities=total_entities,
                        total_relations=total_relations,
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
    
    # 메시지 전송 rate limiting
    _MIN_MESSAGE_INTERVAL = 0.01  # 최소 10ms 간격
    _MAX_MESSAGES_PER_SECOND = 50  # 초당 최대 50개
    
    # 큐를 사용하지 않고 직접 전송하는 메시지 타입
    _DIRECT_SEND_TYPES = {WSMessageType.PING, WSMessageType.PONG}

    async def _send_message(self, msg_type: WSMessageType, payload: dict[str, Any]) -> bool:
        """
        WebSocket 메시지 전송 (큐 기반)
        
        대부분의 메시지는 큐에 넣어서 배치 처리하고,
        PING/PONG은 직접 전송합니다.
        
        Returns:
            True if queued/sent successfully, False otherwise
        """
        # 세션 비활성화 상태면 전송 안함
        if not self._session.is_active:
            return False
        
        # PING/PONG은 직접 전송 (지연 없이)
        if msg_type in self._DIRECT_SEND_TYPES:
            return await self._send_message_direct(msg_type, payload)
        
        # 나머지는 큐에 추가
        try:
            await asyncio.wait_for(
                self._message_queue.put((msg_type, payload)),
                timeout=1.0
            )
            return True
        except asyncio.TimeoutError:
            logger.warning(
                "message_queue_full",
                msg_type=msg_type.value,
                queue_size=self._message_queue.qsize(),
            )
            return False
    
    async def _send_message_direct(self, msg_type: WSMessageType, payload: dict[str, Any]) -> bool:
        """
        WebSocket 메시지 직접 전송 (큐 우회)
        
        Returns:
            True if sent successfully, False otherwise
        """
        try:
            # Rate limiting - 너무 빠른 전송 방지
            now = time.time()
            elapsed = now - self._session.last_message_time
            if elapsed < self._MIN_MESSAGE_INTERVAL:
                await asyncio.sleep(self._MIN_MESSAGE_INTERVAL - elapsed)
            
            # WebSocket 연결 상태 확인
            if self._ws.client_state.name != "CONNECTED":
                logger.warning(
                    "websocket_not_connected",
                    state=self._ws.client_state.name,
                    msg_type=msg_type.value,
                )
                return False
            
            message = WSMessage(
                type=msg_type,
                payload=payload,
                timestamp=int(time.time() * 1000),
                messageId=str(uuid.uuid4()),
            )
            
            # 타임아웃 적용하여 전송
            await asyncio.wait_for(
                self._ws.send_json(message.model_dump(by_alias=True)),
                timeout=5.0  # 5초 타임아웃
            )
            
            # 통계 업데이트
            self._session.messages_sent += 1
            self._session.last_message_time = time.time()
            
            return True
            
        except asyncio.TimeoutError:
            logger.error(
                "send_message_timeout",
                msg_type=msg_type.value,
                session_id=self._session.session_id,
            )
            return False
        except Exception as e:
            logger.error(
                "send_message_error",
                error=str(e),
                msg_type=msg_type.value,
                session_id=self._session.session_id,
            )
            return False
    
    def update_client_activity(self) -> None:
        """클라이언트 활동 시간 업데이트 (메시지 수신 시 호출)"""
        self._last_client_activity = time.time()

    async def _send_status(self, stage: ProcessingStage, chunk_id: str | None = None) -> None:
        payload = ProcessingStatusPayload(stage=stage, chunkId=chunk_id)
        await self._send_message(WSMessageType.PROCESSING_STATUS, payload.model_dump(by_alias=True))

    async def _send_stt_partial(self, result: STTPartialPayload) -> bool:
        return await self._send_message(WSMessageType.STT_PARTIAL, result.model_dump(by_alias=True))

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
                        
                        # START_SESSION 전에 다른 메시지가 오면 경고
                        if not session_id_confirmed and msg_type != "START_SESSION":
                            logger.warning(
                                "message_before_session_start",
                                msg_type=msg_type,
                                connection_id=connection_id,
                            )
                            # START_SESSION 없이는 처리 불가
                            continue
                            
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
            
            # 클라이언트 활동 시간 업데이트 (Heartbeat 모니터링용)
            if pipeline:
                pipeline.update_client_activity()

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

                case WSMessageType.TRANSLATE_GRAPH:
                    await self._handle_translate_graph(websocket, session, payload)

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

    async def _handle_translate_graph(
        self,
        websocket: WebSocket,
        session: SessionState,
        payload: dict[str, Any],
    ) -> None:
        """그래프 번역 처리"""
        from gcp.vertex_ai import get_vertex_client
        
        try:
            target_language = payload.get("targetLanguage", "en")
            
            logger.info(
                "translate_graph_requested",
                session_id=session.session_id,
                target_language=target_language,
            )
            
            # 현재 그래프 상태 조회
            graph_manager = await get_graph_manager()
            state = await graph_manager.get_state(session.session_id)
            
            if not state.entities:
                await self._send_message(
                    websocket,
                    WSMessageType.TRANSLATE_RESULT,
                    {
                        "success": False,
                        "message": "번역할 그래프가 없습니다.",
                        "entities": [],
                        "relations": [],
                    },
                )
                return
            
            # Vertex AI로 번역
            vertex_client = await get_vertex_client()
            translated = await vertex_client.translate_graph(
                entities=state.entities,
                relations=state.relations,
                target_language=target_language,
            )
            
            # 번역 결과 전송
            await self._send_message(
                websocket,
                WSMessageType.TRANSLATE_RESULT,
                {
                    "success": True,
                    "targetLanguage": target_language,
                    "entities": translated["entities"],
                    "relations": translated["relations"],
                },
            )
            
            logger.info(
                "translate_graph_completed",
                session_id=session.session_id,
                target_language=target_language,
                entities_count=len(translated["entities"]),
                relations_count=len(translated["relations"]),
            )
            
        except Exception as e:
            logger.error("translate_graph_error", error=str(e))
            await self._send_message(
                websocket,
                WSMessageType.TRANSLATE_RESULT,
                {
                    "success": False,
                    "message": f"번역 실패: {str(e)}",
                    "entities": [],
                    "relations": [],
                },
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
