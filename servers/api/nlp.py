"""
NLP 모듈
Kiwi를 사용한 한국어 형태소 분석
+ 다국어 지원을 위한 언어 감지 기능
"""

import re
from dataclasses import dataclass
from typing import Sequence

from kiwipiepy import Kiwi
from kiwipiepy.utils import Stopwords

from logger import get_logger
from models import KiwiMorpheme

logger = get_logger(__name__)


# 한국어 감지를 위한 유니코드 범위
# 한글 자모: U+1100 - U+11FF
# 한글 호환 자모: U+3130 - U+318F
# 한글 음절: U+AC00 - U+D7AF
KOREAN_PATTERN = re.compile(r'[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]')

# 일본어 감지를 위한 유니코드 범위
# 히라가나: U+3040 - U+309F
# 가타카나: U+30A0 - U+30FF
# 가타카나 확장: U+31F0 - U+31FF
JAPANESE_PATTERN = re.compile(r'[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]')

# 중국어 감지 (한자만 있고 히라가나/가타카나가 없는 경우)
# CJK 통합 한자: U+4E00 - U+9FFF
CJK_PATTERN = re.compile(r'[\u4E00-\u9FFF]')


def detect_text_language(text: str) -> str:
    """
    텍스트에서 주요 언어를 감지합니다.
    
    Returns:
        "ko": 한국어
        "ja": 일본어
        "zh": 중국어
        "en": 영어/기타
    """
    if not text:
        return "en"
    
    korean_chars = len(KOREAN_PATTERN.findall(text))
    japanese_chars = len(JAPANESE_PATTERN.findall(text))
    cjk_chars = len(CJK_PATTERN.findall(text))
    total_chars = len(text.replace(" ", ""))
    
    if total_chars == 0:
        return "en"
    
    korean_ratio = korean_chars / total_chars
    japanese_ratio = japanese_chars / total_chars
    cjk_ratio = cjk_chars / total_chars
    
    # 한글이 10% 이상이면 한국어
    if korean_ratio > 0.1:
        return "ko"
    
    # 히라가나/가타카나가 있으면 일본어
    if japanese_ratio > 0.05:
        return "ja"
    
    # 한자만 있으면 중국어 (일본어 아님)
    if cjk_ratio > 0.1 and japanese_ratio < 0.01:
        return "zh"
    
    return "en"


def is_korean_text(text: str, threshold: float = 0.1) -> bool:
    """
    텍스트가 한국어인지 확인합니다.
    
    Args:
        text: 확인할 텍스트
        threshold: 한글 비율 임계값 (기본 10%)
    
    Returns:
        True if Korean, False otherwise
    """
    if not text:
        return False
    
    korean_chars = len(KOREAN_PATTERN.findall(text))
    total_chars = len(text.replace(" ", ""))
    
    if total_chars == 0:
        return False
    
    return (korean_chars / total_chars) >= threshold


@dataclass
class SentenceAnalysis:
    """문장 분석 결과"""

    text: str
    morphemes: list[KiwiMorpheme]
    is_complete: bool
    has_predicate: bool
    topic_changed: bool


class KoreanNLP:
    """한국어 NLP 처리기 (다국어 텍스트 안전 처리)"""

    # 종결어미 품사 태그
    ENDING_TAGS = {"EF", "EC", "ETM", "ETN"}

    # 서술어 품사 태그 (동사, 형용사)
    PREDICATE_TAGS = {"VV", "VA", "VX", "VCP", "VCN"}

    # 문장 종결 표지
    SENTENCE_ENDINGS = {
        "다", "요", "니다", "세요", "까요", "네요", "군요",
        "지요", "래요", "데요", "어요", "아요",
    }

    def __init__(self) -> None:
        self._kiwi: Kiwi | None = None
        self._stopwords: Stopwords | None = None
        self._initialized = False

    async def initialize(self) -> None:
        """Kiwi 초기화"""
        if self._initialized:
            return

        # Kiwi 초기화
        # 주의: typos 옵션을 비활성화하여 외국어를 한국어로 잘못 교정하는 것을 방지
        # 이전에는 typos="basic"이었으나, 일본어 등이 한국어로 변환되는 문제가 있었음
        self._kiwi = Kiwi()
        self._stopwords = Stopwords()

        logger.info("kiwi_nlp_initialized", typos_disabled=True)
        self._initialized = True

    def analyze(self, text: str, skip_non_korean: bool = True) -> SentenceAnalysis:
        """
        텍스트 형태소 분석
        
        Args:
            text: 분석할 텍스트
            skip_non_korean: True면 한국어가 아닌 텍스트는 분석을 건너뜀
        
        Returns:
            SentenceAnalysis 결과
        """
        if not self._kiwi:
            raise RuntimeError("Kiwi가 초기화되지 않았습니다")

        # 한국어가 아닌 텍스트는 Kiwi 분석을 건너뛰기
        # Kiwi가 외국어(특히 일본어)를 한국어로 잘못 해석하는 것을 방지
        if skip_non_korean and not is_korean_text(text):
            detected_lang = detect_text_language(text)
            logger.debug(
                "skip_kiwi_analysis_non_korean",
                text_preview=text[:50],
                detected_language=detected_lang,
            )
            return SentenceAnalysis(
                text=text,
                morphemes=[],
                is_complete=True,  # 외국어는 완결된 것으로 간주
                has_predicate=True,  # 외국어는 서술어가 있는 것으로 간주
                topic_changed=False,
            )

        # 형태소 분석
        result = self._kiwi.analyze(text, top_n=1)
        if not result:
            return SentenceAnalysis(
                text=text,
                morphemes=[],
                is_complete=False,
                has_predicate=False,
                topic_changed=False,
            )

        tokens = result[0][0]  # 최상위 분석 결과

        morphemes = [
            KiwiMorpheme(
                form=token.form,
                tag=token.tag,
                start=token.start,
                end=token.end,
            )
            for token in tokens
        ]

        # 문장 완결성 판단
        is_complete = self._check_sentence_completion(morphemes)
        has_predicate = self._check_has_predicate(morphemes)

        return SentenceAnalysis(
            text=text,
            morphemes=morphemes,
            is_complete=is_complete,
            has_predicate=has_predicate,
            topic_changed=False,  # 주제 변화는 문맥 필요
        )

    def split_sentences(self, text: str, skip_non_korean: bool = True) -> list[str]:
        """
        텍스트를 문장 단위로 분리
        
        한국어가 아닌 텍스트는 일반적인 문장 부호로 분리
        """
        if not self._kiwi:
            raise RuntimeError("Kiwi가 초기화되지 않았습니다")

        # 한국어가 아니면 일반 문장 부호로 분리
        if skip_non_korean and not is_korean_text(text):
            return self._split_sentences_generic(text)

        sentences = self._kiwi.split_into_sents(text)
        return [sent.text for sent in sentences]

    def _split_sentences_generic(self, text: str) -> list[str]:
        """일반적인 문장 부호로 문장 분리 (다국어 지원)"""
        # 다국어 문장 종결 패턴
        import re
        # 문장 종결 부호로 분리 (. ! ? 。 ！ ？)
        sentences = re.split(r'(?<=[.!?。！？])\s*', text)
        return [s.strip() for s in sentences if s.strip()]

    def extract_nouns(self, text: str, skip_non_korean: bool = True) -> list[str]:
        """
        명사 추출
        
        한국어가 아닌 텍스트는 빈 리스트 반환
        """
        if not self._kiwi:
            raise RuntimeError("Kiwi가 초기화되지 않았습니다")

        # 한국어가 아니면 빈 리스트 반환 (Kiwi가 외국어를 잘못 해석하는 것 방지)
        if skip_non_korean and not is_korean_text(text):
            logger.debug("skip_noun_extraction_non_korean", text_preview=text[:50])
            return []

        result = self._kiwi.analyze(text, top_n=1)
        if not result:
            return []

        nouns = []
        for token in result[0][0]:
            if token.tag.startswith("N"):  # NNG, NNP, NNB, NR, NP
                nouns.append(token.form)

        return nouns

    def extract_noun_phrases(self, text: str, skip_non_korean: bool = True) -> list[str]:
        """
        명사구 추출
        
        한국어가 아닌 텍스트는 빈 리스트 반환
        """
        if not self._kiwi:
            raise RuntimeError("Kiwi가 초기화되지 않았습니다")

        # 한국어가 아니면 빈 리스트 반환
        if skip_non_korean and not is_korean_text(text):
            logger.debug("skip_noun_phrase_extraction_non_korean", text_preview=text[:50])
            return []

        result = self._kiwi.analyze(text, top_n=1)
        if not result:
            return []

        tokens = result[0][0]
        phrases = []
        current_phrase: list[str] = []

        for token in tokens:
            # 명사, 관형사, 조사 등을 포함
            if token.tag.startswith("N") or token.tag in {"MM", "JKG", "JX"}:
                current_phrase.append(token.form)
            else:
                if len(current_phrase) > 1:
                    phrases.append("".join(current_phrase))
                elif current_phrase:
                    phrases.append(current_phrase[0])
                current_phrase = []

        # 마지막 구
        if len(current_phrase) > 1:
            phrases.append("".join(current_phrase))
        elif current_phrase:
            phrases.append(current_phrase[0])

        return phrases

    def check_semantic_completeness(self, text: str, skip_non_korean: bool = True) -> bool:
        """
        의미적 완결성 판단
        
        한국어가 아닌 텍스트는 길이 기반으로만 판단
        """
        # 한국어가 아닌 텍스트는 문장 부호 기반으로 판단
        if skip_non_korean and not is_korean_text(text):
            text_stripped = text.strip()
            # 최소 길이 체크
            if len(text_stripped) < 3:
                return False
            # 문장 종결 부호로 끝나는지 확인
            return text_stripped.endswith(('.', '!', '?', '。', '！', '？'))
        
        analysis = self.analyze(text, skip_non_korean=False)  # 한국어임이 확실하므로 분석 수행

        # 조건 1: 서술어 존재
        if not analysis.has_predicate:
            return False

        # 조건 2: 문장 종결
        if not analysis.is_complete:
            return False

        # 조건 3: 최소 길이 (너무 짧은 문장 제외)
        if len(text.strip()) < 5:
            return False

        return True

    def _check_sentence_completion(self, morphemes: Sequence[KiwiMorpheme]) -> bool:
        """문장 완결 여부 확인"""
        if not morphemes:
            return False

        # 마지막 몇 개의 형태소 확인
        last_morphemes = morphemes[-3:]

        for morpheme in reversed(last_morphemes):
            # 종결어미 확인
            if morpheme.tag in self.ENDING_TAGS:
                # 특정 종결 패턴 확인
                if any(
                    morpheme.form.endswith(ending)
                    for ending in self.SENTENCE_ENDINGS
                ):
                    return True

            # 문장 부호 확인
            if morpheme.tag == "SF":  # 마침표, 물음표, 느낌표
                return True

        return False

    def _check_has_predicate(self, morphemes: Sequence[KiwiMorpheme]) -> bool:
        """서술어 존재 확인"""
        for morpheme in morphemes:
            if morpheme.tag in self.PREDICATE_TAGS:
                return True
        return False

    def format_morphemes_for_llm(self, morphemes: list[KiwiMorpheme]) -> str:
        """형태소 분석 결과를 LLM 입력용 문자열로 포맷"""
        formatted = []
        for m in morphemes:
            formatted.append(f"{m.form}/{m.tag}")
        return " ".join(formatted)


class SemanticChunkBuilder:
    """의미 단위 청크 빌더 (다국어 지원)"""

    def __init__(self, nlp: KoreanNLP) -> None:
        self._nlp = nlp
        self._buffer: str = ""
        self._pending_sentences: list[str] = []

    def add_text(self, text: str, language_code: str | None = None) -> list[str]:
        """
        텍스트 추가 및 완성된 청크 반환
        
        Args:
            text: 추가할 텍스트
            language_code: STT에서 감지된 언어 코드 (선택)
        """
        self._buffer += text
        completed_chunks: list[str] = []

        # 언어 코드가 제공되지 않으면 텍스트에서 감지
        is_korean = language_code == "ko" if language_code else is_korean_text(self._buffer)
        
        # 문장 분리 시도 (한국어가 아니면 Kiwi 건너뛰기)
        sentences = self._nlp.split_sentences(self._buffer, skip_non_korean=not is_korean)

        for sentence in sentences[:-1]:  # 마지막 문장은 미완성일 수 있음
            if self._nlp.check_semantic_completeness(sentence, skip_non_korean=not is_korean):
                self._pending_sentences.append(sentence)

                # 3문장 이상 누적되면 청크로 반환
                if len(self._pending_sentences) >= 3:
                    chunk = " ".join(self._pending_sentences)
                    completed_chunks.append(chunk)
                    self._pending_sentences = []

        # 버퍼 업데이트 (마지막 미완성 문장만 유지)
        if sentences:
            self._buffer = sentences[-1]
        else:
            self._buffer = ""

        return completed_chunks

    def flush(self) -> str | None:
        """남은 텍스트 강제 반환"""
        all_text = " ".join(self._pending_sentences)
        if self._buffer.strip():
            all_text += " " + self._buffer

        self._pending_sentences = []
        self._buffer = ""

        return all_text.strip() if all_text.strip() else None


# 싱글톤 인스턴스
korean_nlp = KoreanNLP()


async def get_nlp() -> KoreanNLP:
    """NLP 의존성"""
    if not korean_nlp._initialized:
        await korean_nlp.initialize()
    return korean_nlp


