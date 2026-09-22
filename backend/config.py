import os

# ── Embedding ────────────────────────────────────────────────────────────────
EMBEDDER_NAME = "all-MiniLM-L6-v2"

# ── Chunking ─────────────────────────────────────────────────────────────────
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

# ── Retrieval ─────────────────────────────────────────────────────────────────
TOP_K = 5
SIMILARITY_THRESHOLD = 0.10

# ── LLM temperatures ──────────────────────────────────────────────────────────
TEMPERATURE_ROUTING = 0.0
TEMPERATURE_GRADING = 0.0
TEMPERATURE_REWRITE = 0.2
TEMPERATURE_DIRECT = 0.3
TEMPERATURE_ANSWER = 0.1
TEMPERATURE_EVAL = 0.0
TEMPERATURE_FOLLOWUPS = 0.3

# ── Model ─────────────────────────────────────────────────────────────────────
MODEL_NAME = "openai/gpt-oss-20b"

# ── API timeouts (seconds) ────────────────────────────────────────────────────
API_TIMEOUT = 30

# ── Paths ─────────────────────────────────────────────────────────────────────
CHROMA_DB_PATH = "./chroma_db"
CHROMA_COLLECTION_NAME = "documents"

# ── Rate limiting ─────────────────────────────────────────────────────────────
MAX_QUERIES_PER_MINUTE = 20
AGENTIC_CALL_THRESHOLD = 5  # warn when a thinking-mode query triggers this many API calls
