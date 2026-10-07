# DocChat Production Deployment Guide

This manual covers production deployment strategies for **DocChat**, from local containerization to multi-cloud hosting.

---

## 🏗️ 1. Architecture & Production Hardening Overview

DocChat is architected with enterprise-grade production safeguards:
- **Non-Root Container Security:** Runs as non-privileged `appuser` (UID 1000).
- **Pre-Baked Embedding Model:** SentenceTransformer model is downloaded during image build, eliminating runtime startup cold-starts.
- **Persistent Volume Mounts:** ChromaDB vector storage and conversation JSONs are isolated in Docker volumes.
- **XSRF & Upload Safeguards:** Streamlit configured with XSRF protection and 50MB file size limit.
- **Rate-Limiting & Auto-Backoff:** 60 RPM with exponential retry backoff on API throttle.
- **Multi-Tenant Isolation:** Session-based tenant sandboxing prevents cross-tenant data leakage.

---

## 🐳 2. One-Click Docker Deployment (Recommended)

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/) installed.

### Steps
1. **Clone the repository:**
   ```bash
   git clone https://github.com/yashtaksale/rag-document-chatbot.git
   cd rag-document-chatbot
   ```

2. **Configure your environment:**
   ```bash
   cp .env.example .env
   # Open .env and add your GROQ_API_KEY
   ```

3. **Build and start the container:**
   ```bash
   docker compose up --build -d
   ```

4. **Verify container health:**
   ```bash
   docker compose ps
   docker compose logs -f
   ```
   Access the app at: `http://localhost:8501`

5. **Stop the container:**
   ```bash
   docker compose down
   ```

---

## 💻 3. Bare-Metal / Local Production Server

### Windows
Run the 1-click batch script:
```cmd
start.bat
```

### Linux / macOS
Make executable and run:
```bash
chmod +x start.sh
./start.sh
```

### Manual CLI Execution
```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run system diagnostic healthcheck
python -m backend.healthcheck

# 3. Launch Streamlit in production mode
streamlit run app.py --server.port=8501 --server.address=0.0.0.0
```

---

## 🤗 4. Deploying to Hugging Face Spaces (Free Cloud Hosting)

1. Create a new Space on [huggingface.co/spaces](https://huggingface.co/spaces) $\to$ Select **Streamlit** SDK or **Docker** SDK.
2. In **Settings $\to$ Variables and secrets**, add:
   - `GROQ_API_KEY`: Your Groq API key (`gsk_...`)
   - `APP_ENV`: `production`
3. Push your repository code to the Hugging Face Space Git repository:
   ```bash
   git remote add space https://huggingface.co/spaces/YOUR_USERNAME/DocChat
   git push space main
   ```
4. Hugging Face will automatically build the container and provide a public HTTPS URL.

---

## ☁️ 5. Deploying to Streamlit Community Cloud

1. Push your code to GitHub.
2. Log into [share.streamlit.io](https://share.streamlit.io) and click **New app**.
3. Select your repository, branch `main`, and main file path `app.py`.
4. Under **Advanced settings $\to$ Secrets**, paste:
   ```toml
   GROQ_API_KEY = "gsk_your_actual_groq_key"
   ```
5. Click **Deploy!**

---

## 🐧 6. Deploying to AWS EC2 / DigitalOcean / Render

1. Launch an Ubuntu 22.04 / 24.04 VM (minimum 2 vCPU, 4GB RAM).
2. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker ubuntu
   ```
3. Clone repo, set `.env`, and run `docker compose up -d`.
4. (Optional) Set up Nginx reverse proxy with SSL via Let's Encrypt:
   ```nginx
   server {
       server_name docchat.yourdomain.com;
       location / {
           proxy_pass http://127.0.0.1:8501;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

---

## 🩺 7. Production Health & Monitoring

Run the automated healthcheck anytime to verify system status:
```bash
python -m backend.healthcheck
```
**Expected Output:**
```text
============================================================
[*] DocChat Production Health Check & Diagnostics
============================================================

[1/5] Checking Environment & Groq API Key...
  [PASS] GROQ_API_KEY present (Prefix: gsk_... Length: 56)

[2/5] Initializing Embedding Model (all-MiniLM-L6-v2)...
  [PASS] Embedding model loaded in 4.96s (Dim: 384, Norm: 1.0000)

[3/5] Verifying ChromaDB Storage (./chroma_db)...
  [PASS] ChromaDB connected successfully! (Active chunks in DB: 0)

[4/5] Testing Document Extraction Parsers...
  [PASS] Parsers (pypdf, python-docx, text-sanitizer) ready!

[5/5] Testing Live Groq API Connectivity (openai/gpt-oss-20b)...
  [PASS] Groq API online! Response: 'Pong.' (Model: openai/gpt-oss-20b)

============================================================
DIAGNOSTIC SUMMARY: 5/5 Checks Passed
============================================================
[SUCCESS] System status: 100% PRODUCTION READY & HEALTHY
```
