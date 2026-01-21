# 데스크톱 앱 배포 가이드

Electron 데스크톱 애플리케이션을 빌드하고 GCP에 배포하는 방법입니다.

## 주요 기능

데스크톱 앱에서 제공하는 기능:

| 기능 | 설명 |
|------|------|
| 🎤 실시간 오디오 캡처 | 시스템 오디오를 캡처하여 STT 처리 |
| 📊 지식 그래프 시각화 | React Flow + Dagre 레이아웃 |
| 🌐 다국어 번역 | 7개 언어 지원 (한/영/일/중/스/프/독) |
| 📤 내보내기 | PNG, PDF, Mermaid 형식 |
| ⭐ 피드백 | 1-5점 만족도 평가 |

## 로컬 빌드

### 1. 환경 변수 설정

```bash
cd apps/desktop

# .env.production 파일 생성
cat > .env.production << EOF
VITE_WS_URL=wss://knowledge-graph-api-xxxxx-xx.a.run.app/ws
EOF
```

### 2. 의존성 설치

```bash
npm ci
```

주요 의존성:

| 패키지 | 용도 |
|--------|------|
| `react` + `react-dom` | UI 렌더링 |
| `reactflow` | 그래프 시각화 |
| `dagre` | 그래프 레이아웃 |
| `zustand` | 상태 관리 |
| `framer-motion` | 애니메이션 |
| `html-to-image` | PNG 내보내기 |
| `jspdf` | PDF 내보내기 |
| `lucide-react` | 아이콘 |

### 3. 빌드 실행

```bash
# Electron 메인 프로세스 빌드
npm run build:electron

# Vite 빌드 (프로덕션 모드)
npm run build:vite

# Electron 앱 빌드
npm run build
```

빌드된 파일은 `apps/desktop/release/` 디렉토리에 생성됩니다.

## GCP Cloud Build를 통한 자동 빌드

### 1. Cloud Run URL 확인

```powershell
# Cloud Run 서비스 URL 확인
gcloud run services describe knowledge-graph-api `
    --region=asia-northeast3 `
    --format="value(status.url)"
```

### 2. Cloud Build 실행

```powershell
# Cloud Build로 빌드 및 배포
gcloud builds submit `
    --config=infra/cloudbuild/cloudbuild-desktop.yaml `
    --substitutions="_CLOUD_RUN_URL=https://YOUR-CLOUD-RUN-URL" `
    --tag=v2.0.0
```

### 3. 빌드된 파일 확인

```powershell
# Cloud Storage에 업로드된 파일 확인
gsutil ls -r gs://gknu-dohan-k764-knowledge-graph-data/desktop-app/

# 최신 버전 정보 확인
gsutil cat gs://gknu-dohan-k764-knowledge-graph-data/desktop-app/latest.json
```

## 수동 배포 (로컬 빌드 후)

### 1. 로컬에서 빌드

```powershell
cd apps/desktop

# 환경 변수 설정
$env:VITE_WS_URL="wss://knowledge-graph-api-xxxxx-xx.a.run.app/ws"

# 빌드
npm ci
npm run build:electron
npm run build:vite
npm run build
```

### 2. Cloud Storage에 업로드

```powershell
# 버전 태그 설정
$version = "v2.0.0"
$bucket = "gknu-dohan-k764-knowledge-graph-data"

# 빌드된 파일 업로드
gsutil -m cp -r release/* gs://$bucket/desktop-app/$version/

# 공개 읽기 권한 설정
gsutil acl ch -r -u AllUsers:R gs://$bucket/desktop-app/$version/

# 최신 버전 정보 업데이트
@"
{
  "version": "$version",
  "windows": {
    "installer": "Knowledge Graph Setup $version.exe",
    "url": "https://storage.googleapis.com/$bucket/desktop-app/$version/Knowledge Graph Setup $version.exe"
  },
  "buildDate": "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')"
}
"@ | Out-File -FilePath latest.json -Encoding utf8

gsutil cp latest.json gs://$bucket/desktop-app/latest.json
gsutil acl ch -u AllUsers:R gs://$bucket/desktop-app/latest.json
```

## 다운로드 링크

빌드 완료 후 다음 URL에서 다운로드 가능:

```
https://storage.googleapis.com/gknu-dohan-k764-knowledge-graph-data/desktop-app/latest.json
```

이 JSON 파일에서 최신 버전의 다운로드 URL을 확인할 수 있습니다.

## 앱 구조

### 컴포넌트 구조

```
src/
├── App.tsx                 # 메인 앱 컴포넌트
├── components/
│   ├── TitleBar.tsx        # 타이틀 바 (번역/내보내기 버튼)
│   ├── ControlPanel.tsx    # 오디오 캡처 컨트롤
│   ├── KnowledgeGraph.tsx  # React Flow 그래프
│   ├── TranscriptPanel.tsx # STT 결과 표시
│   ├── StatusBar.tsx       # 연결/처리 상태
│   ├── TranslateDialog.tsx # 번역 모달
│   ├── ExportDialog.tsx    # 내보내기 모달
│   ├── FeedbackDialog.tsx  # 피드백 모달
│   └── EntityNode.tsx      # 그래프 노드 컴포넌트
├── hooks/
│   ├── useWebSocket.ts     # WebSocket 통신
│   └── useAudioCapture.ts  # 오디오 캡처
└── store/
    └── graphStore.ts       # Zustand 상태 관리
```

### 상태 관리 (Zustand)

`graphStore.ts`에서 관리하는 상태:

| 상태 | 설명 |
|------|------|
| `graphState` | 엔티티/관계 데이터 |
| `nodes`, `edges` | React Flow 노드/엣지 |
| `processingStage` | 처리 단계 |
| `transcripts` | STT 결과 |
| `showTranslateDialog` | 번역 모달 표시 |
| `showExportDialog` | 내보내기 모달 표시 |
| `showFeedbackDialog` | 피드백 모달 표시 |
| `isTranslating` | 번역 중 상태 |

### 레이아웃 알고리즘

`graphStore.ts`의 `calculateDagreLayout` 함수:

1. **연결된 컴포넌트 찾기**: BFS로 클러스터 분리
2. **컴포넌트별 Dagre 적용**: 각 클러스터에 개별 레이아웃
3. **그리드 배치**: 컴포넌트들을 2-4열 그리드로 배치
4. **고립 노드 처리**: 연결 없는 노드는 별도 영역에 배치
5. **부드러운 전환**: 기존 위치와 새 위치를 보간

## 문제 해결

### 빌드 실패

```powershell
# 로그 확인
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```

### 환경 변수 확인

```powershell
# 빌드 시 환경 변수 확인
cd apps/desktop
cat .env.production
```

### WebSocket 연결 오류

- Cloud Run URL이 올바른지 확인
- `wss://` 프로토콜 사용 (HTTPS)
- CORS 설정 확인

### 내보내기 실패

PNG/PDF 내보내기가 실패하는 경우:

1. **빈 그래프**: 그래프에 노드가 없으면 내보내기 불가
2. **캔버스 크기**: 매우 큰 그래프는 메모리 제한으로 실패할 수 있음
3. **브라우저 권한**: 일부 브라우저에서 클립보드 접근 차단

### 번역 실패

- WebSocket 연결 상태 확인
- 서버 로그에서 Vertex AI 오류 확인
- `VERTEX_AI_LOCATION` 설정 확인 (모델 가용 리전)

## 개발 모드

```bash
cd apps/desktop

# 개발 서버 시작
npm run dev
```

개발 모드에서는:
- Vite HMR (Hot Module Replacement) 활성화
- Electron이 `http://localhost:5173`에 연결
- 환경 변수는 `.env` 파일에서 로드
