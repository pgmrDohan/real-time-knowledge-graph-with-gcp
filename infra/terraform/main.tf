# Terraform 구성
# 실시간 지식 그래프 GCP 인프라

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  # 백엔드 설정 (GCS)
  backend "gcs" {
    bucket = "YOUR_TERRAFORM_STATE_BUCKET"
    prefix = "knowledge-graph/state"
  }
}

# Provider 설정
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ==============================================
# VPC 네트워크
# ==============================================

resource "google_compute_network" "main" {
  name                    = "knowledge-graph-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id
}

resource "google_compute_subnetwork" "main" {
  name          = "knowledge-graph-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.main.id
  project       = var.project_id

  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "services-range"
    ip_cidr_range = "10.1.0.0/24"
  }

  secondary_ip_range {
    range_name    = "pods-range"
    ip_cidr_range = "10.2.0.0/20"
  }
}

# VPC Connector (Cloud Run → VPC)
resource "google_vpc_access_connector" "connector" {
  name          = "kg-vpc-connector1"
  region        = var.region
  project       = var.project_id
  network       = google_compute_network.main.name
  ip_cidr_range = "10.8.0.0/28"

  min_instances = 2
  max_instances = 10

  machine_type = "e2-micro"
}

# ==============================================
# Private Service Connection (Memorystore용)
# ==============================================

resource "google_compute_global_address" "private_ip_range" {
  name          = "knowledge-graph-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
  project       = var.project_id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# ==============================================
# Memorystore (Redis)
# ==============================================

resource "google_redis_instance" "main" {
  name               = "knowledge-graph-redis"
  tier               = var.environment == "prod" ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.environment == "prod" ? 5 : 1
  region             = var.region
  project            = var.project_id

  authorized_network = google_compute_network.main.id

  redis_version     = "REDIS_7_0"
  display_name      = "Knowledge Graph Redis"

  auth_enabled = true

  transit_encryption_mode = "SERVER_AUTHENTICATION"

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 2
        minutes = 0
      }
    }
  }

  depends_on = [google_service_networking_connection.private_vpc_connection]

  labels = {
    environment = var.environment
    service     = "knowledge-graph"
  }
}

# ==============================================
# Cloud Storage
# ==============================================

resource "google_storage_bucket" "data" {
  name          = "${var.project_id}-knowledge-graph-data"
  location      = var.region
  project       = var.project_id
  force_destroy = var.environment != "prod"

  uniform_bucket_level_access = true

  versioning {
    enabled = var.environment == "prod"
  }

  lifecycle_rule {
    condition {
      age = 90  # 90일 후
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365  # 1년 후
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  labels = {
    environment = var.environment
    service     = "knowledge-graph"
  }
}

# ==============================================
# BigQuery
# ==============================================

resource "google_bigquery_dataset" "main" {
  dataset_id    = "knowledge_graph"
  friendly_name = "Knowledge Graph Dataset"
  description   = "실시간 지식 그래프 데이터"
  location      = var.region
  project       = var.project_id

  default_table_expiration_ms = var.environment == "prod" ? null : 7776000000  # 90일 (dev)

  labels = {
    environment = var.environment
    service     = "knowledge-graph"
  }
}

# 세션 이벤트 테이블
resource "google_bigquery_table" "session_events" {
  dataset_id = google_bigquery_dataset.main.dataset_id
  table_id   = "session_events"
  project    = var.project_id

  time_partitioning {
    type  = "DAY"
    field = "timestamp"
  }

  schema = jsonencode([
    {
      name = "session_id"
      type = "STRING"
      mode = "REQUIRED"
    },
    {
      name = "event_type"
      type = "STRING"
      mode = "REQUIRED"
    },
    {
      name = "event_data"
      type = "STRING"
      mode = "NULLABLE"
    },
    {
      name = "timestamp"
      type = "TIMESTAMP"
      mode = "REQUIRED"
    }
  ])
}

# 추출 결과 테이블
resource "google_bigquery_table" "extraction_results" {
  dataset_id = google_bigquery_dataset.main.dataset_id
  table_id   = "extraction_results"
  project    = var.project_id

  time_partitioning {
    type  = "DAY"
    field = "timestamp"
  }

  schema = jsonencode([
    {
      name = "session_id"
      type = "STRING"
      mode = "REQUIRED"
    },
    {
      name = "text_input"
      type = "STRING"
      mode = "NULLABLE"
    },
    {
      name = "entities_count"
      type = "INTEGER"
      mode = "REQUIRED"
    },
    {
      name = "relations_count"
      type = "INTEGER"
      mode = "REQUIRED"
    },
    {
      name = "processing_time_ms"
      type = "INTEGER"
      mode = "REQUIRED"
    },
    {
      name = "entities_json"
      type = "STRING"
      mode = "NULLABLE"
    },
    {
      name = "relations_json"
      type = "STRING"
      mode = "NULLABLE"
    },
    {
      name = "timestamp"
      type = "TIMESTAMP"
      mode = "REQUIRED"
    }
  ])
}

# 사용자 피드백 테이블
resource "google_bigquery_table" "user_feedback" {
  dataset_id = google_bigquery_dataset.main.dataset_id
  table_id   = "user_feedback"
  project    = var.project_id

  time_partitioning {
    type  = "DAY"
    field = "timestamp"
  }

  schema = jsonencode([
    {
      name = "session_id"
      type = "STRING"
      mode = "REQUIRED"
    },
    {
      name = "rating"
      type = "INTEGER"
      mode = "REQUIRED"
    },
    {
      name = "comment"
      type = "STRING"
      mode = "NULLABLE"
    },
    {
      name = "graph_version"
      type = "INTEGER"
      mode = "REQUIRED"
    },
    {
      name = "entities_count"
      type = "INTEGER"
      mode = "REQUIRED"
    },
    {
      name = "relations_count"
      type = "INTEGER"
      mode = "REQUIRED"
    },
    {
      name = "audio_gcs_uri"
      type = "STRING"
      mode = "NULLABLE"
    },
    {
      name = "graph_gcs_uri"
      type = "STRING"
      mode = "NULLABLE"
    },
    {
      name = "timestamp"
      type = "TIMESTAMP"
      mode = "REQUIRED"
    }
  ])
}

# ==============================================
# Cloud Run 서비스 계정
# ==============================================

resource "google_service_account" "cloud_run" {
  account_id   = "knowledge-graph-api"
  display_name = "Knowledge Graph API Service Account"
  project      = var.project_id
}

# IAM 역할 부여
resource "google_project_iam_member" "cloud_run_roles" {
  for_each = toset([
    "roles/aiplatform.user",           # Vertex AI
    "roles/speech.client",              # Cloud Speech-to-Text
    "roles/storage.objectAdmin",        # Cloud Storage
    "roles/bigquery.dataEditor",        # BigQuery
    "roles/redis.editor",               # Memorystore
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ==============================================
# 방화벽 규칙
# ==============================================

resource "google_compute_firewall" "allow_internal" {
  name    = "knowledge-graph-allow-internal"
  network = google_compute_network.main.name
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["6378"]  # Redis
  }

  # VPC 커넥터 IP 범위와 전체 내부 네트워크 허용
  # Cloud Run은 태그를 사용하지 않으므로 target_tags 제거
  source_ranges = [
    "10.0.0.0/8",      # 전체 내부 네트워크
    "10.8.0.0/28",     # VPC 커넥터 IP 범위
  ]
  # target_tags 제거 - Cloud Run은 태그를 사용하지 않음
}

resource "google_compute_firewall" "deny_all_egress" {
  name      = "knowledge-graph-deny-all-egress"
  network   = google_compute_network.main.name
  project   = var.project_id
  direction = "EGRESS"
  priority  = 65535

  deny {
    protocol = "all"
  }

  destination_ranges = ["0.0.0.0/0"]
  target_tags        = ["restricted"]
}

resource "google_compute_firewall" "allow_google_apis" {
  name      = "knowledge-graph-allow-google-apis"
  network   = google_compute_network.main.name
  project   = var.project_id
  direction = "EGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  destination_ranges = ["199.36.153.8/30"]  # Private Google Access
  # target_tags 제거 - Cloud Run은 태그를 사용하지 않음
}

# ==============================================
# 출력값
# ==============================================

output "vpc_network" {
  value = google_compute_network.main.name
}

output "vpc_connector" {
  value = google_vpc_access_connector.connector.name
}

output "redis_host" {
  value     = google_redis_instance.main.host
  sensitive = true
}

output "redis_port" {
  value = google_redis_instance.main.port
}

output "redis_auth_string" {
  value     = google_redis_instance.main.auth_string
  sensitive = true
}

output "storage_bucket" {
  value = google_storage_bucket.data.name
}

output "bigquery_dataset" {
  value = google_bigquery_dataset.main.dataset_id
}

output "service_account_email" {
  value = google_service_account.cloud_run.email
}

