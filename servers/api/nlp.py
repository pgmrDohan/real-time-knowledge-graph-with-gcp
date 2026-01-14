"""
NLP 모듈
Kiwi를 사용한 한국어 형태소 분석
"""

from dataclasses import dataclass
from typing import Sequence

from kiwipiepy import Kiwi
from kiwipiepy.utils import Stopwords

from logger import get_logger
from models import KiwiMorpheme

logger = get_logger(__name__)


@dataclass
class SentenceAnalysis:
    """문장 분석 결과"""

    text: str
    morphemes: list[KiwiMorpheme]
    is_complete: bool
    has_predicate: bool
    topic_changed: bool


class KoreanNLP:
    """한국어 NLP 처리기"""

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

        # Kiwi 초기화 (모델 로딩에 시간 소요)
        self._kiwi = Kiwi(typos="basic")
        self._stopwords = Stopwords()

        logger.info("kiwi_nlp_initialized")
        self._initialized = True

    def analyze(self, text: str) -> SentenceAnalysis:
        """텍스트 형태소 분석"""
        if not self._kiwi:
            raise RuntimeError("Kiwi가 초기화되지 않았습니다")

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

    def split_sentences(self, text: str) -> list[str]:
        """텍스트를 문장 단위로 분리"""
        if not self._kiwi:
            raise RuntimeError("Kiwi가 초기화되지 않았습니다")

        sentences = self._kiwi.split_into_sents(text)
        return [sent.text for sent in sentences]

    def extract_nouns(self, text: str) -> list[str]:
        """명사 추출"""
        if not self._kiwi:
            raise RuntimeError("Kiwi가 초기화되지 않았습니다")

        result = self._kiwi.analyze(text, top_n=1)
        if not result:
            return []

        nouns = []
        for token in result[0][0]:
            if token.tag.startswith("N"):  # NNG, NNP, NNB, NR, NP
                nouns.append(token.form)

        return nouns

    def extract_noun_phrases(self, text: str) -> list[str]:
        """명사구 추출"""
        if not self._kiwi:
            raise RuntimeError("Kiwi가 초기화되지 않았습니다")

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

    def check_semantic_completeness(self, text: str) -> bool:
        """의미적 완결성 판단"""
        analysis = self.analyze(text)

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
    """의미 단위 청크 빌더"""

    def __init__(self, nlp: KoreanNLP) -> None:
        self._nlp = nlp
        self._buffer: str = ""
        self._pending_sentences: list[str] = []

    def add_text(self, text: str) -> list[str]:
        """텍스트 추가 및 완성된 청크 반환"""
        self._buffer += text
        completed_chunks: list[str] = []

        # 문장 분리 시도
        sentences = self._nlp.split_sentences(self._buffer)

        for sentence in sentences[:-1]:  # 마지막 문장은 미완성일 수 있음
            if self._nlp.check_semantic_completeness(sentence):
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


