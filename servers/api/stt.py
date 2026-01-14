"""
STT (Speech-to-Text) 모듈
Gemini API를 사용한 한국어 음성 인식
"""

import asyncio
from typing import AsyncGenerator, Any

from google import genai
from google.genai import types

from config import get_settings
from logger import get_logger
from models import AudioFormat, STTPartialPayload, STTFinalPayload

logger = get_logger(__name__)

# Gemini STT System Prompt (English for better accuracy)
STT_SYSTEM_PROMPT = """You are a professional Korean speech transcription expert.
Your task is to accurately transcribe the Korean audio provided.

CRITICAL RULES:
1. Transcribe ONLY what you actually hear in the audio.
2. Do NOT guess, infer, or generate any content.
3. Do NOT hallucinate or make up words/sentences.
4. If audio is unclear, skip that part rather than guessing.
5. If there is no speech, output an empty string only.
6. Preserve the exact words spoken, including English words used in Korean speech.

FORBIDDEN:
- Do NOT generate repetitive patterns
- Do NOT add content that is not in the audio
- Do NOT write explanations or commentary
- Do NOT translate - transcribe Korean as Korean

OUTPUT FORMAT: Only the transcribed Korean text, nothing else."""


class GeminiSTT:
    """Gemini 기반 STT 처리기"""

    def __init__(self) -> None:
        self._client: genai.Client | None = None
        self._initialized = False
        self._system_prompt = STT_SYSTEM_PROMPT

    async def initialize(self) -> None:
        """Gemini 클라이언트 초기화"""
        if self._initialized:
            return

        settings = get_settings()
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다")

        # 새로운 google-genai 클라이언트
        self._client = genai.Client(api_key=settings.gemini_api_key)

        self._initialized = True
        logger.info("gemini_stt_initialized")

    async def transcribe_chunk(
        self, audio_data: bytes, audio_format: AudioFormat, segment_id: str
    ) -> STTPartialPayload | None:
        """단일 오디오 청크 변환"""
        if not self._client:
            await self.initialize()

        try:
            # 오디오 MIME 타입 결정
            mime_type = self._get_mime_type(audio_format)

            # Gemini에 오디오 전송
            response = await asyncio.to_thread(
                self._client.models.generate_content,  # type: ignore
                model="gemini-2.5-flash",
                contents=[
                    self._system_prompt,
                    types.Part.from_bytes(data=audio_data, mime_type=mime_type),
                    "Transcribe the Korean speech in this audio. Output only the transcribed text.",
                ],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=1024,
                ),
            )

            text = response.text.strip() if response.text else ""

            if not text:
                return None

            return STTPartialPayload(
                text=text,
                confidence=0.9,
                segment_id=segment_id,
            )

        except Exception as e:
            logger.error(
                "stt_transcription_failed",
                segment_id=segment_id,
                error=str(e),
            )
            return None

    async def transcribe_stream(
        self,
        audio_chunks: AsyncGenerator[tuple[bytes, AudioFormat], None],
        session_id: str,
    ) -> AsyncGenerator[STTPartialPayload, None]:
        """오디오 스트림 연속 변환"""
        if not self._client:
            await self.initialize()

        chunk_index = 0
        accumulated_audio: list[bytes] = []
        accumulated_duration = 0.0

        settings = get_settings()
        target_duration = settings.stt_chunk_duration_ms

        async for audio_data, audio_format in audio_chunks:
            accumulated_audio.append(audio_data)
            # 대략적인 지속 시간 계산 (샘플 기반)
            chunk_duration = len(audio_data) / (
                audio_format.sample_rate * audio_format.channels * 2
            ) * 1000
            accumulated_duration += chunk_duration

            # 목표 지속 시간에 도달하면 처리
            if accumulated_duration >= target_duration:
                combined_audio = b"".join(accumulated_audio)
                segment_id = f"{session_id}_{chunk_index}"

                result = await self.transcribe_chunk(
                    combined_audio, audio_format, segment_id
                )

                if result:
                    yield result
                    logger.debug(
                        "stt_chunk_processed",
                        segment_id=segment_id,
                        text_length=len(result.text),
                    )

                # 리셋
                accumulated_audio = []
                accumulated_duration = 0.0
                chunk_index += 1

        # 남은 오디오 처리
        if accumulated_audio:
            combined_audio = b"".join(accumulated_audio)
            segment_id = f"{session_id}_{chunk_index}"
            
            result = await self.transcribe_chunk(
                combined_audio, audio_format, segment_id  # type: ignore
            )
            if result:
                yield result

    def _get_mime_type(self, audio_format: AudioFormat) -> str:
        """오디오 포맷에 맞는 MIME 타입 반환"""
        codec_mime_map = {
            "pcm": "audio/pcm",
            "wav": "audio/wav",
            "webm": "audio/webm",
            "opus": "audio/opus",
            "mp3": "audio/mp3",
        }
        return codec_mime_map.get(audio_format.codec, "audio/wav")


class STTAccumulator:
    """STT 결과 누적 및 문장 단위 처리"""

    def __init__(self) -> None:
        self._buffer: str = ""
        self._segments: list[STTPartialPayload] = []

    def add_result(self, result: STTPartialPayload) -> None:
        """STT 결과 추가"""
        self._buffer += result.text
        self._segments.append(result)

    def get_accumulated_text(self) -> str:
        """누적된 전체 텍스트 반환"""
        return self._buffer

    def extract_complete_sentences(self) -> list[str]:
        """완성된 문장 추출 및 버퍼에서 제거"""
        # 문장 종결 패턴
        sentence_endings = [".", "!", "?", "다.", "요.", "니다.", "세요.", "까요?"]
        
        sentences = []
        remaining = self._buffer

        for ending in sentence_endings:
            while ending in remaining:
                idx = remaining.find(ending)
                if idx != -1:
                    sentence = remaining[: idx + len(ending)].strip()
                    if sentence:
                        sentences.append(sentence)
                    remaining = remaining[idx + len(ending) :].strip()

        self._buffer = remaining
        return sentences

    def clear(self) -> None:
        """버퍼 초기화"""
        self._buffer = ""
        self._segments = []

    def flush(self) -> str:
        """남은 텍스트 반환 및 초기화"""
        text = self._buffer
        self.clear()
        return text


# 싱글톤 인스턴스
gemini_stt = GeminiSTT()


async def get_stt() -> GeminiSTT:
    """STT 의존성"""
    if not gemini_stt._initialized:
        await gemini_stt.initialize()
    return gemini_stt
