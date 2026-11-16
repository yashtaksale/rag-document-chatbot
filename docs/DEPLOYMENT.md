# DocChat Production Deployment Guide (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Last Updated:** October 2026  

This guide provides end-to-end instructions for deploying DocChat in development, staging, and enterprise production environments.

---

## 🏗️ 1. Architecture & Security Overview

DocChat v2.0 is structured as a decoupled two-tier stack:
1. **Frontend Service**: Next.js 16 (React 19, TypeScript, Tailwind CSS v4) on **port 3001**.
2. **Backend Service**: FastAPI (Uvicorn, Starlette, SSE) on **port 8001**.

### Enterprise Hardening Features
- **Non-Root Container Execution**: The backend container runs as unprivileged user `appuser` (UID/GID 1000).
- **Pre-Baked Embedding Weights**: The `all-MiniLM-L6-v2` SentenceTransformer model is downloaded and cached during container build, preventing cold-start delays.
- **Persistent Volume Isolation**: Separate Docker volumes for ChromaDB vector embeddings (`docchat_chroma_storage`), SQLite authentication (`docchat_data_storage`), and chat logs (`docchat_conversations_storage`).
- **SSE Streaming Optimization**: Real-time token streaming with `X-Accel-Buffering: no` and chunked transfer encoding.
- **Defense in Depth**: In-memory sliding-window rate limiters, 11-pattern regex prompt injection filtering, and PBKDF2-HMAC-SHA256 password security.

---

## 🐳 2. Docker Compose Deployment (Recommended)

### Prerequisites
- [Docker Engine](https://docs.docker.com/engine/install/) (v24.0+)
- [Docker Compose](https://docs.docker.com/compose/) (v2.20+)

### Step-by-Step Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yashtaksale/rag-document-chatbot.git
   cd rag-document-chatbot
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure:
   ```env
   GROQ_API_KEY=gsk_your_actual_groq_api_key
   ENVIRONMENT=production
   REQUIRE_AUTH=false
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001
   NEXT_PUBLIC_API_URL=http://localhost:8001
   ```

3. **Build and Launch the Services:**
   ```bash
   docker compose up --build -d
   ```

4. **Verify Health & Logs:**
   ```bash
   # Check container status
   docker compose ps

   # Tail backend logs
   docker compose logs -f api

   # Tail frontend logs
   docker compose logs -f web
   ```

5. **Access the Application:**
   - Web Application: `http://localhost:3001`
   - FastAPI Health Check: `http://localhost:8001/api/health`

6. **Stopping the Stack:**
   ```bash
   docker compose down
   ```

---

## 💻 3. Bare-Metal & Local Production Setup

### Windows Launch (1-Click)
Run the automated launcher:
```cmd
start.bat
```
*The script checks virtual environment status, executes `backend.healthcheck`, spawns the FastAPI backend minimized on port 8001, launches the Next.js web application on port 3001, and opens your default browser.*

### Linux / macOS Launch (1-Click)
```bash
chmod +x start.sh
./start.sh
```

### Manual CLI Execution (Development / Debugging)

#### Terminal 1 — Backend (FastAPI)
```bash
# Activate virtual environment
python -m venv venv
source venv/bin/activate  # Or: venv\Scripts\activate on Windows

# Install Python requirements
pip install -r requirements.txt

# Run diagnostic verification
python -m backend.healthcheck

# Start API server on port 8001
uvicorn backend.api_server:app --host 127.0.0.1 --port 8001 --reload
```

#### Terminal 2 — Frontend (Next.js)
```bash
# Install Node dependencies
npm install

# Start Next.js development server on port 3001
npm run dev
```

---

## 🌐 4. Production Reverse Proxy Configuration (Nginx)

For public production hosting (e.g., AWS EC2, DigitalOcean, Hetzner, Linode), place Nginx in front of both services to handle SSL termination, caching, and SSE streaming:

```nginx
server {
    listen 80;
    server_name docchat.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name docchat.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/docchat.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/docchat.yourdomain.com/privkey.pem;

    client_max_body_size 25M;

    # 1. Frontend Web Application (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 2. Backend API & Server-Sent Events (FastAPI)
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Critical SSE streaming settings:
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        chunked_transfer_encoding on;
    }
}
```

---

## 🩺 5. System Health Check & Diagnostics

The CLI diagnostic suite tests all 5 subsystem layers:
```bash
python -m backend.healthcheck
```

### Sample Diagnostic Output
```text
============================================================
[*] DocChat Production Health Check & Diagnostics
============================================================

[1/5] Checking Environment & Groq API Key...
  [PASS] GROQ_API_KEY present (Prefix: gsk_... Length: 56)

[2/5] Initializing Embedding Model (all-MiniLM-L6-v2)...
  [PASS] Embedding model loaded in 2.34s (Dim: 384, Norm: 1.0000)

[3/5] Verifying ChromaDB Storage (./chroma_db)...
  [PASS] ChromaDB connected successfully! (Active chunks in DB: 54)

[4/5] Testing Document Extraction Parsers...
  [PASS] Parsers (pypdf, python-docx, text-sanitizer) ready!

[5/5] Testing Live Groq API Connectivity (qwen/qwen3.8-27b)...
  [PASS] Groq API online! Response: 'pong' (Model: qwen/qwen3.8-27b)

============================================================
DIAGNOSTIC SUMMARY: 5/5 Checks Passed
============================================================
[SUCCESS] System status: 100% PRODUCTION READY & HEALTHY
```

---

## ⚙️ 6. Environment Variables Reference

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | *(None)* | **Required.** Authentication key for Groq Cloud LLM inference. |
| `DOCCHAT_MODEL` | `qwen/qwen3.8-27b` | Primary generation model on Groq. |
| `DOCCHAT_EMBEDDER` | `all-MiniLM-L6-v2` | SentenceTransformer embedding model. |
| `DOCCHAT_TOP_K` | `5` | Number of chunks retrieved per query. |
| `DOCCHAT_SIMILARITY_THRESHOLD` | `0.10` | Cosine similarity retrieval gate threshold. |
| `DOCCHAT_MAX_RPM` | `30` | Maximum queries per minute rate limit. |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Permitted CORS origins for FastAPI. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8001` | Backend URL accessed by the Next.js client. |
| `REQUIRE_AUTH` | `false` | When `true`, enforces JWT bearer tokens on all API endpoints. |
| `ENVIRONMENT` | `development` | Set to `production` in live environments. |
| `ALLOW_DEMO_SEEDING` | `false` | When `true`, automatically seeds initial demo accounts. |
