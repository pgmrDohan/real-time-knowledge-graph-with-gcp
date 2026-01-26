/**
 * 데모 모드용 목 데이터
 * 발표 시 실제처럼 보이도록 STT, 그래프, 번역 데이터를 시뮬레이션
 */

import type {
  GraphEntity,
  GraphRelation,
  GraphDelta,
  ProcessingStage,
} from '@rkg/shared-types';

// ============================================
// STT 데모 데이터
// ============================================

export interface DemoSTTEntry {
  /** 전체 텍스트 */
  text: string;
  /** 타이핑 효과용 부분 텍스트 배열 */
  partialTexts: string[];
  /** 이 STT 후 추가될 엔티티/관계 인덱스 */
  graphDeltaIndex: number;
}

/**
 * 데모 STT 시나리오 - AI/ML 주제 발표
 */
export const DEMO_STT_ENTRIES: DemoSTTEntry[] = [
  {
    text: '안녕하세요, 오늘은 인공지능의 최신 트렌드에 대해 말씀드리겠습니다.',
    partialTexts: [
      '안녕하세요',
      '안녕하세요, 오늘은',
      '안녕하세요, 오늘은 인공지능의',
      '안녕하세요, 오늘은 인공지능의 최신 트렌드에 대해',
    ],
    graphDeltaIndex: 0,
  },
  {
    text: 'OpenAI는 2023년에 GPT-4를 출시했으며, 이는 자연어 처리 분야에서 혁신적인 발전을 이끌었습니다.',
    partialTexts: [
      'OpenAI는',
      'OpenAI는 2023년에',
      'OpenAI는 2023년에 GPT-4를 출시했으며',
      'OpenAI는 2023년에 GPT-4를 출시했으며, 이는 자연어 처리 분야에서',
    ],
    graphDeltaIndex: 1,
  },
  {
    text: 'Google의 Gemini와 Anthropic의 Claude도 경쟁적으로 발전하고 있습니다.',
    partialTexts: [
      'Google의',
      'Google의 Gemini와',
      'Google의 Gemini와 Anthropic의',
      'Google의 Gemini와 Anthropic의 Claude도 경쟁적으로',
    ],
    graphDeltaIndex: 2,
  },
  {
    text: '이러한 대규모 언어 모델들은 코드 생성, 문서 작성, 데이터 분석 등 다양한 분야에서 활용되고 있습니다.',
    partialTexts: [
      '이러한 대규모',
      '이러한 대규모 언어 모델들은',
      '이러한 대규모 언어 모델들은 코드 생성, 문서 작성',
      '이러한 대규모 언어 모델들은 코드 생성, 문서 작성, 데이터 분석 등',
    ],
    graphDeltaIndex: 3,
  },
  {
    text: '특히 RAG(Retrieval-Augmented Generation) 기술은 LLM의 환각 문제를 해결하는 데 큰 역할을 하고 있습니다.',
    partialTexts: [
      '특히 RAG',
      '특히 RAG(Retrieval-Augmented Generation)',
      '특히 RAG(Retrieval-Augmented Generation) 기술은',
      '특히 RAG(Retrieval-Augmented Generation) 기술은 LLM의 환각 문제를',
    ],
    graphDeltaIndex: 4,
  },
  {
    text: '멀티모달 AI도 주목받고 있는데, 텍스트, 이미지, 오디오를 함께 처리할 수 있습니다.',
    partialTexts: [
      '멀티모달 AI도',
      '멀티모달 AI도 주목받고 있는데',
      '멀티모달 AI도 주목받고 있는데, 텍스트, 이미지',
      '멀티모달 AI도 주목받고 있는데, 텍스트, 이미지, 오디오를',
    ],
    graphDeltaIndex: 5,
  },
  {
    text: 'AI 에이전트는 자율적으로 작업을 수행하며, 복잡한 문제 해결에 활용됩니다.',
    partialTexts: [
      'AI 에이전트는',
      'AI 에이전트는 자율적으로',
      'AI 에이전트는 자율적으로 작업을 수행하며',
      'AI 에이전트는 자율적으로 작업을 수행하며, 복잡한 문제 해결에',
    ],
    graphDeltaIndex: 6,
  },
  {
    text: '앞으로 AI 기술은 더욱 발전하여 우리 일상에 깊이 통합될 것입니다. 감사합니다.',
    partialTexts: [
      '앞으로',
      '앞으로 AI 기술은',
      '앞으로 AI 기술은 더욱 발전하여',
      '앞으로 AI 기술은 더욱 발전하여 우리 일상에 깊이 통합될 것입니다',
    ],
    graphDeltaIndex: 7,
  },
];

// ============================================
// 그래프 데모 데이터
// ============================================

const now = Date.now();

/**
 * 데모용 엔티티 데이터
 */
const DEMO_ENTITIES: GraphEntity[] = [
  // Delta 0 - 인공지능 소개
  { id: 'e1', label: '인공지능', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e2', label: 'AI 트렌드', type: 'CONCEPT', createdAt: now, updatedAt: now },
  
  // Delta 1 - OpenAI & GPT-4
  { id: 'e3', label: 'OpenAI', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e4', label: 'GPT-4', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e5', label: '2023년', type: 'DATE', createdAt: now, updatedAt: now },
  { id: 'e6', label: '자연어 처리', type: 'CONCEPT', createdAt: now, updatedAt: now },
  
  // Delta 2 - Google & Anthropic
  { id: 'e7', label: 'Google', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e8', label: 'Gemini', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e9', label: 'Anthropic', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e10', label: 'Claude', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  
  // Delta 3 - 활용 분야
  { id: 'e11', label: '대규모 언어 모델', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e12', label: '코드 생성', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e13', label: '문서 작성', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e14', label: '데이터 분석', type: 'ACTION', createdAt: now, updatedAt: now },
  
  // Delta 4 - RAG
  { id: 'e15', label: 'RAG', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e16', label: '환각 문제', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e17', label: 'LLM', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  
  // Delta 5 - 멀티모달
  { id: 'e18', label: '멀티모달 AI', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e19', label: '텍스트 처리', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e20', label: '이미지 처리', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e21', label: '오디오 처리', type: 'ACTION', createdAt: now, updatedAt: now },
  
  // Delta 6 - AI 에이전트
  { id: 'e22', label: 'AI 에이전트', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e23', label: '자율 작업', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e24', label: '문제 해결', type: 'ACTION', createdAt: now, updatedAt: now },
  
  // Delta 7 - 미래 전망
  { id: 'e25', label: 'AI 발전', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e26', label: '일상 통합', type: 'CONCEPT', createdAt: now, updatedAt: now },
];

/**
 * 데모용 관계 데이터
 */
const DEMO_RELATIONS: GraphRelation[] = [
  // Delta 0
  { id: 'r1', source: 'e1', target: 'e2', relation: '포함', createdAt: now },
  
  // Delta 1
  { id: 'r2', source: 'e3', target: 'e4', relation: '개발', createdAt: now },
  { id: 'r3', source: 'e4', target: 'e5', relation: '출시 시점', createdAt: now },
  { id: 'r4', source: 'e4', target: 'e6', relation: '기반 기술', createdAt: now },
  { id: 'r5', source: 'e4', target: 'e1', relation: '속함', createdAt: now },
  
  // Delta 2
  { id: 'r6', source: 'e7', target: 'e8', relation: '개발', createdAt: now },
  { id: 'r7', source: 'e9', target: 'e10', relation: '개발', createdAt: now },
  { id: 'r8', source: 'e8', target: 'e4', relation: '경쟁', createdAt: now },
  { id: 'r9', source: 'e10', target: 'e4', relation: '경쟁', createdAt: now },
  
  // Delta 3
  { id: 'r10', source: 'e4', target: 'e11', relation: '유형', createdAt: now },
  { id: 'r11', source: 'e8', target: 'e11', relation: '유형', createdAt: now },
  { id: 'r12', source: 'e10', target: 'e11', relation: '유형', createdAt: now },
  { id: 'r13', source: 'e11', target: 'e12', relation: '활용', createdAt: now },
  { id: 'r14', source: 'e11', target: 'e13', relation: '활용', createdAt: now },
  { id: 'r15', source: 'e11', target: 'e14', relation: '활용', createdAt: now },
  
  // Delta 4
  { id: 'r16', source: 'e15', target: 'e17', relation: '보완', createdAt: now },
  { id: 'r17', source: 'e15', target: 'e16', relation: '해결', createdAt: now },
  { id: 'r18', source: 'e17', target: 'e16', relation: '문제점', createdAt: now },
  { id: 'r19', source: 'e17', target: 'e11', relation: '동의어', createdAt: now },
  
  // Delta 5
  { id: 'r20', source: 'e18', target: 'e19', relation: '기능', createdAt: now },
  { id: 'r21', source: 'e18', target: 'e20', relation: '기능', createdAt: now },
  { id: 'r22', source: 'e18', target: 'e21', relation: '기능', createdAt: now },
  { id: 'r23', source: 'e18', target: 'e1', relation: '하위 분야', createdAt: now },
  
  // Delta 6
  { id: 'r24', source: 'e22', target: 'e23', relation: '특징', createdAt: now },
  { id: 'r25', source: 'e22', target: 'e24', relation: '활용', createdAt: now },
  { id: 'r26', source: 'e22', target: 'e1', relation: '하위 분야', createdAt: now },
  
  // Delta 7
  { id: 'r27', source: 'e1', target: 'e25', relation: '전망', createdAt: now },
  { id: 'r28', source: 'e25', target: 'e26', relation: '결과', createdAt: now },
];

/**
 * 그래프 델타 시퀀스 - 각 STT 후 적용될 변경사항
 */
export const DEMO_GRAPH_DELTAS: GraphDelta[] = [
  // Delta 0 - 인공지능 소개
  {
    addedEntities: DEMO_ENTITIES.slice(0, 2),
    addedRelations: DEMO_RELATIONS.slice(0, 1),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 0,
    toVersion: 1,
  },
  // Delta 1 - OpenAI & GPT-4
  {
    addedEntities: DEMO_ENTITIES.slice(2, 6),
    addedRelations: DEMO_RELATIONS.slice(1, 5),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 1,
    toVersion: 2,
  },
  // Delta 2 - Google & Anthropic
  {
    addedEntities: DEMO_ENTITIES.slice(6, 10),
    addedRelations: DEMO_RELATIONS.slice(5, 9),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 2,
    toVersion: 3,
  },
  // Delta 3 - 활용 분야
  {
    addedEntities: DEMO_ENTITIES.slice(10, 14),
    addedRelations: DEMO_RELATIONS.slice(9, 15),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 3,
    toVersion: 4,
  },
  // Delta 4 - RAG
  {
    addedEntities: DEMO_ENTITIES.slice(14, 17),
    addedRelations: DEMO_RELATIONS.slice(15, 19),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 4,
    toVersion: 5,
  },
  // Delta 5 - 멀티모달
  {
    addedEntities: DEMO_ENTITIES.slice(17, 21),
    addedRelations: DEMO_RELATIONS.slice(19, 23),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 5,
    toVersion: 6,
  },
  // Delta 6 - AI 에이전트
  {
    addedEntities: DEMO_ENTITIES.slice(21, 24),
    addedRelations: DEMO_RELATIONS.slice(23, 26),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 6,
    toVersion: 7,
  },
  // Delta 7 - 미래 전망
  {
    addedEntities: DEMO_ENTITIES.slice(24, 26),
    addedRelations: DEMO_RELATIONS.slice(26, 28),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 7,
    toVersion: 8,
  },
];

// ============================================
// 번역 데모 데이터
// ============================================

/**
 * 번역 데모 데이터 - 언어별 라벨 매핑
 */
export const DEMO_TRANSLATIONS: Record<
  string,
  { entities: Array<{ id: string; label: string; type: string }>; relations: Array<{ source: string; target: string; relation: string }> }
> = {
  en: {
    entities: [
      { id: 'e1', label: 'Artificial Intelligence', type: 'TECHNOLOGY' },
      { id: 'e2', label: 'AI Trends', type: 'CONCEPT' },
      { id: 'e3', label: 'OpenAI', type: 'ORGANIZATION' },
      { id: 'e4', label: 'GPT-4', type: 'TECHNOLOGY' },
      { id: 'e5', label: '2023', type: 'DATE' },
      { id: 'e6', label: 'Natural Language Processing', type: 'CONCEPT' },
      { id: 'e7', label: 'Google', type: 'ORGANIZATION' },
      { id: 'e8', label: 'Gemini', type: 'TECHNOLOGY' },
      { id: 'e9', label: 'Anthropic', type: 'ORGANIZATION' },
      { id: 'e10', label: 'Claude', type: 'TECHNOLOGY' },
      { id: 'e11', label: 'Large Language Model', type: 'CONCEPT' },
      { id: 'e12', label: 'Code Generation', type: 'ACTION' },
      { id: 'e13', label: 'Document Writing', type: 'ACTION' },
      { id: 'e14', label: 'Data Analysis', type: 'ACTION' },
      { id: 'e15', label: 'RAG', type: 'TECHNOLOGY' },
      { id: 'e16', label: 'Hallucination Problem', type: 'CONCEPT' },
      { id: 'e17', label: 'LLM', type: 'TECHNOLOGY' },
      { id: 'e18', label: 'Multimodal AI', type: 'TECHNOLOGY' },
      { id: 'e19', label: 'Text Processing', type: 'ACTION' },
      { id: 'e20', label: 'Image Processing', type: 'ACTION' },
      { id: 'e21', label: 'Audio Processing', type: 'ACTION' },
      { id: 'e22', label: 'AI Agent', type: 'TECHNOLOGY' },
      { id: 'e23', label: 'Autonomous Task', type: 'CONCEPT' },
      { id: 'e24', label: 'Problem Solving', type: 'ACTION' },
      { id: 'e25', label: 'AI Advancement', type: 'CONCEPT' },
      { id: 'e26', label: 'Daily Integration', type: 'CONCEPT' },
    ],
    relations: [
      { source: 'e1', target: 'e2', relation: 'includes' },
      { source: 'e3', target: 'e4', relation: 'developed' },
      { source: 'e4', target: 'e5', relation: 'release date' },
      { source: 'e4', target: 'e6', relation: 'based on' },
      { source: 'e4', target: 'e1', relation: 'belongs to' },
      { source: 'e7', target: 'e8', relation: 'developed' },
      { source: 'e9', target: 'e10', relation: 'developed' },
      { source: 'e8', target: 'e4', relation: 'competes with' },
      { source: 'e10', target: 'e4', relation: 'competes with' },
      { source: 'e4', target: 'e11', relation: 'type of' },
      { source: 'e8', target: 'e11', relation: 'type of' },
      { source: 'e10', target: 'e11', relation: 'type of' },
      { source: 'e11', target: 'e12', relation: 'used for' },
      { source: 'e11', target: 'e13', relation: 'used for' },
      { source: 'e11', target: 'e14', relation: 'used for' },
      { source: 'e15', target: 'e17', relation: 'enhances' },
      { source: 'e15', target: 'e16', relation: 'solves' },
      { source: 'e17', target: 'e16', relation: 'has issue' },
      { source: 'e17', target: 'e11', relation: 'synonym' },
      { source: 'e18', target: 'e19', relation: 'capability' },
      { source: 'e18', target: 'e20', relation: 'capability' },
      { source: 'e18', target: 'e21', relation: 'capability' },
      { source: 'e18', target: 'e1', relation: 'subfield of' },
      { source: 'e22', target: 'e23', relation: 'feature' },
      { source: 'e22', target: 'e24', relation: 'used for' },
      { source: 'e22', target: 'e1', relation: 'subfield of' },
      { source: 'e1', target: 'e25', relation: 'outlook' },
      { source: 'e25', target: 'e26', relation: 'result' },
    ],
  },
  ja: {
    entities: [
      { id: 'e1', label: '人工知能', type: 'TECHNOLOGY' },
      { id: 'e2', label: 'AIトレンド', type: 'CONCEPT' },
      { id: 'e3', label: 'OpenAI', type: 'ORGANIZATION' },
      { id: 'e4', label: 'GPT-4', type: 'TECHNOLOGY' },
      { id: 'e5', label: '2023年', type: 'DATE' },
      { id: 'e6', label: '自然言語処理', type: 'CONCEPT' },
      { id: 'e7', label: 'Google', type: 'ORGANIZATION' },
      { id: 'e8', label: 'Gemini', type: 'TECHNOLOGY' },
      { id: 'e9', label: 'Anthropic', type: 'ORGANIZATION' },
      { id: 'e10', label: 'Claude', type: 'TECHNOLOGY' },
      { id: 'e11', label: '大規模言語モデル', type: 'CONCEPT' },
      { id: 'e12', label: 'コード生成', type: 'ACTION' },
      { id: 'e13', label: '文書作成', type: 'ACTION' },
      { id: 'e14', label: 'データ分析', type: 'ACTION' },
      { id: 'e15', label: 'RAG', type: 'TECHNOLOGY' },
      { id: 'e16', label: 'ハルシネーション問題', type: 'CONCEPT' },
      { id: 'e17', label: 'LLM', type: 'TECHNOLOGY' },
      { id: 'e18', label: 'マルチモーダルAI', type: 'TECHNOLOGY' },
      { id: 'e19', label: 'テキスト処理', type: 'ACTION' },
      { id: 'e20', label: '画像処理', type: 'ACTION' },
      { id: 'e21', label: '音声処理', type: 'ACTION' },
      { id: 'e22', label: 'AIエージェント', type: 'TECHNOLOGY' },
      { id: 'e23', label: '自律タスク', type: 'CONCEPT' },
      { id: 'e24', label: '問題解決', type: 'ACTION' },
      { id: 'e25', label: 'AI発展', type: 'CONCEPT' },
      { id: 'e26', label: '日常統合', type: 'CONCEPT' },
    ],
    relations: [
      { source: 'e1', target: 'e2', relation: '含む' },
      { source: 'e3', target: 'e4', relation: '開発' },
      { source: 'e4', target: 'e5', relation: 'リリース日' },
      { source: 'e4', target: 'e6', relation: '基盤技術' },
      { source: 'e4', target: 'e1', relation: '所属' },
      { source: 'e7', target: 'e8', relation: '開発' },
      { source: 'e9', target: 'e10', relation: '開発' },
      { source: 'e8', target: 'e4', relation: '競争' },
      { source: 'e10', target: 'e4', relation: '競争' },
      { source: 'e4', target: 'e11', relation: 'タイプ' },
      { source: 'e8', target: 'e11', relation: 'タイプ' },
      { source: 'e10', target: 'e11', relation: 'タイプ' },
      { source: 'e11', target: 'e12', relation: '活用' },
      { source: 'e11', target: 'e13', relation: '活用' },
      { source: 'e11', target: 'e14', relation: '活用' },
      { source: 'e15', target: 'e17', relation: '補完' },
      { source: 'e15', target: 'e16', relation: '解決' },
      { source: 'e17', target: 'e16', relation: '問題点' },
      { source: 'e17', target: 'e11', relation: '同義語' },
      { source: 'e18', target: 'e19', relation: '機能' },
      { source: 'e18', target: 'e20', relation: '機能' },
      { source: 'e18', target: 'e21', relation: '機能' },
      { source: 'e18', target: 'e1', relation: '下位分野' },
      { source: 'e22', target: 'e23', relation: '特徴' },
      { source: 'e22', target: 'e24', relation: '活用' },
      { source: 'e22', target: 'e1', relation: '下位分野' },
      { source: 'e1', target: 'e25', relation: '展望' },
      { source: 'e25', target: 'e26', relation: '結果' },
    ],
  },
  zh: {
    entities: [
      { id: 'e1', label: '人工智能', type: 'TECHNOLOGY' },
      { id: 'e2', label: 'AI趋势', type: 'CONCEPT' },
      { id: 'e3', label: 'OpenAI', type: 'ORGANIZATION' },
      { id: 'e4', label: 'GPT-4', type: 'TECHNOLOGY' },
      { id: 'e5', label: '2023年', type: 'DATE' },
      { id: 'e6', label: '自然语言处理', type: 'CONCEPT' },
      { id: 'e7', label: 'Google', type: 'ORGANIZATION' },
      { id: 'e8', label: 'Gemini', type: 'TECHNOLOGY' },
      { id: 'e9', label: 'Anthropic', type: 'ORGANIZATION' },
      { id: 'e10', label: 'Claude', type: 'TECHNOLOGY' },
      { id: 'e11', label: '大型语言模型', type: 'CONCEPT' },
      { id: 'e12', label: '代码生成', type: 'ACTION' },
      { id: 'e13', label: '文档编写', type: 'ACTION' },
      { id: 'e14', label: '数据分析', type: 'ACTION' },
      { id: 'e15', label: 'RAG', type: 'TECHNOLOGY' },
      { id: 'e16', label: '幻觉问题', type: 'CONCEPT' },
      { id: 'e17', label: 'LLM', type: 'TECHNOLOGY' },
      { id: 'e18', label: '多模态AI', type: 'TECHNOLOGY' },
      { id: 'e19', label: '文本处理', type: 'ACTION' },
      { id: 'e20', label: '图像处理', type: 'ACTION' },
      { id: 'e21', label: '音频处理', type: 'ACTION' },
      { id: 'e22', label: 'AI代理', type: 'TECHNOLOGY' },
      { id: 'e23', label: '自主任务', type: 'CONCEPT' },
      { id: 'e24', label: '问题解决', type: 'ACTION' },
      { id: 'e25', label: 'AI发展', type: 'CONCEPT' },
      { id: 'e26', label: '日常整合', type: 'CONCEPT' },
    ],
    relations: [
      { source: 'e1', target: 'e2', relation: '包含' },
      { source: 'e3', target: 'e4', relation: '开发' },
      { source: 'e4', target: 'e5', relation: '发布时间' },
      { source: 'e4', target: 'e6', relation: '基于' },
      { source: 'e4', target: 'e1', relation: '属于' },
      { source: 'e7', target: 'e8', relation: '开发' },
      { source: 'e9', target: 'e10', relation: '开发' },
      { source: 'e8', target: 'e4', relation: '竞争' },
      { source: 'e10', target: 'e4', relation: '竞争' },
      { source: 'e4', target: 'e11', relation: '类型' },
      { source: 'e8', target: 'e11', relation: '类型' },
      { source: 'e10', target: 'e11', relation: '类型' },
      { source: 'e11', target: 'e12', relation: '用于' },
      { source: 'e11', target: 'e13', relation: '用于' },
      { source: 'e11', target: 'e14', relation: '用于' },
      { source: 'e15', target: 'e17', relation: '增强' },
      { source: 'e15', target: 'e16', relation: '解决' },
      { source: 'e17', target: 'e16', relation: '存在问题' },
      { source: 'e17', target: 'e11', relation: '同义词' },
      { source: 'e18', target: 'e19', relation: '功能' },
      { source: 'e18', target: 'e20', relation: '功能' },
      { source: 'e18', target: 'e21', relation: '功能' },
      { source: 'e18', target: 'e1', relation: '子领域' },
      { source: 'e22', target: 'e23', relation: '特征' },
      { source: 'e22', target: 'e24', relation: '用于' },
      { source: 'e22', target: 'e1', relation: '子领域' },
      { source: 'e1', target: 'e25', relation: '展望' },
      { source: 'e25', target: 'e26', relation: '结果' },
    ],
  },
  ko: {
    entities: DEMO_ENTITIES.map((e) => ({ id: e.id, label: e.label, type: e.type })),
    relations: DEMO_RELATIONS.map((r) => ({ source: r.source, target: r.target, relation: r.relation })),
  },
};

// ============================================
// 처리 상태 시퀀스
// ============================================

/**
 * 각 STT 처리 시 보여줄 상태 전환 시퀀스
 */
export const PROCESSING_STAGE_SEQUENCE: ProcessingStage[] = [
  'RECEIVING',
  'STT_PROCESSING',
  'NLP_ANALYZING',
  'EXTRACTING',
  'UPDATING_GRAPH',
  'IDLE',
];

// ============================================
// 타이밍 설정
// ============================================

export const DEMO_TIMING = {
  /** 각 STT 엔트리 간 간격 (ms) */
  STT_INTERVAL: 6000,
  /** 부분 텍스트 간 간격 (ms) */
  PARTIAL_INTERVAL: 400,
  /** 처리 상태 전환 간 간격 (ms) */
  STAGE_TRANSITION: 300,
  /** 번역 시뮬레이션 시간 (ms) */
  TRANSLATE_DURATION: 2000,
};
