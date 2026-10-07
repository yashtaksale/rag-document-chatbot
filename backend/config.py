"""DocChat System Configuration.

All parameters are environment-configurable with secure, production-ready defaults.
"""

import os

# ── Embedding ────────────────────────────────────────────────────────────────
EMBEDDER_NAME = os.getenv("DOCCHAT_EMBEDDER", "all-MiniLM-L6-v2")

# ── Chunking ─────────────────────────────────────────────────────────────────
CHUNK_SIZE = int(os.getenv("DOCCHAT_CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("DOCCHAT_CHUNK_OVERLAP", "50"))

# ── Retrieval ─────────────────────────────────────────────────────────────────
TOP_K = int(os.getenv("DOCCHAT_TOP_K", "5"))
SIMILARITY_THRESHOLD = float(os.getenv("DOCCHAT_SIMILARITY_THRESHOLD", "0.10"))

# ── LLM temperatures ──────────────────────────────────────────────────────────
TEMPERATURE_ROUTING = float(os.getenv("DOCCHAT_TEMP_ROUTING", "0.0"))
TEMPERATURE_GRADING = float(os.getenv("DOCCHAT_TEMP_GRADING", "0.0"))
TEMPERATURE_REWRITE = float(os.getenv("DOCCHAT_TEMP_REWRITE", "0.2"))
TEMPERATURE_DIRECT = float(os.getenv("DOCCHAT_TEMP_DIRECT", "0.3"))
TEMPERATURE_ANSWER = float(os.getenv("DOCCHAT_TEMP_ANSWER", "0.1"))
TEMPERATURE_EVAL = float(os.getenv("DOCCHAT_TEMP_EVAL", "0.0"))
TEMPERATURE_FOLLOWUPS = float(os.getenv("DOCCHAT_TEMP_FOLLOWUPS", "0.3"))

# ── Model ─────────────────────────────────────────────────────────────────────
# Default to active high-capacity model (qwen/qwen3.8-27b)
MODEL_NAME = os.getenv("DOCCHAT_MODEL", "qwen/qwen3.8-27b")

# ── API timeouts (seconds) ────────────────────────────────────────────────────
API_TIMEOUT = int(os.getenv("DOCCHAT_API_TIMEOUT", "30"))

# ── Paths ─────────────────────────────────────────────────────────────────────
CHROMA_DB_PATH = os.getenv("DOCCHAT_CHROMA_PATH", "./chroma_db")
CHROMA_COLLECTION_NAME = os.getenv("DOCCHAT_CHROMA_COLLECTION", "documents")

# ── Rate limiting ─────────────────────────────────────────────────────────────
# Standardized to 30 queries per minute to protect against free-tier rate exhaustion
MAX_QUERIES_PER_MINUTE = int(os.getenv("DOCCHAT_MAX_RPM", "30"))
AGENTIC_CALL_THRESHOLD = int(os.getenv("DOCCHAT_AGENTIC_CALL_THRESHOLD", "5"))
