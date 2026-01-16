# 실시간 지식 그래프 (Real-time Knowledge Graph)

> 온라인 회의, 강의, 음성 콘텐츠를 실시간으로 분석하여 지식 그래프로 시각화하는 데스크톱 애플리케이션  
> **Google Cloud Platform 기반 아키텍처**

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)
![GCP](https://img.shields.io/badge/cloud-Google%20Cloud-4285F4)

## 🎯 주요 기능

- **실시간 시스템 오디오 캡처** - Electron desktopCapturer를 통한 시스템 사운드 캡처
- **Cloud Speech-to-Text v2** - Chirp 2 모델 기반 다국어 음성 인식 (한국어, 영어, 일본어, 중국어)
- **Vertex AI Gemini** - gemini-2.5-flash 모델을 활용한 엔티티/관계 추출
- **피드백 기반 AI 개선** - 사용자 만족도를 학습하여 추출 품질 지속 개선
- **실시간 그래프 시각화** - React Flow 기반 인터랙티브 지식 그래프
- **노드 겹침 방지** - Force-directed 레이아웃 알고리즘으로 자동 배치

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Desktop App                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Audio     │  │  WebSocket  │  │    React Flow       │  │
│  │   Capture   │──│   Client    │──│    Visualization    │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket (wss://)
┌─────────────────────────▼───────────────────────────────────┐
│                 Google Cloud Platform                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Cloud Run                            │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │ │
│  │  │  FastAPI    │  │   STT       │  │   Extraction   │  │ │
│  │  │  Server     │──│  (Speech v2)│──│  (Vertex AI)   │  │ │
│  │  └─────────────┘  └─────────────┘  └────────────────┘  │ │
│  └────────────────────────────┬───────────────────────────┘ │
│                               │                              │
│  ┌────────────┐  ┌────────────▼────────────┐  ┌───────────┐ │
│  │ Memorystore│  │      Cloud Storage      │  │ BigQuery  │ │
│  │  (Redis)   │  │ • Audio • Graph • Logs  │  │ • Feedback│ │
│  └────────────┘  └─────────────────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────┘
```

자세한 아키텍처 다이어그램은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 참조하세요.

## 📁 프로젝트 구조

```
/realtime-knowledge-graph-gcp
├── /apps
│   └── /desktop              # Electron + React 데스크톱 앱
│       ├── /electron         # Electron 메인 프로세스
│       └── /src              # React 렌더러
│           ├── /components   # UI 컴포넌트
│           ├── /hooks        # React 훅
│           └── /store        # Zustand 상태 관리
├── /servers
│   └── /api                  # FastAPI 백엔드 서버
│       ├── /gcp              # GCP 서비스 모듈
│       │   ├── speech_to_text.py   # Cloud Speech v2
│       │   ├── vertex_ai.py        # Vertex AI Gemini
│       │   ├── storage.py          # Cloud Storage
│       │   ├── bigquery_client.py  # BigQuery
│       │   └── feedback.py         # 피드백 관리
│       ├── main.py           # FastAPI 엔트리포인트
│       ├── websocket.py      # WebSocket 핸들러
│       ├── extraction.py     # 지식 추출 파이프라인
│       └── graph_state.py    # 그래프 상태 관리
├── /packages
│   ├── /shared-types         # 공유 TypeScript 타입
│   ├── /llm-prompts          # LLM 프롬프트 관리
│   └── /graph-utils          # 그래프 유틸리티
├── /infra
│   ├── /terraform            # GCP 인프라 IaC
│   ├── /cloudbuild           # Cloud Build CI/CD
│   └── docker-compose.yml    # 로컬 개발용
└── /docs
    ├── ARCHITECTURE.md       # 아키텍처 다이어그램
    └── GCP_DEPLOYMENT_GUIDE.md  # 배포 가이드
```

## 🚀 빠른 시작

### 사전 요구사항

- Node.js >= 18.x
- Python >= 3.11
- GCP 프로젝트 (또는 로컬 Redis)
- GCP 서비스 계정 키

### 1. 저장소 클론

```bash
git clone <repository-url>
cd realtime-knowledge-graph-gcp
```

### 2. 프론트엔드 의존성 설치

```bash
# 루트 디렉토리에서
npm install

# 데스크톱 앱 의존성
cd apps/desktop
npm install
```

### 3. Python 가상환경 및 의존성 설치

```bash
cd servers/api
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 4. 환경 변수 설정

```bash
# servers/api/.env 생성
cat > .env << EOF
# GCP 설정
GCP_PROJECT_ID=your-project-id
GCP_REGION=asia-northeast3

# Vertex AI
VERTEX_AI_MODEL=gemini-2.5-flash

# Cloud Speech
SPEECH_LANGUAGE_CODES=ko-KR

# Cloud Storage
GCS_BUCKET_NAME=your-bucket-name

# BigQuery
BQ_DATASET_ID=knowledge_graph

# Redis (로컬 개발용)
REDIS_HOST=localhost
REDIS_PORT=6379

# 기타
LOG_LEVEL=INFO
DEBUG=true
ENABLE_FEEDBACK=true
EOF
```

### 5. GCP 인증 설정 (로컬 개발)

```bash
# 서비스 계정 키 다운로드 후
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# 또는 gcloud 인증
gcloud auth application-default login
```

### 6. 로컬 Redis 실행 (개발용)

```bash
# Docker 사용
cd infra
docker-compose -f docker-compose.dev.yml up -d
```

### 7. API 서버 실행

```bash
cd servers/api
source venv/bin/activate  # Windows: venv\Scripts\activate
python main.py
```

### 8. 데스크톱 앱 실행

```bash
cd apps/desktop
npm run dev
```

## ☁️ GCP 배포

자세한 배포 가이드는 [docs/GCP_DEPLOYMENT_GUIDE.md](docs/GCP_DEPLOYMENT_GUIDE.md)를 참조하세요.

### 빠른 배포 (Cloud Build)

```bash
# 1. Terraform으로 인프라 생성
cd infra/terraform
terraform init
terraform apply

# 2. Cloud Build로 배포
gcloud builds submit --config=infra/cloudbuild/cloudbuild.yaml
```

## 📖 사용 방법

1. **앱 시작**: 데스크톱 앱을 실행하면 자동으로 서버에 연결됩니다.
2. **오디오 캡처 시작**: "오디오 캡처 시작" 버튼을 클릭합니다.
3. **화면/오디오 선택**: 시스템 오디오를 캡처할 화면을 선택합니다.
4. **실시간 분석**: 음성이 실시간으로 텍스트로 변환되고, 지식 그래프가 생성됩니다.
5. **그래프 탐색**: 생성된 그래프를 드래그, 줌, 패닝으로 탐색합니다.
6. **피드백 제출**: 캡처 종료 시 생성된 그래프에 대한 만족도를 평가합니다.

## ⚙️ 설정

### API 서버 설정

| 환경 변수 | 설명 | 기본값 |
|-----------|------|--------|
| `GCP_PROJECT_ID` | GCP 프로젝트 ID | - |
| `GCP_REGION` | GCP 리전 | `asia-northeast3` |
| `VERTEX_AI_MODEL` | Vertex AI 모델 | `gemini-2.5-flash` |
| `SPEECH_LANGUAGE_CODES` | STT 언어 코드 | `ko-KR` |
| `GCS_BUCKET_NAME` | Cloud Storage 버킷 | - |
| `BQ_DATASET_ID` | BigQuery 데이터셋 | `knowledge_graph` |
| `REDIS_HOST` | Redis 호스트 | `localhost` |
| `ENABLE_FEEDBACK` | 피드백 기능 활성화 | `true` |

## 🔧 문제 해결

### "GCP 인증 오류"

```bash
# 서비스 계정 키 경로 확인
echo $GOOGLE_APPLICATION_CREDENTIALS

# 또는 gcloud 재인증
gcloud auth application-default login
```

### "Redis 연결 실패"

```bash
# 로컬 Redis 실행 확인
redis-cli ping  # PONG이 반환되어야 함

# Docker 컨테이너 확인
docker ps | grep redis
```

### "오디오 캡처 실패"

- **Windows**: "스테레오 믹스"가 활성화되어 있는지 확인
- **macOS**: 화면 녹화 권한이 부여되었는지 확인 (시스템 환경설정 → 보안 및 개인정보보호)

## 💰 예상 비용 (GCP)

| 서비스 | 월 예상 비용 |
|--------|--------------|
| Cloud Run | $50-100 |
| Memorystore (Redis) | $35+ |
| Cloud Speech-to-Text | $30-50 |
| Vertex AI (Gemini) | $50-100 |
| Cloud Storage | $5-10 |
| BigQuery | $10-20 |
| **총계** | **$180-315** |

## 📄 라이선스

MIT License

## 🤝 기여

Pull Request와 Issue는 언제나 환영합니다!

---

**Made with ❤️ for real-time knowledge extraction**
