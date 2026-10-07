# =============================================================================
# DocChat Production Dockerfile (FastAPI RAG Backend)
# =============================================================================

FROM python:3.12-slim-bookworm as base

# 1. Set environment flags
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    HOME=/home/appuser

# 2. Install essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 3. Create non-root user for enterprise container security
RUN groupadd -r appuser && useradd -r -g appuser -d /home/appuser -m -s /bin/bash appuser

WORKDIR /app

# 4. Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# 5. Pre-bake the embedding model into the container image to eliminate startup cold-starts
USER appuser
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# 6. Copy application source code
USER root
COPY --chown=appuser:appuser . /app/

# 7. Ensure persistent directories exist and have proper permissions
RUN mkdir -p /app/chroma_db /app/conversations && \
    chown -R appuser:appuser /app/chroma_db /app/conversations /app

USER appuser

# 8. Expose FastAPI backend application port
EXPOSE 8001

# 9. Configure healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8001/api/health || exit 1

# 10. Default run command
ENTRYPOINT ["python", "-m", "uvicorn", "backend.api_server:app", "--host", "0.0.0.0", "--port", "8001"]

