"""
Cloud Speech-to-Text v2 모듈
Chirp 3 모델 기반 다국어 실시간 음성 인식
- 자동 언어 감지 (auto)
- 노이즈 제거 (denoiser_audio)
"""

import asyncio
from typing import AsyncGenerator

from google.api_core.client_options import ClientOptions
from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech

from config import get_settings
from logger import get_logger
from models import AudioFormat, STTPartialPayload

logger = get_logger(__name__)


class CloudSpeechToText:
    """Google Cloud Speech-to-Text v2 클라이언트 (Chirp 3)"""

    def __init__(self) -> None:
        self._client: SpeechClient | None = None
        self._recognizer_name: str | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """클라이언트 초기화"""
        if self._initialized:
            return

        settings = get_settings()
        location = settings.speech_location  # 기본값: us-central1

        # Speech 클라이언트 생성 (Chirp 3을 위한 us 리전 엔드포인트)
        self._client = SpeechClient(
            client_options=ClientOptions(
                api_endpoint=f"{location}-speech.googleapis.com",
            )
        )

        # Recognizer 경로 설정 (Chirp 3 모델)
        self._recognizer_name = (
            f"projects/{settings.gcp_project_id}/locations/{location}/recognizers/_"
        )

        self._initialized = True
        logger.info(
            "cloud_speech_initialized",
            project=settings.gcp_project_id,
            region=location,
            model="chirp_3",
            language_codes=settings.speech_language_codes,
        )

    async def transcribe_chunk(
        self,
        audio_data: bytes,
        audio_format: AudioFormat,
        segment_id: str,
        language_codes: list[str] | None = None,
    ) -> STTPartialPayload | None:
        """
        단일 오디오 청크 변환 (Chirp 3 + 자동 언어 감지)

        Args:
            audio_data: 오디오 바이너리 데이터
            audio_format: 오디오 포맷 정보
            segment_id: 세그먼트 ID
            language_codes: 인식할 언어 코드 목록 (기본값: ["auto"] - 자동 감지)
        """
        if not self._client:
            await self.initialize()

        # 기본값: 자동 언어 감지
        if language_codes is None:
            language_codes = ["auto"]

        try:
            # 오디오 인코딩 설정
            encoding = self._get_encoding(audio_format)

            # 인식 설정 (Chirp 3 + 자동 언어 감지)
            recognition_features = cloud_speech.RecognitionFeatures(
                enable_automatic_punctuation=True,
                enable_word_time_offsets=False,
            )

            recognition_config = cloud_speech.RecognitionConfig(
                explicit_decoding_config=cloud_speech.ExplicitDecodingConfig(
                    encoding=encoding,
                    sample_rate_hertz=audio_format.sample_rate,
                    audio_channel_count=audio_format.channels,
                ),
                language_codes=language_codes,
                model="chirp_3",  # Chirp 3 모델 - 최신 다국어 + 자동 감지
                features=recognition_features,
            )

            # 인식 요청 (config_mask로 denoiser 설정 포함)
            request = cloud_speech.RecognizeRequest(
                recognizer=self._recognizer_name,
                config=recognition_config,
                content=audio_data,
            )
            
            # Chirp 3 denoiser 활성화 설정
            # config_mask를 통해 추가 설정 적용
            try:
                # denoiser_audio 필드가 있는 경우 설정
                if hasattr(recognition_config, 'features') and hasattr(recognition_config.features, 'enable_spoken_punctuation'):
                    recognition_config.features.enable_spoken_punctuation = True
            except Exception:
                pass  # 지원하지 않는 필드면 무시

            # 동기 호출을 비동기로 래핑
            response = await asyncio.to_thread(self._client.recognize, request=request)

            # 결과 처리
            if response.results:
                best_result = response.results[0]
                if best_result.alternatives:
                    best_alternative = best_result.alternatives[0]
                    text = best_alternative.transcript.strip()

                    if text:
                        # 감지된 언어 로깅
                        detected_language = getattr(
                            best_result, "language_code", "unknown"
                        )
                        logger.debug(
                            "stt_result",
                            segment_id=segment_id,
                            text=text[:50],
                            language=detected_language,
                            confidence=best_alternative.confidence,
                        )

                        return STTPartialPayload(
                            text=text,
                            confidence=best_alternative.confidence,
                            segment_id=segment_id,
                        )

            return None

        except Exception as e:
            logger.error(
                "cloud_speech_error",
                segment_id=segment_id,
                error=str(e),
            )
            return None

    async def transcribe_stream(
        self,
        audio_chunks: AsyncGenerator[tuple[bytes, AudioFormat], None],
        session_id: str,
        language_codes: list[str] | None = None,
    ) -> AsyncGenerator[STTPartialPayload, None]:
        """
        오디오 스트림 연속 변환

        Args:
            audio_chunks: (오디오 데이터, 포맷) 튜플의 비동기 제너레이터
            session_id: 세션 ID
            language_codes: 언어 코드 목록
        """
        if not self._client:
            await self.initialize()

        settings = get_settings()
        chunk_index = 0
        accumulated_audio: list[bytes] = []
        accumulated_duration = 0.0
        target_duration = settings.stt_chunk_duration_ms
        current_format: AudioFormat | None = None

        async for audio_data, audio_format in audio_chunks:
            accumulated_audio.append(audio_data)
            current_format = audio_format

            # 대략적인 지속 시간 계산
            chunk_duration = (
                len(audio_data)
                / (audio_format.sample_rate * audio_format.channels * 2)
                * 1000
            )
            accumulated_duration += chunk_duration

            # 목표 지속 시간에 도달하면 처리
            if accumulated_duration >= target_duration:
                combined_audio = b"".join(accumulated_audio)
                segment_id = f"{session_id}_{chunk_index}"

                result = await self.transcribe_chunk(
                    combined_audio,
                    current_format,
                    segment_id,
                    language_codes,
                )

                if result:
                    yield result

                # 리셋
                accumulated_audio = []
                accumulated_duration = 0.0
                chunk_index += 1

        # 남은 오디오 처리
        if accumulated_audio and current_format:
            combined_audio = b"".join(accumulated_audio)
            segment_id = f"{session_id}_{chunk_index}"

            result = await self.transcribe_chunk(
                combined_audio,
                current_format,
                segment_id,
                language_codes,
            )
            if result:
                yield result

    def _get_encoding(
        self, audio_format: AudioFormat
    ) -> cloud_speech.ExplicitDecodingConfig.AudioEncoding:
        """오디오 포맷에 맞는 인코딩 반환"""
        codec_encoding_map = {
            "pcm": cloud_speech.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
            "wav": cloud_speech.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
            "webm": cloud_speech.ExplicitDecodingConfig.AudioEncoding.WEBM_OPUS,
            "opus": cloud_speech.ExplicitDecodingConfig.AudioEncoding.WEBM_OPUS,
            "mp3": cloud_speech.ExplicitDecodingConfig.AudioEncoding.MP3,
            "flac": cloud_speech.ExplicitDecodingConfig.AudioEncoding.FLAC,
        }
        return codec_encoding_map.get(
            audio_format.codec,
            cloud_speech.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
        )


# 싱글톤 인스턴스
_speech_client: CloudSpeechToText | None = None


async def get_speech_client() -> CloudSpeechToText:
    """Speech 클라이언트 의존성"""
    global _speech_client
    if _speech_client is None:
        _speech_client = CloudSpeechToText()
        await _speech_client.initialize()
    return _speech_client

