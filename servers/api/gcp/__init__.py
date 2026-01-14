"""
GCP 서비스 모듈
Google Cloud Platform 서비스 통합
"""

from .speech_to_text import CloudSpeechToText, get_speech_client
from .vertex_ai import VertexAIClient, get_vertex_client
from .storage import CloudStorageClient, get_storage_client
from .bigquery_client import BigQueryClient, get_bigquery_client
from .feedback import FeedbackManager, get_feedback_manager

__all__ = [
    "CloudSpeechToText",
    "get_speech_client",
    "VertexAIClient",
    "get_vertex_client",
    "CloudStorageClient",
    "get_storage_client",
    "BigQueryClient",
    "get_bigquery_client",
    "FeedbackManager",
    "get_feedback_manager",
]

