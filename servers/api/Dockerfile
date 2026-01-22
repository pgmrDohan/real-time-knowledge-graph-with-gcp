# Cloud Run용 Dockerfile
# Python 3.11 기반 FastAPI 서버

FROM python:3.11-slim

# 환경 변수 설정
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=8080

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 의존성 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 비루트 사용자 생성 및 전환
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health')" || exit 1

# Cloud Run은 PORT 환경 변수를 사용
EXPOSE ${PORT}

# 서버 실행
# WebSocket 안정성을 위한 설정:
# --ws-ping-interval: 서버→클라이언트 ping 간격 (20초)
# --ws-ping-timeout: ping 응답 대기 시간 (30초)
# --timeout-keep-alive: HTTP keep-alive 타임아웃 (120초)
# --ws-max-size: WebSocket 메시지 최대 크기 (16MB)
CMD exec uvicorn main:app \
    --host 0.0.0.0 \
    --port ${PORT} \
    --workers 1 \
    --ws-ping-interval 20 \
    --ws-ping-timeout 30 \
    --timeout-keep-alive 120 \
    --ws-max-size 16777216
