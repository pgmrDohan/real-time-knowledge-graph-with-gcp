/**
 * @rkg/llm-prompts
 * LLM 프롬프트 버전 관리 및 템플릿
 */

// ============================================
// 프롬프트 메타데이터
// ============================================

export interface PromptMetadata {
  version: string;
  name: string;
  description: string;
  lastUpdated: string;
}

// ============================================
// STT 프롬프트 (Gemini 기반)
// ============================================

export const STT_PROMPT: PromptMetadata = {
  version: '1.0.0',
  name: 'gemini-stt-korean',
  description: '한국어 음성-텍스트 변환 프롬프트',
  lastUpdated: '2026-01-14',
};

/**
 * Gemini STT 시스템 프롬프트
 * 실시간 음성을 텍스트로 변환하는 용도
 */
export const STT_SYSTEM_PROMPT = `당신은 한국어 음성 인식 전문가입니다.
제공된 오디오에서 한국어 음성을 정확하게 텍스트로 변환합니다.

규칙:
1. 오직 음성에서 들리는 한국어 텍스트만 출력합니다.
2. 설명, 주석, 추가 포맷팅을 포함하지 않습니다.
3. 문장이 완성되지 않았어도 들리는 대로 출력합니다.
4. 화자 구분이나 타임스탬프를 포함하지 않습니다.
5. 한국어가 아닌 단어(영어 등)는 원어 그대로 표기합니다.
6. 숫자는 상황에 맞게 아라비아 숫자 또는 한글로 표기합니다.
7. 배경 소음이나 비음성 소리는 무시합니다.

출력 형식: 순수 텍스트만 출력`;

// ============================================
// 엔티티/관계 추출 프롬프트
// ============================================

export const EXTRACTION_PROMPT: PromptMetadata = {
  version: '1.0.0',
  name: 'entity-relation-extraction',
  description: '지식 그래프용 엔티티 및 관계 추출 프롬프트',
  lastUpdated: '2026-01-14',
};

/**
 * 엔티티/관계 추출 시스템 프롬프트 생성
 * @param existingGraph 기존 그래프 컨텍스트 (중복 방지용)
 */
export function createExtractionSystemPrompt(existingGraph?: GraphContext): string {
  const basePrompt = `당신은 지식 그래프 전문가입니다.
주어진 텍스트에서 엔티티(개체)와 관계를 추출하여 구조화된 JSON으로 반환합니다.

## 엔티티 유형
- PERSON: 인물, 사람 이름
- ORGANIZATION: 조직, 기관, 회사
- LOCATION: 장소, 지역, 국가
- CONCEPT: 추상적 개념, 이론
- EVENT: 이벤트, 사건
- PRODUCT: 제품, 서비스
- TECHNOLOGY: 기술, 도구, 프레임워크
- DATE: 날짜, 시간, 기간
- METRIC: 수치, 지표, 통계
- ACTION: 행동, 동작, 활동

## 추출 규칙
1. 명확하게 언급된 엔티티만 추출합니다.
2. 각 엔티티는 고유한 ID를 가집니다.
3. 관계는 두 엔티티 간의 의미적 연결을 나타냅니다.
4. 관계 설명은 간결하고 동사 형태로 작성합니다.
5. 모호하거나 불확실한 관계는 추출하지 않습니다.`;

  const deduplicationRules = `

## 중복 방지 규칙
1. 기존 엔티티와 의미적으로 동일한 경우, 새 ID를 만들지 말고 기존 ID를 재사용합니다.
2. 동의어, 약어, 별명은 같은 엔티티로 취급합니다.
  예: "삼성전자" = "삼성" = "Samsung"
3. 기존 관계와 동일한 source-target-relation 조합은 생성하지 않습니다.`;

  const existingContext = existingGraph
    ? `

## 기존 그래프 컨텍스트
현재 그래프에 존재하는 엔티티들입니다. 동일한 엔티티가 언급되면 해당 ID를 재사용하세요:

${formatExistingEntities(existingGraph.entities)}

기존 관계들:
${formatExistingRelations(existingGraph.relations)}`
    : '';

  const outputFormat = `

## 출력 형식
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

\`\`\`json
{
  "entities": [
    { "id": "entity_1", "label": "엔티티 이름", "type": "ENTITY_TYPE" }
  ],
  "relations": [
    { "source": "entity_1", "target": "entity_2", "relation": "관계 설명" }
  ]
}
\`\`\`

추출할 엔티티나 관계가 없으면 빈 배열을 반환합니다:
\`\`\`json
{ "entities": [], "relations": [] }
\`\`\``;

  return basePrompt + deduplicationRules + existingContext + outputFormat;
}

/**
 * 추출 사용자 프롬프트 생성
 * @param text 분석할 텍스트
 * @param morphemeInfo 형태소 분석 정보 (선택)
 */
export function createExtractionUserPrompt(text: string, morphemeInfo?: string): string {
  let prompt = `다음 텍스트에서 엔티티와 관계를 추출하세요:

"""
${text}
"""`;

  if (morphemeInfo) {
    prompt += `

형태소 분석 참고 정보:
${morphemeInfo}`;
  }

  return prompt;
}

// ============================================
// 형태소 분석 보조 프롬프트
// ============================================

export const MORPHEME_ANALYSIS_PROMPT: PromptMetadata = {
  version: '1.0.0',
  name: 'morpheme-analysis-helper',
  description: '형태소 분석 결과 해석 보조 프롬프트',
  lastUpdated: '2026-01-14',
};

/**
 * 문장 완결성 판단 프롬프트
 */
export const SENTENCE_COMPLETION_PROMPT = `주어진 형태소 분석 결과를 바탕으로 문장의 완결성을 판단합니다.

한국어 문장 완결 지표:
1. 종결어미(-다, -요, -습니다, -세요 등)의 존재
2. 마침표, 물음표, 느낌표 등 문장 부호
3. 서술어(동사/형용사)의 종결형

판단:
- COMPLETE: 문법적으로 완전한 문장
- INCOMPLETE: 미완성 문장 (계속 수신 필요)
- FRAGMENT: 문장 조각 (독립 사용 불가)`;

// ============================================
// 그래프 컨텍스트 타입
// ============================================

export interface GraphContext {
  entities: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  relations: Array<{
    source: string;
    target: string;
    relation: string;
  }>;
}

// ============================================
// 유틸리티 함수
// ============================================

function formatExistingEntities(
  entities: Array<{ id: string; label: string; type: string }>
): string {
  if (!entities || entities.length === 0) {
    return '(없음)';
  }
  return entities
    .map((e) => `- ID: ${e.id}, 라벨: "${e.label}", 유형: ${e.type}`)
    .join('\n');
}

function formatExistingRelations(
  relations: Array<{ source: string; target: string; relation: string }>
): string {
  if (!relations || relations.length === 0) {
    return '(없음)';
  }
  return relations
    .map((r) => `- ${r.source} --[${r.relation}]--> ${r.target}`)
    .join('\n');
}

// ============================================
// 프롬프트 검증
// ============================================

/**
 * 추출 결과 JSON 검증
 */
export function validateExtractionOutput(output: unknown): ValidationResult {
  if (!output || typeof output !== 'object') {
    return {
      valid: false,
      error: '출력이 객체 형태가 아닙니다.',
    };
  }

  const obj = output as Record<string, unknown>;

  if (!Array.isArray(obj.entities)) {
    return {
      valid: false,
      error: 'entities 필드가 배열이 아닙니다.',
    };
  }

  if (!Array.isArray(obj.relations)) {
    return {
      valid: false,
      error: 'relations 필드가 배열이 아닙니다.',
    };
  }

  // 엔티티 검증
  for (const entity of obj.entities) {
    const e = entity as Record<string, unknown>;
    if (!e.id || !e.label || !e.type) {
      return {
        valid: false,
        error: `엔티티에 필수 필드가 없습니다: ${JSON.stringify(entity)}`,
      };
    }
  }

  // 관계 검증
  for (const relation of obj.relations) {
    const r = relation as Record<string, unknown>;
    if (!r.source || !r.target || !r.relation) {
      return {
        valid: false,
        error: `관계에 필수 필드가 없습니다: ${JSON.stringify(relation)}`,
      };
    }
  }

  return { valid: true };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================
// 프롬프트 버전 레지스트리
// ============================================

export const PROMPT_REGISTRY = {
  stt: STT_PROMPT,
  extraction: EXTRACTION_PROMPT,
  morpheme: MORPHEME_ANALYSIS_PROMPT,
} as const;

export type PromptType = keyof typeof PROMPT_REGISTRY;



