# 데스크톱 앱 배포 가이드

Electron 데스크톱 애플리케이션을 빌드하고 GCP에 배포하는 방법입니다.

## 로컬 빌드

### 1. 환경 변수 설정

```bash
cd apps/desktop

# .env.production 파일 생성
cat > .env.production << EOF
VITE_WS_URL=wss://knowledge-graph-api-xxxxx-xx.a.run.app/ws
EOF
```

### 2. 빌드 실행

```bash
# 의존성 설치
npm ci

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

