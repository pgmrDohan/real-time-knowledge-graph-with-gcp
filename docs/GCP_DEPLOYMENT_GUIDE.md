# GCP 배포 가이드

이 문서는 실시간 지식 그래프 서비스를 Google Cloud Platform에 배포하는 방법을 설명합니다.

## 목차

1. [사전 요구사항](#사전-요구사항)
2. [GCP 프로젝트 설정](#gcp-프로젝트-설정)
3. [인프라 배포 (Terraform)](#인프라-배포-terraform)
4. [애플리케이션 배포](#애플리케이션-배포)
5. [보안 설정](#보안-설정)
6. [모니터링 설정](#모니터링-설정)
7. [비용 최적화](#비용-최적화)

---

## 사전 요구사항

### 도구 설치

```bash
# Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Terraform
# Windows: choco install terraform
# macOS: brew install terraform
# Linux: 
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

# Docker (Cloud Build 로컬 테스트용)
```

### GCP API 활성화

```bash
gcloud services enable \
    compute.googleapis.com \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    speech.googleapis.com \
    aiplatform.googleapis.com \
    storage.googleapis.com \
    bigquery.googleapis.com \
    redis.googleapis.com \
    vpcaccess.googleapis.com \
    servicenetworking.googleapis.com \
    secretmanager.googleapis.com
```

---

## GCP 프로젝트 설정

### 1. 프로젝트 생성 및 설정

```bash
# 프로젝트 생성
gcloud projects create YOUR_PROJECT_ID --name="Knowledge Graph"

# 프로젝트 설정
gcloud config set project YOUR_PROJECT_ID

# 빌링 계정 연결
gcloud billing accounts list
gcloud billing projects link YOUR_PROJECT_ID --billing-account=BILLING_ACCOUNT_ID
```

### 2. 서비스 계정 생성

```bash
# Cloud Build 서비스 계정 권한
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"

# Secret Manager 접근 권한 (Redis 비밀번호 사용 시 필요)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

---

## 인프라 배포 (Terraform)

### 1. Terraform 상태 저장용 버킷 생성

```bash
# Terraform 상태 저장용 GCS 버킷 생성
gsutil mb -l asia-northeast3 gs://YOUR_PROJECT_ID-terraform-state
gsutil versioning set on gs://YOUR_PROJECT_ID-terraform-state
```

### 2. Terraform 변수 설정

```bash
cd infra/terraform

# terraform.tfvars 생성
cp terraform.tfvars.example terraform.tfvars

# 값 편집
cat > terraform.tfvars << EOF
project_id  = "YOUR_PROJECT_ID"
region      = "asia-northeast3"
environment = "prod"
EOF
```

### 3. main.tf 수정

`infra/terraform/main.tf`에서 백엔드 버킷 이름을 수정합니다:

```hcl
backend "gcs" {
  bucket = "YOUR_PROJECT_ID-terraform-state"
  prefix = "knowledge-graph/state"
}
```

### 4. Terraform 실행

```bash
# 초기화
terraform init

# 계획 확인
terraform plan

# 적용
terraform apply
```

### 5. 출력값 확인

```bash
# Redis 호스트 확인
terraform output redis_host

# VPC 커넥터 확인
terraform output vpc_connector

# Storage 버킷 확인
terraform output storage_bucket
```

---

## 애플리케이션 배포

### 1. Cloud Build 변수 설정

`infra/cloudbuild/cloudbuild.yaml`에서 substitutions 섹션을 프로젝트에 맞게 수정:

```yaml
substitutions:
  _SERVICE_NAME: knowledge-graph-api
  _REGION: asia-northeast3
  _VPC_CONNECTOR: knowledge-graph-vpc-connector
  _REDIS_HOST: "10.x.x.x"  # terraform output redis_host 값
  _GCS_BUCKET: "your-project-id-knowledge-graph-data"
  _BQ_DATASET: knowledge_graph
```

### 2. 수동 배포 (최초 배포 또는 테스트용)

```bash
# Docker 이미지 빌드
docker build -t gcr.io/YOUR_PROJECT_ID/knowledge-graph-api:latest \
    -f servers/api/Dockerfile servers/api

# Container Registry에 푸시
docker push gcr.io/YOUR_PROJECT_ID/knowledge-graph-api:latest

# Cloud Run 배포 (Redis 비밀번호는 Secret Manager 또는 환경 변수로 설정)
# 방법 1: Secret Manager 사용 (권장)
gcloud run deploy knowledge-graph-api \
    --image gcr.io/YOUR_PROJECT_ID/knowledge-graph-api:latest \
    --region asia-northeast3 \
    --platform managed \
    --allow-unauthenticated \
    --vpc-connector knowledge-graph-vpc-connector \
    --vpc-egress private-ranges-only \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --concurrency 80 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "GCP_PROJECT_ID=YOUR_PROJECT_ID,GCP_REGION=asia-northeast3,REDIS_HOST=10.x.x.x,GCS_BUCKET_NAME=bucket-name,BQ_DATASET_ID=knowledge_graph,VERTEX_AI_MODEL=gemini-2.5-flash,SPEECH_LANGUAGE_CODES=ko-KR,LOG_FORMAT=json,DEBUG=false,ENABLE_FEEDBACK=true" \
    --update-secrets="REDIS_PASSWORD=redis-auth:latest"

# 방법 2: 환경 변수로 직접 설정
# terraform output redis_auth_string 으로 비밀번호 확인 후
gcloud run deploy knowledge-graph-api \
    --image gcr.io/YOUR_PROJECT_ID/knowledge-graph-api:latest \
    --region asia-northeast3 \
    --platform managed \
    --allow-unauthenticated \
    --vpc-connector knowledge-graph-vpc-connector \
    --vpc-egress private-ranges-only \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --concurrency 80 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "GCP_PROJECT_ID=YOUR_PROJECT_ID,GCP_REGION=asia-northeast3,REDIS_HOST=10.x.x.x,REDIS_PASSWORD=YOUR_REDIS_AUTH_STRING,GCS_BUCKET_NAME=bucket-name,BQ_DATASET_ID=knowledge_graph,VERTEX_AI_MODEL=gemini-2.5-flash,SPEECH_LANGUAGE_CODES=ko-KR,LOG_FORMAT=json,DEBUG=false,ENABLE_FEEDBACK=true"
```

### 3. Cloud Build 트리거 설정 (CI/CD)

**사전 설정 필요**: Cloud Build에서 Secret Manager를 사용하려면 다음을 먼저 설정하세요:

```bash
# 1. Redis 비밀번호를 Secret Manager에 저장
terraform output redis_auth_string
echo -n "YOUR_REDIS_AUTH_STRING" | gcloud secrets create redis-auth --data-file=-

# 2. Cloud Build 서비스 계정에 Secret Manager 접근 권한 부여 (이미 위에서 설정했다면 생략)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

```bash
# GitHub 저장소 연결 (콘솔에서 수행 권장)
# Cloud Build → Triggers → Connect Repository

# 트리거 생성
gcloud builds triggers create github \
    --repo-owner="YOUR_GITHUB_USERNAME" \
    --repo-name="real-time-knowledge-graph-with-gcp" \
    --branch-pattern="^main$" \
    --build-config="infra/cloudbuild/cloudbuild.yaml" \
    --substitutions="_REDIS_HOST=10.x.x.x,_GCS_BUCKET=bucket-name"
```

---

## 보안 설정

### 1. VPC 네트워크 보안

Terraform에서 이미 다음 보안 설정이 적용됩니다:

- **VPC 커넥터**: Cloud Run → Private 리소스 접근
- **Private Service Connection**: Redis (Memorystore) 비공개 접근
- **방화벽 규칙**:
  - Internal 통신만 허용 (10.0.0.0/8)
  - Google API만 외부 Egress 허용

### 2. IAM 최소 권한 원칙

서비스 계정에 필요한 최소 권한만 부여됩니다:

| 역할 | 용도 |
|------|------|
| `roles/aiplatform.user` | Vertex AI Gemini 호출 |
| `roles/speech.client` | Cloud Speech-to-Text |
| `roles/storage.objectAdmin` | Cloud Storage 읽기/쓰기 |
| `roles/bigquery.dataEditor` | BigQuery 데이터 쓰기 |
| `roles/redis.editor` | Memorystore 접근 |

### 3. Redis 비밀번호 설정

Memorystore Redis는 인증이 활성화되어 있으므로 비밀번호가 필요합니다.

#### 방법 1: Secret Manager 사용 (권장)

```bash
# 1. Terraform에서 Redis 비밀번호 확인
terraform output redis_auth_string

# 2. Secret Manager에 비밀번호 저장
echo -n "YOUR_REDIS_AUTH_STRING" | gcloud secrets create redis-auth --data-file=-

# 3. Cloud Run 배포 시 Secret 참조
gcloud run deploy knowledge-graph-api \
    --image gcr.io/YOUR_PROJECT_ID/knowledge-graph-api:latest \
    --region asia-northeast3 \
    --platform managed \
    --allow-unauthenticated \
    --vpc-connector knowledge-graph-vpc-connector \
    --vpc-egress private-ranges-only \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --concurrency 80 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "GCP_PROJECT_ID=YOUR_PROJECT_ID,GCP_REGION=asia-northeast3,REDIS_HOST=10.x.x.x,GCS_BUCKET_NAME=bucket-name,BQ_DATASET_ID=knowledge_graph,VERTEX_AI_MODEL=gemini-2.5-flash,SPEECH_LANGUAGE_CODES=ko-KR,LOG_FORMAT=json,DEBUG=false,ENABLE_FEEDBACK=true" \
    --update-secrets="REDIS_PASSWORD=redis-auth:latest"
```

#### 방법 2: 환경 변수로 직접 설정 (간단하지만 덜 안전)

```bash
# Terraform에서 Redis 비밀번호 확인
terraform output redis_auth_string

# Cloud Run 배포 시 환경 변수로 직접 설정
gcloud run deploy knowledge-graph-api \
    --image gcr.io/YOUR_PROJECT_ID/knowledge-graph-api:latest \
    --region asia-northeast3 \
    --platform managed \
    --allow-unauthenticated \
    --vpc-connector knowledge-graph-vpc-connector \
    --vpc-egress private-ranges-only \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --concurrency 80 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "GCP_PROJECT_ID=YOUR_PROJECT_ID,GCP_REGION=asia-northeast3,REDIS_HOST=10.x.x.x,REDIS_PASSWORD=YOUR_REDIS_AUTH_STRING,GCS_BUCKET_NAME=bucket-name,BQ_DATASET_ID=knowledge_graph,VERTEX_AI_MODEL=gemini-2.5-flash,SPEECH_LANGUAGE_CODES=ko-KR,LOG_FORMAT=json,DEBUG=false,ENABLE_FEEDBACK=true"
```

**참고**: Secret Manager를 사용하면 비밀번호가 환경 변수에 노출되지 않아 더 안전합니다.

### 4. Cloud Armor (DDoS 방지)

프로덕션 환경에서는 Cloud Armor 정책 추가 권장:

```bash
# 보안 정책 생성
gcloud compute security-policies create knowledge-graph-policy \
    --description "Security policy for Knowledge Graph API"

# 속도 제한 규칙 추가
gcloud compute security-policies rules create 1000 \
    --security-policy knowledge-graph-policy \
    --expression "true" \
    --action rate-based-ban \
    --rate-limit-threshold-count 100 \
    --rate-limit-threshold-interval-sec 60 \
    --ban-duration-sec 300 \
    --conform-action allow \
    --exceed-action deny-403
```

---

## 모니터링 설정

### 1. Cloud Logging

애플리케이션 로그는 자동으로 Cloud Logging에 수집됩니다.

로그 쿼리 예시:
```
resource.type="cloud_run_revision"
resource.labels.service_name="knowledge-graph-api"
severity>=ERROR
```

### 2. Cloud Monitoring 알림

```bash
# 에러율 알림 정책
gcloud monitoring policies create \
    --policy-from-file=monitoring/error-rate-policy.yaml

# 응답 시간 알림 정책
gcloud monitoring policies create \
    --policy-from-file=monitoring/latency-policy.yaml
```

### 3. 대시보드 생성

Cloud Console → Monitoring → Dashboards에서 커스텀 대시보드 생성:

- Cloud Run 요청 수
- 평균 응답 시간
- 에러율
- Redis 연결 수
- BigQuery 쿼리 수

---

## 비용 최적화

### 1. Cloud Run 설정 최적화

| 설정 | 개발 환경 | 프로덕션 환경 |
|------|-----------|---------------|
| `min-instances` | 0 | 1-2 |
| `max-instances` | 3 | 10-20 |
| `memory` | 1Gi | 2Gi |
| `cpu` | 1 | 2 |
| `concurrency` | 40 | 80 |

### 2. Memorystore 티어

| 환경 | 티어 | 메모리 |
|------|------|--------|
| 개발 | BASIC | 1GB |
| 프로덕션 | STANDARD_HA | 5GB+ |

### 3. BigQuery 파티셔닝

모든 테이블은 `timestamp` 필드로 일별 파티셔닝됩니다.
오래된 데이터 자동 삭제 설정:

```sql
ALTER TABLE `project.knowledge_graph.session_events`
SET OPTIONS (
  partition_expiration_days=90
)
```

### 4. Cloud Storage 수명주기

Terraform에서 자동 설정됨:
- 90일 후 → Nearline Storage
- 365일 후 → Coldline Storage

### 5. 예상 월별 비용 (서울 리전, 중간 사용량 기준)

| 서비스 | 예상 비용 |
|--------|----------|
| Cloud Run | $50-100 |
| Memorystore (Basic 1GB) | $35 |
| Cloud Speech-to-Text | $30-50 |
| Vertex AI (Gemini) | $50-100 |
| Cloud Storage | $5-10 |
| BigQuery | $10-20 |
| VPC/Network | $10-20 |
| **총계** | **$190-335** |

---

## 문제 해결

### Cloud Run 배포 실패

```bash
# 빌드 로그 확인
gcloud builds list --limit=5
gcloud builds log BUILD_ID

# 서비스 로그 확인
gcloud run services logs read knowledge-graph-api --region=asia-northeast3
```

### Redis 연결 실패

1. VPC 커넥터가 올바르게 설정되었는지 확인
2. Redis 호스트 IP가 올바른지 확인
3. 방화벽 규칙 확인

```bash
# VPC 커넥터 상태
gcloud compute networks vpc-access connectors describe knowledge-graph-vpc-connector \
    --region=asia-northeast3

# Redis 인스턴스 상태
gcloud redis instances describe knowledge-graph-redis --region=asia-northeast3
```

### Vertex AI 권한 오류

```bash
# 서비스 계정 권한 확인
gcloud projects get-iam-policy YOUR_PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:knowledge-graph-api@"
```

---

## 다음 단계

1. [모니터링 대시보드 커스터마이징](./MONITORING.md)
2. [부하 테스트 가이드](./LOAD_TESTING.md)
3. [재해 복구 계획](./DISASTER_RECOVERY.md)

