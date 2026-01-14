"""
STT (Speech-to-Text) 모듈
Cloud Speech-to-Text v2를 사용한 다국어 음성 인식

이 모듈은 GCP Cloud Speech-to-Text v2 API를 래핑하여
실시간 다국어 음성 인식 기능을 제공합니다.
"""

from typing import AsyncGenerator

from config import get_settings
from gcp.speech_to_text import CloudSpeechToText, get_speech_client
from logger import get_logger
from models import AudioFormat, STTPartialPayload, STTFinalPayload

logger = get_logger(__name__)


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
        # 다국어 문장 종결 패턴
        sentence_endings = [
            # 한국어
            "다.", "요.", "니다.", "세요.", "까요?", "습니다.", "입니다.", "네요.", "죠.",
            # 영어
            ". ", "! ", "? ",
            # 일본어
            "。", "！", "？",
            # 중국어
            "。", "！", "？",
        ]

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


# 싱글톤 STT 클라이언트
async def get_stt() -> CloudSpeechToText:
    """STT 의존성 - Cloud Speech-to-Text v2 사용"""
    return await get_speech_client()
