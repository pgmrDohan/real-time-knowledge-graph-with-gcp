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
 * 데모 STT 시나리오 - 플로우마인드 발표
 */
export const DEMO_STT_ENTRIES: DemoSTTEntry[] = [
  {
    text: '안녕하세요, 2팀 Trigger했더니 Unhealthy이었던 건에 대하여 팀의 권도한입니다. 저희는 플로우마인드라는 데스크톱 앱을 개발하였습니다.',
    partialTexts: [
      '안녕하세요',
      '안녕하세요, 2팀',
      '안녕하세요, 2팀 Trigger했더니 Unhealthy이었던 건에 대하여',
      '안녕하세요, 2팀 Trigger했더니 Unhealthy이었던 건에 대하여 팀의 권도한입니다',
    ],
    graphDeltaIndex: 0,
  },
  {
    text: '발표 시작하기 전에 저희 팀명에 대한 유례부터 설명을 드려보자면 Google Cloud 앱들 중에 Cloud Build를 통해 CI CD 파이프라인을 구축을 해뒀는데 Trigger해서 자동 빌드를 다 했더니 오류가 나더라.. 하는 슬픈 전설이 담긴 팀명입니다.',
    partialTexts: [
      '발표 시작하기 전에',
      '발표 시작하기 전에 저희 팀명에 대한 유례부터',
      '발표 시작하기 전에 저희 팀명에 대한 유례부터 설명을 드려보자면 Google Cloud 앱들 중에',
      '발표 시작하기 전에 저희 팀명에 대한 유례부터 설명을 드려보자면 Google Cloud 앱들 중에 Cloud Build를 통해 CI CD 파이프라인을',
    ],
    graphDeltaIndex: 1,
  },
  {
    text: '우리의 회의는 안녕하십니까? 저희는 오늘 이 아젠다를 시작으로 발표를 이어가 보려고 합니다.',
    partialTexts: [
      '우리의 회의는',
      '우리의 회의는 안녕하십니까?',
      '우리의 회의는 안녕하십니까? 저희는 오늘',
      '우리의 회의는 안녕하십니까? 저희는 오늘 이 아젠다를 시작으로',
    ],
    graphDeltaIndex: 2,
  },
  {
    text: '잡코리아와 인크루트의 조사에 따르면 저희는요. 일주일에 2.2회 회의를 진행한다고 합니다.',
    partialTexts: [
      '잡코리아와 인크루트의',
      '잡코리아와 인크루트의 조사에 따르면',
      '잡코리아와 인크루트의 조사에 따르면 저희는요. 일주일에',
      '잡코리아와 인크루트의 조사에 따르면 저희는요. 일주일에 2.2회 회의를',
    ],
    graphDeltaIndex: 3,
  },
  {
    text: '그리고 회의가 시간낭비라고 생각하는 사람이 직장인의 73.4%나 된다고 합니다. 무려 10명중 7명이 넘는 직장인이 이에 해당하죠.',
    partialTexts: [
      '그리고 회의가',
      '그리고 회의가 시간낭비라고 생각하는 사람이',
      '그리고 회의가 시간낭비라고 생각하는 사람이 직장인의 73.4%나',
      '그리고 회의가 시간낭비라고 생각하는 사람이 직장인의 73.4%나 된다고 합니다. 무려 10명중 7명이',
    ],
    graphDeltaIndex: 4,
  },
  {
    text: '그리고 회의 중 딴짓을 한 경험이 있다고 응답한 직장인이 56%나 된다고 합니다.',
    partialTexts: [
      '그리고 회의 중',
      '그리고 회의 중 딴짓을 한 경험이',
      '그리고 회의 중 딴짓을 한 경험이 있다고 응답한',
      '그리고 회의 중 딴짓을 한 경험이 있다고 응답한 직장인이 56%나',
    ],
    graphDeltaIndex: 5,
  },
  {
    text: '우리 옛말에 시간은 금이다라는 이야기가 있습니다. 그러나, 저희의 시간은 어떠한가요? 언스트엔영 한영의 조사에 따르면 하루 업무시간의 약 29.4%. 시간으로 환산하면 2시간 반.',
    partialTexts: [
      '우리 옛말에',
      '우리 옛말에 시간은 금이다라는 이야기가 있습니다',
      '우리 옛말에 시간은 금이다라는 이야기가 있습니다. 그러나, 저희의 시간은 어떠한가요?',
      '우리 옛말에 시간은 금이다라는 이야기가 있습니다. 그러나, 저희의 시간은 어떠한가요? 언스트엔영 한영의 조사에 따르면',
    ],
    graphDeltaIndex: 6,
  },
  {
    text: '시간을 경제적 가치로 보면 무려 연간 146조원의 시간 동안 불필요한 회의나 반복된 업무 그리고 상사의 지시 대기 등에 사용된다고 합니다.',
    partialTexts: [
      '시간을 경제적 가치로 보면',
      '시간을 경제적 가치로 보면 무려 연간 146조원의',
      '시간을 경제적 가치로 보면 무려 연간 146조원의 시간 동안 불필요한 회의나',
      '시간을 경제적 가치로 보면 무려 연간 146조원의 시간 동안 불필요한 회의나 반복된 업무 그리고',
    ],
    graphDeltaIndex: 7,
  },
  {
    text: '그 이유가 무엇일까요? 직장인들은 남는 것이 없어서라는 응답을 1위로 뽑았습니다.',
    partialTexts: [
      '그 이유가',
      '그 이유가 무엇일까요?',
      '그 이유가 무엇일까요? 직장인들은',
      '그 이유가 무엇일까요? 직장인들은 남는 것이 없어서라는',
    ],
    graphDeltaIndex: 8,
  },
  {
    text: '그래서 우리는? 이를 어떻게 해결할 수 있을까에 대해 고민을 했구요. 회의결과를 보다 의미있게 하면 어떨까 했습니다. 연결로 말이죠.',
    partialTexts: [
      '그래서 우리는?',
      '그래서 우리는? 이를 어떻게 해결할 수 있을까에 대해',
      '그래서 우리는? 이를 어떻게 해결할 수 있을까에 대해 고민을 했구요. 회의결과를',
      '그래서 우리는? 이를 어떻게 해결할 수 있을까에 대해 고민을 했구요. 회의결과를 보다 의미있게 하면',
    ],
    graphDeltaIndex: 9,
  },
  {
    text: '자 저희가 개발한 앱인데요. 단순한 요약이 아니라, 지식으로, 그래프로 정리해줍니다. 소개합니다. 플로우 마인드.',
    partialTexts: [
      '자 저희가 개발한 앱인데요',
      '자 저희가 개발한 앱인데요. 단순한 요약이 아니라',
      '자 저희가 개발한 앱인데요. 단순한 요약이 아니라, 지식으로, 그래프로',
      '자 저희가 개발한 앱인데요. 단순한 요약이 아니라, 지식으로, 그래프로 정리해줍니다. 소개합니다',
    ],
    graphDeltaIndex: 10,
  },
  {
    text: '플로우마인드는요. 시스템 오디오 캡처, 대사집 자동 작성, 아까 본 그래프를 만들기 위한 노드와 관계 추출, AI 기반 번역과 내보내기 기능을 가지고 있습니다.',
    partialTexts: [
      '플로우마인드는요',
      '플로우마인드는요. 시스템 오디오 캡처',
      '플로우마인드는요. 시스템 오디오 캡처, 대사집 자동 작성, 아까 본 그래프를',
      '플로우마인드는요. 시스템 오디오 캡처, 대사집 자동 작성, 아까 본 그래프를 만들기 위한 노드와 관계 추출',
    ],
    graphDeltaIndex: 11,
  },
  {
    text: '여기서 시스템 오디오를 캡처할 수 있다는건 무한한 확장성을 지니고 있다고도 할 수 있는데요. 앞서 배경으로 언급한 회의 상황 뿐 아니라 개인적인 강의나 유튜브 영상도 그래프의 형태로 저장할 수 있게 되는거죠.',
    partialTexts: [
      '여기서 시스템 오디오를 캡처할 수 있다는건',
      '여기서 시스템 오디오를 캡처할 수 있다는건 무한한 확장성을 지니고',
      '여기서 시스템 오디오를 캡처할 수 있다는건 무한한 확장성을 지니고 있다고도 할 수 있는데요. 앞서 배경으로',
      '여기서 시스템 오디오를 캡처할 수 있다는건 무한한 확장성을 지니고 있다고도 할 수 있는데요. 앞서 배경으로 언급한 회의 상황 뿐 아니라',
    ],
    graphDeltaIndex: 12,
  },
  {
    text: 'UI는 이렇게 구성되어 있구요. 피드백 기반 AI 개선 기능 까지 가지고 있는데요. 추가 의견 란에 적은 내용을 기반으로 다음 그래프 추출 시 더 나은 응답을 얻어내는데에 사용됩니다.',
    partialTexts: [
      'UI는 이렇게 구성되어 있구요',
      'UI는 이렇게 구성되어 있구요. 피드백 기반 AI 개선 기능',
      'UI는 이렇게 구성되어 있구요. 피드백 기반 AI 개선 기능 까지 가지고 있는데요. 추가 의견 란에',
      'UI는 이렇게 구성되어 있구요. 피드백 기반 AI 개선 기능 까지 가지고 있는데요. 추가 의견 란에 적은 내용을 기반으로',
    ],
    graphDeltaIndex: 13,
  },
  {
    text: '7개의 언어 간 번역 기능 또한 가지고 있구요. PNG, PDF, Mermaid 까지 다양한 형식으로 내보내는 기능도 갖추고 있습니다.',
    partialTexts: [
      '7개의 언어 간',
      '7개의 언어 간 번역 기능 또한 가지고 있구요',
      '7개의 언어 간 번역 기능 또한 가지고 있구요. PNG, PDF',
      '7개의 언어 간 번역 기능 또한 가지고 있구요. PNG, PDF, Mermaid 까지',
    ],
    graphDeltaIndex: 14,
  },
  {
    text: '다음은 기술적 성과 인데요. 과정명이 Google Cloud 기반 인공지능 전문가 양성과정인 만큼 Google Cloud 활용을 우선순위로 잡고 프로젝트를 진행해왔습니다.',
    partialTexts: [
      '다음은 기술적 성과 인데요',
      '다음은 기술적 성과 인데요. 과정명이 Google Cloud',
      '다음은 기술적 성과 인데요. 과정명이 Google Cloud 기반 인공지능 전문가 양성과정인 만큼',
      '다음은 기술적 성과 인데요. 과정명이 Google Cloud 기반 인공지능 전문가 양성과정인 만큼 Google Cloud 활용을',
    ],
    graphDeltaIndex: 15,
  },
  {
    text: '지금 보이시는 아키텍쳐가 이 프로젝트에 사용된 클라우드 아키텍쳐 인데요. 자세히 보면.',
    partialTexts: [
      '지금 보이시는',
      '지금 보이시는 아키텍쳐가',
      '지금 보이시는 아키텍쳐가 이 프로젝트에 사용된',
      '지금 보이시는 아키텍쳐가 이 프로젝트에 사용된 클라우드 아키텍쳐 인데요',
    ],
    graphDeltaIndex: 16,
  },
  {
    text: 'Cloud Run을 통해 서버를 동작시키고 VPC Connector를 통한 보안성을 챙긴 Memorystore그러니까 Redis에 대한 접근 뿐 아니라 Cloud Storage에 음성 데이터를 저장하고, 피드백은 BigQuery에 저장하는 다소 복잡할 수 있지만 각 앱들의 특징에 적합한 역할을 배정해서 아키텍처를 구성하였습니다.',
    partialTexts: [
      'Cloud Run을 통해 서버를 동작시키고',
      'Cloud Run을 통해 서버를 동작시키고 VPC Connector를 통한 보안성을',
      'Cloud Run을 통해 서버를 동작시키고 VPC Connector를 통한 보안성을 챙긴 Memorystore그러니까 Redis에 대한',
      'Cloud Run을 통해 서버를 동작시키고 VPC Connector를 통한 보안성을 챙긴 Memorystore그러니까 Redis에 대한 접근 뿐 아니라 Cloud Storage에',
    ],
    graphDeltaIndex: 17,
  },
  {
    text: '음성인식은 Cloud Speech to Text를 사용하고 그래프 추출은 Vertex AI를 사용하게됩니다.',
    partialTexts: [
      '음성인식은',
      '음성인식은 Cloud Speech to Text를',
      '음성인식은 Cloud Speech to Text를 사용하고',
      '음성인식은 Cloud Speech to Text를 사용하고 그래프 추출은 Vertex AI를',
    ],
    graphDeltaIndex: 18,
  },
  {
    text: '그리고 이러한 전체 아키텍처는 Terraform을 통해 코드로 기술되어 있는데요. 때문에 향후 B2B의 형태로 수익화하였을 때 동일한 아키텍처를 구성하는데에 드는 시간이 매우 절약됩니다.',
    partialTexts: [
      '그리고 이러한 전체 아키텍처는',
      '그리고 이러한 전체 아키텍처는 Terraform을 통해 코드로',
      '그리고 이러한 전체 아키텍처는 Terraform을 통해 코드로 기술되어 있는데요. 때문에 향후',
      '그리고 이러한 전체 아키텍처는 Terraform을 통해 코드로 기술되어 있는데요. 때문에 향후 B2B의 형태로',
    ],
    graphDeltaIndex: 19,
  },
  {
    text: '아까 Memorystore 즉 Redis를 사용하였다고 말씀 드렸는데요. 오디오 청크는 계속해서 서버로 넘어가는데에 반에 음성인식과 그래프 추출은 다소 서버에서 처리되는데에 시간이 걸리는 작업이기에 거기서 생기는 병목현상을 없에는데에 사용하였습니다.',
    partialTexts: [
      '아까 Memorystore 즉 Redis를',
      '아까 Memorystore 즉 Redis를 사용하였다고 말씀 드렸는데요',
      '아까 Memorystore 즉 Redis를 사용하였다고 말씀 드렸는데요. 오디오 청크는 계속해서',
      '아까 Memorystore 즉 Redis를 사용하였다고 말씀 드렸는데요. 오디오 청크는 계속해서 서버로 넘어가는데에 반에 음성인식과',
    ],
    graphDeltaIndex: 20,
  },
  {
    text: '그래서 실시간 오디오 청크의 순서보장이나 음성인식 결과의 버퍼링 및 그래프 추출 작업의 큐잉 역할도 담당하고 있습니다.',
    partialTexts: [
      '그래서 실시간',
      '그래서 실시간 오디오 청크의 순서보장이나',
      '그래서 실시간 오디오 청크의 순서보장이나 음성인식 결과의 버퍼링 및',
      '그래서 실시간 오디오 청크의 순서보장이나 음성인식 결과의 버퍼링 및 그래프 추출 작업의',
    ],
    graphDeltaIndex: 21,
  },
  {
    text: '이건 그래프 추출에 사용된 프롬프트인데요. 규칙이나 노드 타입 들을 정확히 기술해 두었고. 예시를 추가하야 Few-shot 러닝의 효과를 주었습니다.',
    partialTexts: [
      '이건 그래프 추출에',
      '이건 그래프 추출에 사용된 프롬프트인데요',
      '이건 그래프 추출에 사용된 프롬프트인데요. 규칙이나 노드 타입 들을',
      '이건 그래프 추출에 사용된 프롬프트인데요. 규칙이나 노드 타입 들을 정확히 기술해 두었고. 예시를',
    ],
    graphDeltaIndex: 22,
  },
  {
    text: '이건 피드백을 반영하기 위한 Prompt이고 피드백의 내용을 요약하여 제공해줍니다. 이는 다시 그래프 추출 프롬프트와 합쳐져서 피드백 반영 효과를 이루게 됩니다.',
    partialTexts: [
      '이건 피드백을 반영하기 위한',
      '이건 피드백을 반영하기 위한 Prompt이고',
      '이건 피드백을 반영하기 위한 Prompt이고 피드백의 내용을 요약하여',
      '이건 피드백을 반영하기 위한 Prompt이고 피드백의 내용을 요약하여 제공해줍니다. 이는 다시',
    ],
    graphDeltaIndex: 23,
  },
  {
    text: '다음은 번역에 사용되는 Prompt 입니다.',
    partialTexts: [
      '다음은',
      '다음은 번역에',
      '다음은 번역에 사용되는',
      '다음은 번역에 사용되는 Prompt 입니다',
    ],
    graphDeltaIndex: 24,
  },
  {
    text: '마지막으로 시장조사 인데요. B2B SaaS와 에듀테크 시장을 중점으로 가져와봤습니다. 먼저 B2B SaaS 시장인데요. 회사를 타킷으로 서비스형 소프트웨어의 형태로 수익을 챙기는 이 시장은요.',
    partialTexts: [
      '마지막으로 시장조사 인데요',
      '마지막으로 시장조사 인데요. B2B SaaS와 에듀테크 시장을',
      '마지막으로 시장조사 인데요. B2B SaaS와 에듀테크 시장을 중점으로 가져와봤습니다. 먼저',
      '마지막으로 시장조사 인데요. B2B SaaS와 에듀테크 시장을 중점으로 가져와봤습니다. 먼저 B2B SaaS 시장인데요',
    ],
    graphDeltaIndex: 25,
  },
  {
    text: '한국아이디씨의 조사에 따르면 올해 3조 614억원의 전체 시장을 가지고 있습니다. 전체 시장의 규모가 2021년 1조 대에 비해서 계속해서 꾸준히 성장하고 있어 시장의 분의기는 성장세입니다.',
    partialTexts: [
      '한국아이디씨의 조사에 따르면',
      '한국아이디씨의 조사에 따르면 올해 3조 614억원의',
      '한국아이디씨의 조사에 따르면 올해 3조 614억원의 전체 시장을 가지고 있습니다. 전체 시장의 규모가',
      '한국아이디씨의 조사에 따르면 올해 3조 614억원의 전체 시장을 가지고 있습니다. 전체 시장의 규모가 2021년 1조 대에 비해서',
    ],
    graphDeltaIndex: 26,
  },
  {
    text: '이중 협업 툴이나 AI 솔루션이 차지하는 비중을 10% 내외로 추산하여보면 유휴시장의 규모는 약 4000억원 정도 입니다. 이중 유사 기업의 실적을 고려해보았을 때 수익 시장의 규모는 약 170억 정도로 예측됩니다.',
    partialTexts: [
      '이중 협업 툴이나',
      '이중 협업 툴이나 AI 솔루션이 차지하는 비중을',
      '이중 협업 툴이나 AI 솔루션이 차지하는 비중을 10% 내외로 추산하여보면 유휴시장의 규모는',
      '이중 협업 툴이나 AI 솔루션이 차지하는 비중을 10% 내외로 추산하여보면 유휴시장의 규모는 약 4000억원 정도 입니다. 이중',
    ],
    graphDeltaIndex: 27,
  },
  {
    text: '다음은 에듀테크 시장인데요. 교육부의 보고서에 따르면 2020년 6조 대에 비해 올해 10조 8319억원의 전체시장 규모를 지니고 있어 계속 성장 추세에 있는 시장입니다.',
    partialTexts: [
      '다음은 에듀테크 시장인데요',
      '다음은 에듀테크 시장인데요. 교육부의 보고서에 따르면',
      '다음은 에듀테크 시장인데요. 교육부의 보고서에 따르면 2020년 6조 대에 비해 올해',
      '다음은 에듀테크 시장인데요. 교육부의 보고서에 따르면 2020년 6조 대에 비해 올해 10조 8319억원의',
    ],
    graphDeltaIndex: 28,
  },
  {
    text: '전체 시장의 대부분이 초중등에 맞춰져 있어 우리 서비스의 강점인 지식 그래프 추출의 니즈를 가진 고등이나 성인 대상 교육용 소프트웨어 시장의 규모는 전체 시장의 약 6% 내외로 추산되어 유휴시장의 규모는 약 6500억원 대입니다.',
    partialTexts: [
      '전체 시장의 대부분이',
      '전체 시장의 대부분이 초중등에 맞춰져 있어',
      '전체 시장의 대부분이 초중등에 맞춰져 있어 우리 서비스의 강점인 지식 그래프 추출의 니즈를 가진',
      '전체 시장의 대부분이 초중등에 맞춰져 있어 우리 서비스의 강점인 지식 그래프 추출의 니즈를 가진 고등이나 성인 대상',
    ],
    graphDeltaIndex: 29,
  },
  {
    text: '마지막으로 유휴시장의 1%인 65억원을 수익 시장의 규모를 산정하고 목표치로 둘수 있다고 생각합니다.',
    partialTexts: [
      '마지막으로',
      '마지막으로 유휴시장의 1%인',
      '마지막으로 유휴시장의 1%인 65억원을 수익 시장의',
      '마지막으로 유휴시장의 1%인 65억원을 수익 시장의 규모를 산정하고',
    ],
    graphDeltaIndex: 30,
  },
  {
    text: '이상입니다. 발표 중에 게속해서 저희 앱을 틀어두었는데 그 부분 먼저 보여드리겠습니다.',
    partialTexts: [
      '이상입니다',
      '이상입니다. 발표 중에',
      '이상입니다. 발표 중에 게속해서 저희 앱을',
      '이상입니다. 발표 중에 게속해서 저희 앱을 틀어두었는데',
    ],
    graphDeltaIndex: 31,
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
  // Delta 0 - 팀 소개
  { id: 'e1', label: '2팀', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e2', label: '플로우마인드', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e3', label: '권도한', type: 'PERSON', createdAt: now, updatedAt: now },

  // Delta 1 - 팀명 유래
  { id: 'e4', label: 'Google Cloud', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e5', label: 'Cloud Build', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e6', label: 'CI/CD 파이프라인', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 2 - 아젠다
  { id: 'e7', label: '회의', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 3 - 회의 빈도
  { id: 'e8', label: '잡코리아', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e9', label: '인크루트', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e10', label: '주 2.2회', type: 'METRIC', createdAt: now, updatedAt: now },

  // Delta 4 - 시간낭비 인식
  { id: 'e11', label: '시간낭비', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e12', label: '73.4%', type: 'METRIC', createdAt: now, updatedAt: now },
  { id: 'e13', label: '직장인', type: 'PERSON', createdAt: now, updatedAt: now },

  // Delta 5 - 딴짓 통계
  { id: 'e14', label: '딴짓 경험', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e15', label: '56%', type: 'METRIC', createdAt: now, updatedAt: now },

  // Delta 6 - 시간 가치
  { id: 'e16', label: '언스트엔영 한영', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e17', label: '29.4%', type: 'METRIC', createdAt: now, updatedAt: now },
  { id: 'e18', label: '2시간 반', type: 'METRIC', createdAt: now, updatedAt: now },

  // Delta 7 - 경제적 손실
  { id: 'e19', label: '146조원', type: 'METRIC', createdAt: now, updatedAt: now },
  { id: 'e20', label: '불필요한 회의', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e21', label: '반복 업무', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 8 - 문제 원인
  { id: 'e22', label: '남는 것이 없음', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 9 - 해결책
  { id: 'e23', label: '회의 결과', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e24', label: '연결', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 10 - 플로우마인드 소개
  { id: 'e25', label: '지식 그래프', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },

  // Delta 11 - 핵심 기능
  { id: 'e26', label: '시스템 오디오 캡처', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e27', label: '대사집 자동 작성', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e28', label: '노드/관계 추출', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e29', label: 'AI 기반 번역', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e30', label: '내보내기', type: 'ACTION', createdAt: now, updatedAt: now },

  // Delta 12 - 확장성
  { id: 'e31', label: '확장성', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e32', label: '강의', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e33', label: '유튜브 영상', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 13 - 피드백 기능
  { id: 'e34', label: '피드백 기반 AI 개선', type: 'ACTION', createdAt: now, updatedAt: now },

  // Delta 14 - 번역 및 내보내기
  { id: 'e35', label: '7개 언어', type: 'METRIC', createdAt: now, updatedAt: now },
  { id: 'e36', label: 'PNG', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e37', label: 'PDF', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e38', label: 'Mermaid', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },

  // Delta 15 - 기술적 성과
  { id: 'e39', label: 'Google Cloud 기반 인공지능 전문가 양성과정', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 16 - 아키텍처
  { id: 'e40', label: '클라우드 아키텍처', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 17 - 클라우드 서비스
  { id: 'e41', label: 'Cloud Run', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e42', label: 'VPC Connector', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e43', label: 'Memorystore', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e44', label: 'Redis', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e45', label: 'Cloud Storage', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e46', label: 'BigQuery', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },

  // Delta 18 - AI 서비스
  { id: 'e47', label: 'Cloud Speech to Text', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e48', label: 'Vertex AI', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e49', label: '음성인식', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e50', label: '그래프 추출', type: 'ACTION', createdAt: now, updatedAt: now },

  // Delta 19 - Terraform
  { id: 'e51', label: 'Terraform', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e52', label: 'B2B', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e53', label: '수익화', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 20 - Redis 역할
  { id: 'e54', label: '오디오 청크', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e55', label: '병목현상', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 21 - Redis 기능
  { id: 'e56', label: '순서보장', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e57', label: '버퍼링', type: 'ACTION', createdAt: now, updatedAt: now },
  { id: 'e58', label: '큐잉', type: 'ACTION', createdAt: now, updatedAt: now },

  // Delta 22 - 그래프 추출 프롬프트
  { id: 'e59', label: '그래프 추출 프롬프트', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e60', label: '노드 타입', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e61', label: 'Few-shot 러닝', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 23 - 피드백 프롬프트
  { id: 'e62', label: '피드백 프롬프트', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },
  { id: 'e63', label: '피드백 반영', type: 'ACTION', createdAt: now, updatedAt: now },

  // Delta 24 - 번역 프롬프트
  { id: 'e64', label: '번역 프롬프트', type: 'TECHNOLOGY', createdAt: now, updatedAt: now },

  // Delta 25 - 시장조사
  { id: 'e65', label: '시장조사', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e66', label: 'B2B SaaS', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e67', label: '에듀테크', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 26 - B2B SaaS 시장 규모
  { id: 'e68', label: '한국아이디씨', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e69', label: '3조 614억원', type: 'METRIC', createdAt: now, updatedAt: now },
  { id: 'e70', label: '2021년', type: 'DATE', createdAt: now, updatedAt: now },

  // Delta 27 - B2B SaaS 세부
  { id: 'e71', label: '협업 툴', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e72', label: 'AI 솔루션', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e73', label: '4000억원', type: 'METRIC', createdAt: now, updatedAt: now },
  { id: 'e74', label: '170억원', type: 'METRIC', createdAt: now, updatedAt: now },

  // Delta 28 - 에듀테크 시장
  { id: 'e75', label: '교육부', type: 'ORGANIZATION', createdAt: now, updatedAt: now },
  { id: 'e76', label: '10조 8319억원', type: 'METRIC', createdAt: now, updatedAt: now },
  { id: 'e77', label: '2020년', type: 'DATE', createdAt: now, updatedAt: now },

  // Delta 29 - 에듀테크 세부
  { id: 'e78', label: '고등/성인 교육', type: 'CONCEPT', createdAt: now, updatedAt: now },
  { id: 'e79', label: '6500억원', type: 'METRIC', createdAt: now, updatedAt: now },

  // Delta 30 - 목표
  { id: 'e80', label: '65억원', type: 'METRIC', createdAt: now, updatedAt: now },
  { id: 'e81', label: '수익 목표', type: 'CONCEPT', createdAt: now, updatedAt: now },

  // Delta 31 - 마무리
  { id: 'e82', label: '앱 시연', type: 'ACTION', createdAt: now, updatedAt: now },
];

/**
 * 데모용 관계 데이터
 */
const DEMO_RELATIONS: GraphRelation[] = [
  // Delta 0
  { id: 'r1', source: 'e1', target: 'e2', relation: '개발', createdAt: now },
  { id: 'r2', source: 'e3', target: 'e1', relation: '소속', createdAt: now },

  // Delta 1
  { id: 'r3', source: 'e5', target: 'e4', relation: '속함', createdAt: now },
  { id: 'r4', source: 'e5', target: 'e6', relation: '구축', createdAt: now },

  // Delta 2
  // (no new relations)

  // Delta 3
  { id: 'r5', source: 'e8', target: 'e10', relation: '조사 결과', createdAt: now },
  { id: 'r6', source: 'e9', target: 'e10', relation: '조사 결과', createdAt: now },
  { id: 'r7', source: 'e10', target: 'e7', relation: '빈도', createdAt: now },

  // Delta 4
  { id: 'r8', source: 'e13', target: 'e11', relation: '인식', createdAt: now },
  { id: 'r9', source: 'e12', target: 'e11', relation: '비율', createdAt: now },
  { id: 'r10', source: 'e7', target: 'e11', relation: '문제점', createdAt: now },

  // Delta 5
  { id: 'r11', source: 'e15', target: 'e14', relation: '비율', createdAt: now },
  { id: 'r12', source: 'e13', target: 'e14', relation: '경험', createdAt: now },

  // Delta 6
  { id: 'r13', source: 'e16', target: 'e17', relation: '조사 결과', createdAt: now },
  { id: 'r14', source: 'e17', target: 'e18', relation: '환산', createdAt: now },

  // Delta 7
  { id: 'r15', source: 'e19', target: 'e20', relation: '손실', createdAt: now },
  { id: 'r16', source: 'e19', target: 'e21', relation: '손실', createdAt: now },
  { id: 'r17', source: 'e20', target: 'e7', relation: '유형', createdAt: now },

  // Delta 8
  { id: 'r18', source: 'e22', target: 'e11', relation: '원인', createdAt: now },

  // Delta 9
  { id: 'r19', source: 'e23', target: 'e24', relation: '해결책', createdAt: now },

  // Delta 10
  { id: 'r20', source: 'e2', target: 'e25', relation: '핵심 기술', createdAt: now },
  { id: 'r21', source: 'e25', target: 'e23', relation: '정리', createdAt: now },

  // Delta 11
  { id: 'r22', source: 'e2', target: 'e26', relation: '기능', createdAt: now },
  { id: 'r23', source: 'e2', target: 'e27', relation: '기능', createdAt: now },
  { id: 'r24', source: 'e2', target: 'e28', relation: '기능', createdAt: now },
  { id: 'r25', source: 'e2', target: 'e29', relation: '기능', createdAt: now },
  { id: 'r26', source: 'e2', target: 'e30', relation: '기능', createdAt: now },

  // Delta 12
  { id: 'r27', source: 'e26', target: 'e31', relation: '장점', createdAt: now },
  { id: 'r28', source: 'e31', target: 'e32', relation: '활용', createdAt: now },
  { id: 'r29', source: 'e31', target: 'e33', relation: '활용', createdAt: now },
  { id: 'r30', source: 'e31', target: 'e7', relation: '활용', createdAt: now },

  // Delta 13
  { id: 'r31', source: 'e2', target: 'e34', relation: '기능', createdAt: now },

  // Delta 14
  { id: 'r32', source: 'e29', target: 'e35', relation: '지원', createdAt: now },
  { id: 'r33', source: 'e30', target: 'e36', relation: '형식', createdAt: now },
  { id: 'r34', source: 'e30', target: 'e37', relation: '형식', createdAt: now },
  { id: 'r35', source: 'e30', target: 'e38', relation: '형식', createdAt: now },

  // Delta 15
  { id: 'r36', source: 'e2', target: 'e4', relation: '활용', createdAt: now },
  { id: 'r37', source: 'e39', target: 'e4', relation: '기반', createdAt: now },

  // Delta 16
  { id: 'r38', source: 'e2', target: 'e40', relation: '사용', createdAt: now },

  // Delta 17
  { id: 'r39', source: 'e40', target: 'e41', relation: '구성', createdAt: now },
  { id: 'r40', source: 'e40', target: 'e42', relation: '구성', createdAt: now },
  { id: 'r41', source: 'e40', target: 'e43', relation: '구성', createdAt: now },
  { id: 'r42', source: 'e43', target: 'e44', relation: '동일', createdAt: now },
  { id: 'r43', source: 'e40', target: 'e45', relation: '구성', createdAt: now },
  { id: 'r44', source: 'e40', target: 'e46', relation: '구성', createdAt: now },
  { id: 'r45', source: 'e42', target: 'e43', relation: '보안 연결', createdAt: now },

  // Delta 18
  { id: 'r46', source: 'e47', target: 'e49', relation: '담당', createdAt: now },
  { id: 'r47', source: 'e48', target: 'e50', relation: '담당', createdAt: now },
  { id: 'r48', source: 'e47', target: 'e4', relation: '속함', createdAt: now },
  { id: 'r49', source: 'e48', target: 'e4', relation: '속함', createdAt: now },

  // Delta 19
  { id: 'r50', source: 'e51', target: 'e40', relation: '기술', createdAt: now },
  { id: 'r51', source: 'e52', target: 'e53', relation: '목표', createdAt: now },
  { id: 'r52', source: 'e51', target: 'e52', relation: '지원', createdAt: now },

  // Delta 20
  { id: 'r53', source: 'e44', target: 'e55', relation: '해결', createdAt: now },
  { id: 'r54', source: 'e54', target: 'e55', relation: '원인', createdAt: now },

  // Delta 21
  { id: 'r55', source: 'e44', target: 'e56', relation: '역할', createdAt: now },
  { id: 'r56', source: 'e44', target: 'e57', relation: '역할', createdAt: now },
  { id: 'r57', source: 'e44', target: 'e58', relation: '역할', createdAt: now },

  // Delta 22
  { id: 'r58', source: 'e59', target: 'e60', relation: '정의', createdAt: now },
  { id: 'r59', source: 'e59', target: 'e61', relation: '적용', createdAt: now },
  { id: 'r60', source: 'e59', target: 'e50', relation: '사용', createdAt: now },

  // Delta 23
  { id: 'r61', source: 'e62', target: 'e63', relation: '역할', createdAt: now },
  { id: 'r62', source: 'e62', target: 'e59', relation: '결합', createdAt: now },

  // Delta 24
  { id: 'r63', source: 'e64', target: 'e29', relation: '사용', createdAt: now },

  // Delta 25
  { id: 'r64', source: 'e65', target: 'e66', relation: '대상', createdAt: now },
  { id: 'r65', source: 'e65', target: 'e67', relation: '대상', createdAt: now },

  // Delta 26
  { id: 'r66', source: 'e68', target: 'e69', relation: '조사 결과', createdAt: now },
  { id: 'r67', source: 'e69', target: 'e66', relation: '시장 규모', createdAt: now },
  { id: 'r68', source: 'e66', target: 'e70', relation: '성장 기준', createdAt: now },

  // Delta 27
  { id: 'r69', source: 'e66', target: 'e71', relation: '포함', createdAt: now },
  { id: 'r70', source: 'e66', target: 'e72', relation: '포함', createdAt: now },
  { id: 'r71', source: 'e73', target: 'e66', relation: '유휴시장', createdAt: now },
  { id: 'r72', source: 'e74', target: 'e66', relation: '수익시장', createdAt: now },

  // Delta 28
  { id: 'r73', source: 'e75', target: 'e76', relation: '보고', createdAt: now },
  { id: 'r74', source: 'e76', target: 'e67', relation: '시장 규모', createdAt: now },
  { id: 'r75', source: 'e67', target: 'e77', relation: '성장 기준', createdAt: now },

  // Delta 29
  { id: 'r76', source: 'e67', target: 'e78', relation: '타겟', createdAt: now },
  { id: 'r77', source: 'e79', target: 'e67', relation: '유휴시장', createdAt: now },
  { id: 'r78', source: 'e25', target: 'e78', relation: '니즈', createdAt: now },

  // Delta 30
  { id: 'r79', source: 'e80', target: 'e81', relation: '목표치', createdAt: now },
  { id: 'r80', source: 'e2', target: 'e81', relation: '목표', createdAt: now },

  // Delta 31
  { id: 'r81', source: 'e82', target: 'e2', relation: '대상', createdAt: now },
];

/**
 * 그래프 델타 시퀀스 - 각 STT 후 적용될 변경사항
 */
export const DEMO_GRAPH_DELTAS: GraphDelta[] = [
  // Delta 0 - 팀 소개
  {
    addedEntities: DEMO_ENTITIES.slice(0, 3),
    addedRelations: DEMO_RELATIONS.slice(0, 2),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 0,
    toVersion: 1,
  },
  // Delta 1 - 팀명 유래
  {
    addedEntities: DEMO_ENTITIES.slice(3, 6),
    addedRelations: DEMO_RELATIONS.slice(2, 4),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 1,
    toVersion: 2,
  },
  // Delta 2 - 아젠다
  {
    addedEntities: DEMO_ENTITIES.slice(6, 7),
    addedRelations: [],
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 2,
    toVersion: 3,
  },
  // Delta 3 - 회의 빈도
  {
    addedEntities: DEMO_ENTITIES.slice(7, 10),
    addedRelations: DEMO_RELATIONS.slice(4, 7),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 3,
    toVersion: 4,
  },
  // Delta 4 - 시간낭비 인식
  {
    addedEntities: DEMO_ENTITIES.slice(10, 13),
    addedRelations: DEMO_RELATIONS.slice(7, 10),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 4,
    toVersion: 5,
  },
  // Delta 5 - 딴짓 통계
  {
    addedEntities: DEMO_ENTITIES.slice(13, 15),
    addedRelations: DEMO_RELATIONS.slice(10, 12),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 5,
    toVersion: 6,
  },
  // Delta 6 - 시간 가치
  {
    addedEntities: DEMO_ENTITIES.slice(15, 18),
    addedRelations: DEMO_RELATIONS.slice(12, 14),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 6,
    toVersion: 7,
  },
  // Delta 7 - 경제적 손실
  {
    addedEntities: DEMO_ENTITIES.slice(18, 21),
    addedRelations: DEMO_RELATIONS.slice(14, 17),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 7,
    toVersion: 8,
  },
  // Delta 8 - 문제 원인
  {
    addedEntities: DEMO_ENTITIES.slice(21, 22),
    addedRelations: DEMO_RELATIONS.slice(17, 18),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 8,
    toVersion: 9,
  },
  // Delta 9 - 해결책
  {
    addedEntities: DEMO_ENTITIES.slice(22, 24),
    addedRelations: DEMO_RELATIONS.slice(18, 19),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 9,
    toVersion: 10,
  },
  // Delta 10 - 플로우마인드 소개
  {
    addedEntities: DEMO_ENTITIES.slice(24, 25),
    addedRelations: DEMO_RELATIONS.slice(19, 21),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 10,
    toVersion: 11,
  },
  // Delta 11 - 핵심 기능
  {
    addedEntities: DEMO_ENTITIES.slice(25, 30),
    addedRelations: DEMO_RELATIONS.slice(21, 26),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 11,
    toVersion: 12,
  },
  // Delta 12 - 확장성
  {
    addedEntities: DEMO_ENTITIES.slice(30, 33),
    addedRelations: DEMO_RELATIONS.slice(26, 30),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 12,
    toVersion: 13,
  },
  // Delta 13 - 피드백 기능
  {
    addedEntities: DEMO_ENTITIES.slice(33, 34),
    addedRelations: DEMO_RELATIONS.slice(30, 31),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 13,
    toVersion: 14,
  },
  // Delta 14 - 번역 및 내보내기
  {
    addedEntities: DEMO_ENTITIES.slice(34, 38),
    addedRelations: DEMO_RELATIONS.slice(31, 35),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 14,
    toVersion: 15,
  },
  // Delta 15 - 기술적 성과
  {
    addedEntities: DEMO_ENTITIES.slice(38, 39),
    addedRelations: DEMO_RELATIONS.slice(35, 37),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 15,
    toVersion: 16,
  },
  // Delta 16 - 아키텍처
  {
    addedEntities: DEMO_ENTITIES.slice(39, 40),
    addedRelations: DEMO_RELATIONS.slice(37, 38),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 16,
    toVersion: 17,
  },
  // Delta 17 - 클라우드 서비스
  {
    addedEntities: DEMO_ENTITIES.slice(40, 46),
    addedRelations: DEMO_RELATIONS.slice(38, 45),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 17,
    toVersion: 18,
  },
  // Delta 18 - AI 서비스
  {
    addedEntities: DEMO_ENTITIES.slice(46, 50),
    addedRelations: DEMO_RELATIONS.slice(45, 49),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 18,
    toVersion: 19,
  },
  // Delta 19 - Terraform
  {
    addedEntities: DEMO_ENTITIES.slice(50, 53),
    addedRelations: DEMO_RELATIONS.slice(49, 52),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 19,
    toVersion: 20,
  },
  // Delta 20 - Redis 역할
  {
    addedEntities: DEMO_ENTITIES.slice(53, 55),
    addedRelations: DEMO_RELATIONS.slice(52, 54),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 20,
    toVersion: 21,
  },
  // Delta 21 - Redis 기능
  {
    addedEntities: DEMO_ENTITIES.slice(55, 58),
    addedRelations: DEMO_RELATIONS.slice(54, 57),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 21,
    toVersion: 22,
  },
  // Delta 22 - 그래프 추출 프롬프트
  {
    addedEntities: DEMO_ENTITIES.slice(58, 61),
    addedRelations: DEMO_RELATIONS.slice(57, 60),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 22,
    toVersion: 23,
  },
  // Delta 23 - 피드백 프롬프트
  {
    addedEntities: DEMO_ENTITIES.slice(61, 63),
    addedRelations: DEMO_RELATIONS.slice(60, 62),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 23,
    toVersion: 24,
  },
  // Delta 24 - 번역 프롬프트
  {
    addedEntities: DEMO_ENTITIES.slice(63, 64),
    addedRelations: DEMO_RELATIONS.slice(62, 63),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 24,
    toVersion: 25,
  },
  // Delta 25 - 시장조사
  {
    addedEntities: DEMO_ENTITIES.slice(64, 67),
    addedRelations: DEMO_RELATIONS.slice(63, 65),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 25,
    toVersion: 26,
  },
  // Delta 26 - B2B SaaS 시장 규모
  {
    addedEntities: DEMO_ENTITIES.slice(67, 70),
    addedRelations: DEMO_RELATIONS.slice(65, 68),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 26,
    toVersion: 27,
  },
  // Delta 27 - B2B SaaS 세부
  {
    addedEntities: DEMO_ENTITIES.slice(70, 74),
    addedRelations: DEMO_RELATIONS.slice(68, 72),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 27,
    toVersion: 28,
  },
  // Delta 28 - 에듀테크 시장
  {
    addedEntities: DEMO_ENTITIES.slice(74, 77),
    addedRelations: DEMO_RELATIONS.slice(72, 75),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 28,
    toVersion: 29,
  },
  // Delta 29 - 에듀테크 세부
  {
    addedEntities: DEMO_ENTITIES.slice(77, 79),
    addedRelations: DEMO_RELATIONS.slice(75, 78),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 29,
    toVersion: 30,
  },
  // Delta 30 - 목표
  {
    addedEntities: DEMO_ENTITIES.slice(79, 81),
    addedRelations: DEMO_RELATIONS.slice(78, 80),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 30,
    toVersion: 31,
  },
  // Delta 31 - 마무리
  {
    addedEntities: DEMO_ENTITIES.slice(81, 82),
    addedRelations: DEMO_RELATIONS.slice(80, 81),
    updatedEntities: [],
    removedEntityIds: [],
    removedRelationIds: [],
    fromVersion: 31,
    toVersion: 32,
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
      { id: 'e1', label: 'Team 2', type: 'ORGANIZATION' },
      { id: 'e2', label: 'FlowMind', type: 'TECHNOLOGY' },
      { id: 'e3', label: 'Dohan Kwon', type: 'PERSON' },
      { id: 'e4', label: 'Google Cloud', type: 'TECHNOLOGY' },
      { id: 'e5', label: 'Cloud Build', type: 'TECHNOLOGY' },
      { id: 'e6', label: 'CI/CD Pipeline', type: 'CONCEPT' },
      { id: 'e7', label: 'Meeting', type: 'CONCEPT' },
      { id: 'e8', label: 'JobKorea', type: 'ORGANIZATION' },
      { id: 'e9', label: 'Incruit', type: 'ORGANIZATION' },
      { id: 'e10', label: '2.2 times/week', type: 'METRIC' },
      { id: 'e11', label: 'Time Waste', type: 'CONCEPT' },
      { id: 'e12', label: '73.4%', type: 'METRIC' },
      { id: 'e13', label: 'Office Worker', type: 'PERSON' },
      { id: 'e14', label: 'Distraction Experience', type: 'CONCEPT' },
      { id: 'e15', label: '56%', type: 'METRIC' },
      { id: 'e16', label: 'Ernst & Young Hanyoung', type: 'ORGANIZATION' },
      { id: 'e17', label: '29.4%', type: 'METRIC' },
      { id: 'e18', label: '2.5 hours', type: 'METRIC' },
      { id: 'e19', label: '146 trillion KRW', type: 'METRIC' },
      { id: 'e20', label: 'Unnecessary Meeting', type: 'CONCEPT' },
      { id: 'e21', label: 'Repetitive Work', type: 'CONCEPT' },
      { id: 'e22', label: 'Nothing Left', type: 'CONCEPT' },
      { id: 'e23', label: 'Meeting Result', type: 'CONCEPT' },
      { id: 'e24', label: 'Connection', type: 'CONCEPT' },
      { id: 'e25', label: 'Knowledge Graph', type: 'TECHNOLOGY' },
      { id: 'e26', label: 'System Audio Capture', type: 'ACTION' },
      { id: 'e27', label: 'Auto Transcript', type: 'ACTION' },
      { id: 'e28', label: 'Node/Relation Extraction', type: 'ACTION' },
      { id: 'e29', label: 'AI Translation', type: 'ACTION' },
      { id: 'e30', label: 'Export', type: 'ACTION' },
      { id: 'e31', label: 'Scalability', type: 'CONCEPT' },
      { id: 'e32', label: 'Lecture', type: 'CONCEPT' },
      { id: 'e33', label: 'YouTube Video', type: 'CONCEPT' },
      { id: 'e34', label: 'Feedback-based AI Improvement', type: 'ACTION' },
      { id: 'e35', label: '7 Languages', type: 'METRIC' },
      { id: 'e36', label: 'PNG', type: 'TECHNOLOGY' },
      { id: 'e37', label: 'PDF', type: 'TECHNOLOGY' },
      { id: 'e38', label: 'Mermaid', type: 'TECHNOLOGY' },
      { id: 'e39', label: 'Google Cloud AI Expert Course', type: 'CONCEPT' },
      { id: 'e40', label: 'Cloud Architecture', type: 'CONCEPT' },
      { id: 'e41', label: 'Cloud Run', type: 'TECHNOLOGY' },
      { id: 'e42', label: 'VPC Connector', type: 'TECHNOLOGY' },
      { id: 'e43', label: 'Memorystore', type: 'TECHNOLOGY' },
      { id: 'e44', label: 'Redis', type: 'TECHNOLOGY' },
      { id: 'e45', label: 'Cloud Storage', type: 'TECHNOLOGY' },
      { id: 'e46', label: 'BigQuery', type: 'TECHNOLOGY' },
      { id: 'e47', label: 'Cloud Speech to Text', type: 'TECHNOLOGY' },
      { id: 'e48', label: 'Vertex AI', type: 'TECHNOLOGY' },
      { id: 'e49', label: 'Speech Recognition', type: 'ACTION' },
      { id: 'e50', label: 'Graph Extraction', type: 'ACTION' },
      { id: 'e51', label: 'Terraform', type: 'TECHNOLOGY' },
      { id: 'e52', label: 'B2B', type: 'CONCEPT' },
      { id: 'e53', label: 'Monetization', type: 'CONCEPT' },
      { id: 'e54', label: 'Audio Chunk', type: 'CONCEPT' },
      { id: 'e55', label: 'Bottleneck', type: 'CONCEPT' },
      { id: 'e56', label: 'Order Guarantee', type: 'ACTION' },
      { id: 'e57', label: 'Buffering', type: 'ACTION' },
      { id: 'e58', label: 'Queuing', type: 'ACTION' },
      { id: 'e59', label: 'Graph Extraction Prompt', type: 'TECHNOLOGY' },
      { id: 'e60', label: 'Node Type', type: 'CONCEPT' },
      { id: 'e61', label: 'Few-shot Learning', type: 'CONCEPT' },
      { id: 'e62', label: 'Feedback Prompt', type: 'TECHNOLOGY' },
      { id: 'e63', label: 'Feedback Reflection', type: 'ACTION' },
      { id: 'e64', label: 'Translation Prompt', type: 'TECHNOLOGY' },
      { id: 'e65', label: 'Market Research', type: 'CONCEPT' },
      { id: 'e66', label: 'B2B SaaS', type: 'CONCEPT' },
      { id: 'e67', label: 'EduTech', type: 'CONCEPT' },
      { id: 'e68', label: 'IDC Korea', type: 'ORGANIZATION' },
      { id: 'e69', label: '3.06 trillion KRW', type: 'METRIC' },
      { id: 'e70', label: '2021', type: 'DATE' },
      { id: 'e71', label: 'Collaboration Tool', type: 'CONCEPT' },
      { id: 'e72', label: 'AI Solution', type: 'CONCEPT' },
      { id: 'e73', label: '400 billion KRW', type: 'METRIC' },
      { id: 'e74', label: '17 billion KRW', type: 'METRIC' },
      { id: 'e75', label: 'Ministry of Education', type: 'ORGANIZATION' },
      { id: 'e76', label: '10.83 trillion KRW', type: 'METRIC' },
      { id: 'e77', label: '2020', type: 'DATE' },
      { id: 'e78', label: 'Higher/Adult Education', type: 'CONCEPT' },
      { id: 'e79', label: '650 billion KRW', type: 'METRIC' },
      { id: 'e80', label: '6.5 billion KRW', type: 'METRIC' },
      { id: 'e81', label: 'Revenue Target', type: 'CONCEPT' },
      { id: 'e82', label: 'App Demo', type: 'ACTION' },
    ],
    relations: [
      { source: 'e1', target: 'e2', relation: 'developed' },
      { source: 'e3', target: 'e1', relation: 'member of' },
      { source: 'e5', target: 'e4', relation: 'belongs to' },
      { source: 'e5', target: 'e6', relation: 'builds' },
      { source: 'e8', target: 'e10', relation: 'survey result' },
      { source: 'e9', target: 'e10', relation: 'survey result' },
      { source: 'e10', target: 'e7', relation: 'frequency' },
      { source: 'e13', target: 'e11', relation: 'perceives' },
      { source: 'e12', target: 'e11', relation: 'ratio' },
      { source: 'e7', target: 'e11', relation: 'problem' },
      { source: 'e15', target: 'e14', relation: 'ratio' },
      { source: 'e13', target: 'e14', relation: 'experienced' },
      { source: 'e16', target: 'e17', relation: 'survey result' },
      { source: 'e17', target: 'e18', relation: 'converted to' },
      { source: 'e19', target: 'e20', relation: 'loss' },
      { source: 'e19', target: 'e21', relation: 'loss' },
      { source: 'e20', target: 'e7', relation: 'type of' },
      { source: 'e22', target: 'e11', relation: 'cause' },
      { source: 'e23', target: 'e24', relation: 'solution' },
      { source: 'e2', target: 'e25', relation: 'core technology' },
      { source: 'e25', target: 'e23', relation: 'organizes' },
      { source: 'e2', target: 'e26', relation: 'feature' },
      { source: 'e2', target: 'e27', relation: 'feature' },
      { source: 'e2', target: 'e28', relation: 'feature' },
      { source: 'e2', target: 'e29', relation: 'feature' },
      { source: 'e2', target: 'e30', relation: 'feature' },
      { source: 'e26', target: 'e31', relation: 'advantage' },
      { source: 'e31', target: 'e32', relation: 'use case' },
      { source: 'e31', target: 'e33', relation: 'use case' },
      { source: 'e31', target: 'e7', relation: 'use case' },
      { source: 'e2', target: 'e34', relation: 'feature' },
      { source: 'e29', target: 'e35', relation: 'supports' },
      { source: 'e30', target: 'e36', relation: 'format' },
      { source: 'e30', target: 'e37', relation: 'format' },
      { source: 'e30', target: 'e38', relation: 'format' },
      { source: 'e2', target: 'e4', relation: 'uses' },
      { source: 'e39', target: 'e4', relation: 'based on' },
      { source: 'e2', target: 'e40', relation: 'uses' },
      { source: 'e40', target: 'e41', relation: 'component' },
      { source: 'e40', target: 'e42', relation: 'component' },
      { source: 'e40', target: 'e43', relation: 'component' },
      { source: 'e43', target: 'e44', relation: 'equals' },
      { source: 'e40', target: 'e45', relation: 'component' },
      { source: 'e40', target: 'e46', relation: 'component' },
      { source: 'e42', target: 'e43', relation: 'secure connection' },
      { source: 'e47', target: 'e49', relation: 'handles' },
      { source: 'e48', target: 'e50', relation: 'handles' },
      { source: 'e47', target: 'e4', relation: 'belongs to' },
      { source: 'e48', target: 'e4', relation: 'belongs to' },
      { source: 'e51', target: 'e40', relation: 'defines' },
      { source: 'e52', target: 'e53', relation: 'goal' },
      { source: 'e51', target: 'e52', relation: 'supports' },
      { source: 'e44', target: 'e55', relation: 'solves' },
      { source: 'e54', target: 'e55', relation: 'causes' },
      { source: 'e44', target: 'e56', relation: 'role' },
      { source: 'e44', target: 'e57', relation: 'role' },
      { source: 'e44', target: 'e58', relation: 'role' },
      { source: 'e59', target: 'e60', relation: 'defines' },
      { source: 'e59', target: 'e61', relation: 'applies' },
      { source: 'e59', target: 'e50', relation: 'used for' },
      { source: 'e62', target: 'e63', relation: 'role' },
      { source: 'e62', target: 'e59', relation: 'combines with' },
      { source: 'e64', target: 'e29', relation: 'used for' },
      { source: 'e65', target: 'e66', relation: 'target' },
      { source: 'e65', target: 'e67', relation: 'target' },
      { source: 'e68', target: 'e69', relation: 'survey result' },
      { source: 'e69', target: 'e66', relation: 'market size' },
      { source: 'e66', target: 'e70', relation: 'growth baseline' },
      { source: 'e66', target: 'e71', relation: 'includes' },
      { source: 'e66', target: 'e72', relation: 'includes' },
      { source: 'e73', target: 'e66', relation: 'available market' },
      { source: 'e74', target: 'e66', relation: 'target market' },
      { source: 'e75', target: 'e76', relation: 'reports' },
      { source: 'e76', target: 'e67', relation: 'market size' },
      { source: 'e67', target: 'e77', relation: 'growth baseline' },
      { source: 'e67', target: 'e78', relation: 'target' },
      { source: 'e79', target: 'e67', relation: 'available market' },
      { source: 'e25', target: 'e78', relation: 'need' },
      { source: 'e80', target: 'e81', relation: 'target' },
      { source: 'e2', target: 'e81', relation: 'goal' },
      { source: 'e82', target: 'e2', relation: 'demonstrates' },
    ],
  },
  ja: {
    entities: [
      { id: 'e1', label: '2チーム', type: 'ORGANIZATION' },
      { id: 'e2', label: 'フローマインド', type: 'TECHNOLOGY' },
      { id: 'e3', label: 'クォン・ドハン', type: 'PERSON' },
      { id: 'e4', label: 'Google Cloud', type: 'TECHNOLOGY' },
      { id: 'e5', label: 'Cloud Build', type: 'TECHNOLOGY' },
      { id: 'e6', label: 'CI/CDパイプライン', type: 'CONCEPT' },
      { id: 'e7', label: '会議', type: 'CONCEPT' },
      { id: 'e8', label: 'ジョブコリア', type: 'ORGANIZATION' },
      { id: 'e9', label: 'インクルート', type: 'ORGANIZATION' },
      { id: 'e10', label: '週2.2回', type: 'METRIC' },
      { id: 'e11', label: '時間の無駄', type: 'CONCEPT' },
      { id: 'e12', label: '73.4%', type: 'METRIC' },
      { id: 'e13', label: '会社員', type: 'PERSON' },
      { id: 'e14', label: 'サボり経験', type: 'CONCEPT' },
      { id: 'e15', label: '56%', type: 'METRIC' },
      { id: 'e16', label: 'アーンスト・アンド・ヤング韓英', type: 'ORGANIZATION' },
      { id: 'e17', label: '29.4%', type: 'METRIC' },
      { id: 'e18', label: '2時間半', type: 'METRIC' },
      { id: 'e19', label: '146兆ウォン', type: 'METRIC' },
      { id: 'e20', label: '不要な会議', type: 'CONCEPT' },
      { id: 'e21', label: '反復業務', type: 'CONCEPT' },
      { id: 'e22', label: '残るものがない', type: 'CONCEPT' },
      { id: 'e23', label: '会議結果', type: 'CONCEPT' },
      { id: 'e24', label: '連結', type: 'CONCEPT' },
      { id: 'e25', label: 'ナレッジグラフ', type: 'TECHNOLOGY' },
      { id: 'e26', label: 'システムオーディオキャプチャ', type: 'ACTION' },
      { id: 'e27', label: '台本自動作成', type: 'ACTION' },
      { id: 'e28', label: 'ノード/関係抽出', type: 'ACTION' },
      { id: 'e29', label: 'AI翻訳', type: 'ACTION' },
      { id: 'e30', label: 'エクスポート', type: 'ACTION' },
      { id: 'e31', label: '拡張性', type: 'CONCEPT' },
      { id: 'e32', label: '講義', type: 'CONCEPT' },
      { id: 'e33', label: 'YouTube動画', type: 'CONCEPT' },
      { id: 'e34', label: 'フィードバック基盤AI改善', type: 'ACTION' },
      { id: 'e35', label: '7言語', type: 'METRIC' },
      { id: 'e36', label: 'PNG', type: 'TECHNOLOGY' },
      { id: 'e37', label: 'PDF', type: 'TECHNOLOGY' },
      { id: 'e38', label: 'Mermaid', type: 'TECHNOLOGY' },
      { id: 'e39', label: 'Google Cloud AI専門家養成課程', type: 'CONCEPT' },
      { id: 'e40', label: 'クラウドアーキテクチャ', type: 'CONCEPT' },
      { id: 'e41', label: 'Cloud Run', type: 'TECHNOLOGY' },
      { id: 'e42', label: 'VPC Connector', type: 'TECHNOLOGY' },
      { id: 'e43', label: 'Memorystore', type: 'TECHNOLOGY' },
      { id: 'e44', label: 'Redis', type: 'TECHNOLOGY' },
      { id: 'e45', label: 'Cloud Storage', type: 'TECHNOLOGY' },
      { id: 'e46', label: 'BigQuery', type: 'TECHNOLOGY' },
      { id: 'e47', label: 'Cloud Speech to Text', type: 'TECHNOLOGY' },
      { id: 'e48', label: 'Vertex AI', type: 'TECHNOLOGY' },
      { id: 'e49', label: '音声認識', type: 'ACTION' },
      { id: 'e50', label: 'グラフ抽出', type: 'ACTION' },
      { id: 'e51', label: 'Terraform', type: 'TECHNOLOGY' },
      { id: 'e52', label: 'B2B', type: 'CONCEPT' },
      { id: 'e53', label: '収益化', type: 'CONCEPT' },
      { id: 'e54', label: 'オーディオチャンク', type: 'CONCEPT' },
      { id: 'e55', label: 'ボトルネック', type: 'CONCEPT' },
      { id: 'e56', label: '順序保証', type: 'ACTION' },
      { id: 'e57', label: 'バッファリング', type: 'ACTION' },
      { id: 'e58', label: 'キューイング', type: 'ACTION' },
      { id: 'e59', label: 'グラフ抽出プロンプト', type: 'TECHNOLOGY' },
      { id: 'e60', label: 'ノードタイプ', type: 'CONCEPT' },
      { id: 'e61', label: 'Few-shot学習', type: 'CONCEPT' },
      { id: 'e62', label: 'フィードバックプロンプト', type: 'TECHNOLOGY' },
      { id: 'e63', label: 'フィードバック反映', type: 'ACTION' },
      { id: 'e64', label: '翻訳プロンプト', type: 'TECHNOLOGY' },
      { id: 'e65', label: '市場調査', type: 'CONCEPT' },
      { id: 'e66', label: 'B2B SaaS', type: 'CONCEPT' },
      { id: 'e67', label: 'エドテック', type: 'CONCEPT' },
      { id: 'e68', label: '韓国IDC', type: 'ORGANIZATION' },
      { id: 'e69', label: '3兆614億ウォン', type: 'METRIC' },
      { id: 'e70', label: '2021年', type: 'DATE' },
      { id: 'e71', label: 'コラボツール', type: 'CONCEPT' },
      { id: 'e72', label: 'AIソリューション', type: 'CONCEPT' },
      { id: 'e73', label: '4000億ウォン', type: 'METRIC' },
      { id: 'e74', label: '170億ウォン', type: 'METRIC' },
      { id: 'e75', label: '教育部', type: 'ORGANIZATION' },
      { id: 'e76', label: '10兆8319億ウォン', type: 'METRIC' },
      { id: 'e77', label: '2020年', type: 'DATE' },
      { id: 'e78', label: '高等/成人教育', type: 'CONCEPT' },
      { id: 'e79', label: '6500億ウォン', type: 'METRIC' },
      { id: 'e80', label: '65億ウォン', type: 'METRIC' },
      { id: 'e81', label: '収益目標', type: 'CONCEPT' },
      { id: 'e82', label: 'アプリデモ', type: 'ACTION' },
    ],
    relations: [
      { source: 'e1', target: 'e2', relation: '開発' },
      { source: 'e3', target: 'e1', relation: '所属' },
      { source: 'e5', target: 'e4', relation: '属す' },
      { source: 'e5', target: 'e6', relation: '構築' },
      { source: 'e8', target: 'e10', relation: '調査結果' },
      { source: 'e9', target: 'e10', relation: '調査結果' },
      { source: 'e10', target: 'e7', relation: '頻度' },
      { source: 'e13', target: 'e11', relation: '認識' },
      { source: 'e12', target: 'e11', relation: '比率' },
      { source: 'e7', target: 'e11', relation: '問題点' },
      { source: 'e15', target: 'e14', relation: '比率' },
      { source: 'e13', target: 'e14', relation: '経験' },
      { source: 'e16', target: 'e17', relation: '調査結果' },
      { source: 'e17', target: 'e18', relation: '換算' },
      { source: 'e19', target: 'e20', relation: '損失' },
      { source: 'e19', target: 'e21', relation: '損失' },
      { source: 'e20', target: 'e7', relation: '種類' },
      { source: 'e22', target: 'e11', relation: '原因' },
      { source: 'e23', target: 'e24', relation: '解決策' },
      { source: 'e2', target: 'e25', relation: '核心技術' },
      { source: 'e25', target: 'e23', relation: '整理' },
      { source: 'e2', target: 'e26', relation: '機能' },
      { source: 'e2', target: 'e27', relation: '機能' },
      { source: 'e2', target: 'e28', relation: '機能' },
      { source: 'e2', target: 'e29', relation: '機能' },
      { source: 'e2', target: 'e30', relation: '機能' },
      { source: 'e26', target: 'e31', relation: '利点' },
      { source: 'e31', target: 'e32', relation: '活用' },
      { source: 'e31', target: 'e33', relation: '活用' },
      { source: 'e31', target: 'e7', relation: '活用' },
      { source: 'e2', target: 'e34', relation: '機能' },
      { source: 'e29', target: 'e35', relation: '対応' },
      { source: 'e30', target: 'e36', relation: '形式' },
      { source: 'e30', target: 'e37', relation: '形式' },
      { source: 'e30', target: 'e38', relation: '形式' },
      { source: 'e2', target: 'e4', relation: '活用' },
      { source: 'e39', target: 'e4', relation: '基盤' },
      { source: 'e2', target: 'e40', relation: '使用' },
      { source: 'e40', target: 'e41', relation: '構成' },
      { source: 'e40', target: 'e42', relation: '構成' },
      { source: 'e40', target: 'e43', relation: '構成' },
      { source: 'e43', target: 'e44', relation: '同一' },
      { source: 'e40', target: 'e45', relation: '構成' },
      { source: 'e40', target: 'e46', relation: '構成' },
      { source: 'e42', target: 'e43', relation: 'セキュア接続' },
      { source: 'e47', target: 'e49', relation: '担当' },
      { source: 'e48', target: 'e50', relation: '担当' },
      { source: 'e47', target: 'e4', relation: '属す' },
      { source: 'e48', target: 'e4', relation: '属す' },
      { source: 'e51', target: 'e40', relation: '定義' },
      { source: 'e52', target: 'e53', relation: '目標' },
      { source: 'e51', target: 'e52', relation: '支援' },
      { source: 'e44', target: 'e55', relation: '解決' },
      { source: 'e54', target: 'e55', relation: '原因' },
      { source: 'e44', target: 'e56', relation: '役割' },
      { source: 'e44', target: 'e57', relation: '役割' },
      { source: 'e44', target: 'e58', relation: '役割' },
      { source: 'e59', target: 'e60', relation: '定義' },
      { source: 'e59', target: 'e61', relation: '適用' },
      { source: 'e59', target: 'e50', relation: '使用' },
      { source: 'e62', target: 'e63', relation: '役割' },
      { source: 'e62', target: 'e59', relation: '結合' },
      { source: 'e64', target: 'e29', relation: '使用' },
      { source: 'e65', target: 'e66', relation: '対象' },
      { source: 'e65', target: 'e67', relation: '対象' },
      { source: 'e68', target: 'e69', relation: '調査結果' },
      { source: 'e69', target: 'e66', relation: '市場規模' },
      { source: 'e66', target: 'e70', relation: '成長基準' },
      { source: 'e66', target: 'e71', relation: '含む' },
      { source: 'e66', target: 'e72', relation: '含む' },
      { source: 'e73', target: 'e66', relation: '遊休市場' },
      { source: 'e74', target: 'e66', relation: '収益市場' },
      { source: 'e75', target: 'e76', relation: '報告' },
      { source: 'e76', target: 'e67', relation: '市場規模' },
      { source: 'e67', target: 'e77', relation: '成長基準' },
      { source: 'e67', target: 'e78', relation: 'ターゲット' },
      { source: 'e79', target: 'e67', relation: '遊休市場' },
      { source: 'e25', target: 'e78', relation: 'ニーズ' },
      { source: 'e80', target: 'e81', relation: '目標値' },
      { source: 'e2', target: 'e81', relation: '目標' },
      { source: 'e82', target: 'e2', relation: '対象' },
    ],
  },
  zh: {
    entities: [
      { id: 'e1', label: '第2组', type: 'ORGANIZATION' },
      { id: 'e2', label: 'FlowMind', type: 'TECHNOLOGY' },
      { id: 'e3', label: '权道汉', type: 'PERSON' },
      { id: 'e4', label: 'Google Cloud', type: 'TECHNOLOGY' },
      { id: 'e5', label: 'Cloud Build', type: 'TECHNOLOGY' },
      { id: 'e6', label: 'CI/CD管道', type: 'CONCEPT' },
      { id: 'e7', label: '会议', type: 'CONCEPT' },
      { id: 'e8', label: 'JobKorea', type: 'ORGANIZATION' },
      { id: 'e9', label: 'Incruit', type: 'ORGANIZATION' },
      { id: 'e10', label: '每周2.2次', type: 'METRIC' },
      { id: 'e11', label: '浪费时间', type: 'CONCEPT' },
      { id: 'e12', label: '73.4%', type: 'METRIC' },
      { id: 'e13', label: '上班族', type: 'PERSON' },
      { id: 'e14', label: '开小差经历', type: 'CONCEPT' },
      { id: 'e15', label: '56%', type: 'METRIC' },
      { id: 'e16', label: '安永韩英', type: 'ORGANIZATION' },
      { id: 'e17', label: '29.4%', type: 'METRIC' },
      { id: 'e18', label: '2.5小时', type: 'METRIC' },
      { id: 'e19', label: '146万亿韩元', type: 'METRIC' },
      { id: 'e20', label: '不必要的会议', type: 'CONCEPT' },
      { id: 'e21', label: '重复工作', type: 'CONCEPT' },
      { id: 'e22', label: '没有收获', type: 'CONCEPT' },
      { id: 'e23', label: '会议结果', type: 'CONCEPT' },
      { id: 'e24', label: '连接', type: 'CONCEPT' },
      { id: 'e25', label: '知识图谱', type: 'TECHNOLOGY' },
      { id: 'e26', label: '系统音频捕获', type: 'ACTION' },
      { id: 'e27', label: '自动记录台词', type: 'ACTION' },
      { id: 'e28', label: '节点/关系提取', type: 'ACTION' },
      { id: 'e29', label: 'AI翻译', type: 'ACTION' },
      { id: 'e30', label: '导出', type: 'ACTION' },
      { id: 'e31', label: '可扩展性', type: 'CONCEPT' },
      { id: 'e32', label: '讲座', type: 'CONCEPT' },
      { id: 'e33', label: 'YouTube视频', type: 'CONCEPT' },
      { id: 'e34', label: '基于反馈的AI改进', type: 'ACTION' },
      { id: 'e35', label: '7种语言', type: 'METRIC' },
      { id: 'e36', label: 'PNG', type: 'TECHNOLOGY' },
      { id: 'e37', label: 'PDF', type: 'TECHNOLOGY' },
      { id: 'e38', label: 'Mermaid', type: 'TECHNOLOGY' },
      { id: 'e39', label: 'Google Cloud AI专家培训课程', type: 'CONCEPT' },
      { id: 'e40', label: '云架构', type: 'CONCEPT' },
      { id: 'e41', label: 'Cloud Run', type: 'TECHNOLOGY' },
      { id: 'e42', label: 'VPC Connector', type: 'TECHNOLOGY' },
      { id: 'e43', label: 'Memorystore', type: 'TECHNOLOGY' },
      { id: 'e44', label: 'Redis', type: 'TECHNOLOGY' },
      { id: 'e45', label: 'Cloud Storage', type: 'TECHNOLOGY' },
      { id: 'e46', label: 'BigQuery', type: 'TECHNOLOGY' },
      { id: 'e47', label: 'Cloud Speech to Text', type: 'TECHNOLOGY' },
      { id: 'e48', label: 'Vertex AI', type: 'TECHNOLOGY' },
      { id: 'e49', label: '语音识别', type: 'ACTION' },
      { id: 'e50', label: '图谱提取', type: 'ACTION' },
      { id: 'e51', label: 'Terraform', type: 'TECHNOLOGY' },
      { id: 'e52', label: 'B2B', type: 'CONCEPT' },
      { id: 'e53', label: '盈利化', type: 'CONCEPT' },
      { id: 'e54', label: '音频块', type: 'CONCEPT' },
      { id: 'e55', label: '瓶颈', type: 'CONCEPT' },
      { id: 'e56', label: '顺序保证', type: 'ACTION' },
      { id: 'e57', label: '缓冲', type: 'ACTION' },
      { id: 'e58', label: '队列', type: 'ACTION' },
      { id: 'e59', label: '图谱提取提示词', type: 'TECHNOLOGY' },
      { id: 'e60', label: '节点类型', type: 'CONCEPT' },
      { id: 'e61', label: 'Few-shot学习', type: 'CONCEPT' },
      { id: 'e62', label: '反馈提示词', type: 'TECHNOLOGY' },
      { id: 'e63', label: '反馈反映', type: 'ACTION' },
      { id: 'e64', label: '翻译提示词', type: 'TECHNOLOGY' },
      { id: 'e65', label: '市场调研', type: 'CONCEPT' },
      { id: 'e66', label: 'B2B SaaS', type: 'CONCEPT' },
      { id: 'e67', label: '教育科技', type: 'CONCEPT' },
      { id: 'e68', label: '韩国IDC', type: 'ORGANIZATION' },
      { id: 'e69', label: '3.06万亿韩元', type: 'METRIC' },
      { id: 'e70', label: '2021年', type: 'DATE' },
      { id: 'e71', label: '协作工具', type: 'CONCEPT' },
      { id: 'e72', label: 'AI解决方案', type: 'CONCEPT' },
      { id: 'e73', label: '4000亿韩元', type: 'METRIC' },
      { id: 'e74', label: '170亿韩元', type: 'METRIC' },
      { id: 'e75', label: '教育部', type: 'ORGANIZATION' },
      { id: 'e76', label: '10.83万亿韩元', type: 'METRIC' },
      { id: 'e77', label: '2020年', type: 'DATE' },
      { id: 'e78', label: '高等/成人教育', type: 'CONCEPT' },
      { id: 'e79', label: '6500亿韩元', type: 'METRIC' },
      { id: 'e80', label: '65亿韩元', type: 'METRIC' },
      { id: 'e81', label: '收益目标', type: 'CONCEPT' },
      { id: 'e82', label: '应用演示', type: 'ACTION' },
    ],
    relations: [
      { source: 'e1', target: 'e2', relation: '开发' },
      { source: 'e3', target: 'e1', relation: '所属' },
      { source: 'e5', target: 'e4', relation: '属于' },
      { source: 'e5', target: 'e6', relation: '构建' },
      { source: 'e8', target: 'e10', relation: '调查结果' },
      { source: 'e9', target: 'e10', relation: '调查结果' },
      { source: 'e10', target: 'e7', relation: '频率' },
      { source: 'e13', target: 'e11', relation: '认知' },
      { source: 'e12', target: 'e11', relation: '比例' },
      { source: 'e7', target: 'e11', relation: '问题' },
      { source: 'e15', target: 'e14', relation: '比例' },
      { source: 'e13', target: 'e14', relation: '经历' },
      { source: 'e16', target: 'e17', relation: '调查结果' },
      { source: 'e17', target: 'e18', relation: '换算' },
      { source: 'e19', target: 'e20', relation: '损失' },
      { source: 'e19', target: 'e21', relation: '损失' },
      { source: 'e20', target: 'e7', relation: '类型' },
      { source: 'e22', target: 'e11', relation: '原因' },
      { source: 'e23', target: 'e24', relation: '解决方案' },
      { source: 'e2', target: 'e25', relation: '核心技术' },
      { source: 'e25', target: 'e23', relation: '整理' },
      { source: 'e2', target: 'e26', relation: '功能' },
      { source: 'e2', target: 'e27', relation: '功能' },
      { source: 'e2', target: 'e28', relation: '功能' },
      { source: 'e2', target: 'e29', relation: '功能' },
      { source: 'e2', target: 'e30', relation: '功能' },
      { source: 'e26', target: 'e31', relation: '优势' },
      { source: 'e31', target: 'e32', relation: '应用' },
      { source: 'e31', target: 'e33', relation: '应用' },
      { source: 'e31', target: 'e7', relation: '应用' },
      { source: 'e2', target: 'e34', relation: '功能' },
      { source: 'e29', target: 'e35', relation: '支持' },
      { source: 'e30', target: 'e36', relation: '格式' },
      { source: 'e30', target: 'e37', relation: '格式' },
      { source: 'e30', target: 'e38', relation: '格式' },
      { source: 'e2', target: 'e4', relation: '使用' },
      { source: 'e39', target: 'e4', relation: '基于' },
      { source: 'e2', target: 'e40', relation: '使用' },
      { source: 'e40', target: 'e41', relation: '组成' },
      { source: 'e40', target: 'e42', relation: '组成' },
      { source: 'e40', target: 'e43', relation: '组成' },
      { source: 'e43', target: 'e44', relation: '相同' },
      { source: 'e40', target: 'e45', relation: '组成' },
      { source: 'e40', target: 'e46', relation: '组成' },
      { source: 'e42', target: 'e43', relation: '安全连接' },
      { source: 'e47', target: 'e49', relation: '负责' },
      { source: 'e48', target: 'e50', relation: '负责' },
      { source: 'e47', target: 'e4', relation: '属于' },
      { source: 'e48', target: 'e4', relation: '属于' },
      { source: 'e51', target: 'e40', relation: '定义' },
      { source: 'e52', target: 'e53', relation: '目标' },
      { source: 'e51', target: 'e52', relation: '支持' },
      { source: 'e44', target: 'e55', relation: '解决' },
      { source: 'e54', target: 'e55', relation: '原因' },
      { source: 'e44', target: 'e56', relation: '角色' },
      { source: 'e44', target: 'e57', relation: '角色' },
      { source: 'e44', target: 'e58', relation: '角色' },
      { source: 'e59', target: 'e60', relation: '定义' },
      { source: 'e59', target: 'e61', relation: '应用' },
      { source: 'e59', target: 'e50', relation: '用于' },
      { source: 'e62', target: 'e63', relation: '角色' },
      { source: 'e62', target: 'e59', relation: '结合' },
      { source: 'e64', target: 'e29', relation: '用于' },
      { source: 'e65', target: 'e66', relation: '对象' },
      { source: 'e65', target: 'e67', relation: '对象' },
      { source: 'e68', target: 'e69', relation: '调查结果' },
      { source: 'e69', target: 'e66', relation: '市场规模' },
      { source: 'e66', target: 'e70', relation: '增长基准' },
      { source: 'e66', target: 'e71', relation: '包含' },
      { source: 'e66', target: 'e72', relation: '包含' },
      { source: 'e73', target: 'e66', relation: '闲置市场' },
      { source: 'e74', target: 'e66', relation: '收益市场' },
      { source: 'e75', target: 'e76', relation: '报告' },
      { source: 'e76', target: 'e67', relation: '市场规模' },
      { source: 'e67', target: 'e77', relation: '增长基准' },
      { source: 'e67', target: 'e78', relation: '目标' },
      { source: 'e79', target: 'e67', relation: '闲置市场' },
      { source: 'e25', target: 'e78', relation: '需求' },
      { source: 'e80', target: 'e81', relation: '目标值' },
      { source: 'e2', target: 'e81', relation: '目标' },
      { source: 'e82', target: 'e2', relation: '对象' },
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
