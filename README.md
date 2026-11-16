# DocChat — Hallucination-Resistant RAG Document Chatbot (v2.0)

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![Next.js 16](https://img.shields.io/badge/Frontend-Next.js%2016-black.svg)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![ChromaDB](https://img.shields.io/badge/VectorDB-ChromaDB-orange.svg)](https://www.trychroma.com/)
[![Groq LPU](https://img.shields.io/badge/LLM%20Inference-Groq%20LPU-f55036.svg)](https://groq.com/)
[![Docker](https://img.shields.io/badge/Containers-Docker%20Compose-2496ed.svg)](https://www.docker.com/)

> **DocChat** is a production-grade, hallucination-resistant Retrieval-Augmented Generation (RAG) platform. It couples a high-performance **FastAPI** backend with an ultra-responsive **Next.js 16 / React 19** Claude/ChatGPT-style interface, enforcing strict document grounding, agentic self-correction, open knowledge filtering, and real-time claim-level hallucination audits.

---

## 🌟 Key Features

- 🛡️ **Zero-Hallucination Grounding**: Hard retrieval gating and strict system prompts enforce that the model answers **only** from uploaded documents and refuses queries outside the document corpus.
- 🧠 **Dual RAG Modes**:
  - **Simple Mode**: Low-latency vector similarity retrieval over ChromaDB for instant, fact-based document QA.
  - **Thinking Mode (Agentic RAG)**: Dynamic query routing, parallel LLM chunk grading, adaptive query rewriting, and self-correcting retrieval loops.
- 🔬 **Open Knowledge Filtering & Fusion (OKF)**: Proprietary knowledge engine performing token-level Jaccard deduplication, noise elimination, cross-source conflict detection, and provenance-tagged context fusion.
- 🕵️ **Two-Layer Hallucination Audit**:
  - Layer 1: Cosine similarity grounding metrics against retrieved context chunks.
  - Layer 2: LLM claim verification extracting individual factual statements, auditing support, and returning verbatim hallucination spans highlighted in the UI.
- 🔒 **Enterprise Authentication & Multi-Tenancy**:
  - PBKDF2-HMAC-SHA256 password hashing with cryptographically unique salts.
  - SQLite session store in WAL mode with automated TTL expiration cleanup.
  - Strict tenant isolation across ChromaDB vector namespaces (`where={"user_id": user_id}`) and user conversation stores.
- ⚡ **Real-Time Token & Thought Streaming**: Server-Sent Events (SSE) streaming token deltas, reasoning events, cited excerpts, and audit scores directly to the client.
- 🎨 **Modern Claude/ChatGPT Web UI**:
  - Built with Next.js 16, React 19, TypeScript, and Tailwind CSS v4.
  - Dark and light theme support, collapsible Document Vault modal, Markdown with KaTeX math rendering, and prompt queuing.
- 🐳 **Enterprise Containerization**: Dual-container Docker Compose architecture with pre-baked SentenceTransformer embedding weights to prevent startup cold-starts.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLIENT TIER (Browser @ :3001)                         │
│  Next.js 16 · React 19 · Zustand · Tailwind CSS v4 · KaTeX · SSE Client      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                      HTTP REST & SSE  │ /api/chat/stream
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND TIER (FastAPI @ :8001)                         │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────┐   │
│  │  Auth & Session Gate  │  │ Sliding-Window Limiter│  │  Regex Guard   │   │
│  │ (PBKDF2 / SQLite WAL) │  │  (Auth, Upload, Chat) │  │ (11 Injections)│   │
│  └──────────┬────────────┘  └───────────┬───────────┘  └───────┬────────┘   │
│             │                           │                      │            │
│  ┌──────────▼───────────────────────────▼──────────────────────▼────────┐   │
│  │                       RAG Core & Agentic Pipeline                    │   │
│  │  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐  │   │
│  │  │ Query Router │────▶│ Chunk Grader │────▶│    Query Rewriter    │  │   │
│  │  └──────────────┘     └──────────────┘     └──────────────────────┘  │   │
│  │         │                    │                         │             │   │
│  │         ▼                    ▼                         ▼             │   │
│  │  ┌────────────────────────────────────────────────────────────────┐  │   │
│  │  │        OKF Engine (Noise Filter · Deduplication · Fusion)      │  │   │
│  │  └───────────────────────────────────┬────────────────────────────┘  │   │
│  │                                      │                               │   │
│  │  ┌───────────────────────────┐       ▼       ┌────────────────────┐  │   │
│  │  │     Vector Store Engine   │◀─────────────▶│  Groq LPU Engine   │  │   │
│  │  │ ChromaDB (all-MiniLM-L6)  │               │   (qwen3.8-27b)    │  │   │
│  │  └───────────────────────────┘               └─────────┬──────────┘  │   │
│  │                                                        │             │   │
│  │  ┌─────────────────────────────────────────────────────▼──────────┐  │   │
│  │  │   Hallucination Auditor (Claim Verification & Span Highlight)   │  │   │
│  │  └────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
     ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
     │  Chroma Storage │      │  User DB (WAL)  │      │  Conversations  │
     │  ./chroma_db    │      │  ./data/users.db│      │  ./conversations│
     └─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Python**: 3.10 or higher
- **Node.js**: 20.x or higher & `npm`
- **Groq API Key**: Obtain a free API key at [console.groq.com](https://console.groq.com/)

### 2. Configuration
Clone the repository and set up your environment:
```bash
git clone https://github.com/yashtaksale/rag-document-chatbot.git
cd rag-document-chatbot
cp .env.example .env
```
Edit `.env` and set your Groq API key:
```env
GROQ_API_KEY=gsk_your_actual_key_here
```

### 3. One-Click Launch

#### Windows
Double-click `start.bat` or run:
```cmd
start.bat
```

#### Linux / macOS
```bash
chmod +x start.sh
./start.sh
```

The launcher executes pre-flight diagnostics, starts the FastAPI backend on `http://127.0.0.1:8001`, and opens the Next.js web application on `http://localhost:3001`.

---

## 🐳 Docker Deployment

DocChat provides a production-hardened multi-container setup via Docker Compose:

```bash
# Build and run backend and frontend containers in the background
docker compose up --build -d

# Check service health
docker compose ps
docker compose logs -f
```

- **Frontend Application**: `http://localhost:3001`
- **FastAPI Backend**: `http://localhost:8001`
- **API Health Check**: `http://localhost:8001/api/health`

To shut down:
```bash
docker compose down
```

---

## 💻 Manual Setup & Local Development

### 1. Backend Setup (FastAPI)
```bash
# Create and activate virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Run pre-flight system diagnostics
python -m backend.healthcheck

# Start FastAPI server
uvicorn backend.api_server:app --host 127.0.0.1 --port 8001 --reload
```

### 2. Frontend Setup (Next.js)
In a separate terminal:
```bash
# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```
Open `http://localhost:3001` in your browser.

---

## 📡 API Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | System diagnostics, collection count, active embedder/model | Optional |
| `POST` | `/api/auth/register` | Register a new user account | No |
| `POST` | `/api/auth/login` | Authenticate and obtain session token | No |
| `POST` | `/api/auth/logout` | Revoke active user session | Optional |
| `GET` | `/api/auth/me` | Fetch currently authenticated user profile | Yes |
| `GET` | `/api/documents` | List all indexed documents in user's vault | Yes / User Context |
| `POST` | `/api/documents/upload` | Multipart file upload (`.pdf`, `.docx`, `.txt`, `.csv`, `.md`) | Yes / User Context |
| `DELETE` | `/api/documents/{name}` | Remove a document and its embeddings from ChromaDB | Yes / User Context |
| `POST` | `/api/documents/clear` | Clear all documents from user's vault | Yes / User Context |
| `POST` | `/api/chat/stream` | Server-Sent Events (SSE) token & thought stream | Yes / User Context |

### SSE Event Format (`/api/chat/stream`)
The chat stream emits real-time Server-Sent Events with JSON payloads:
```json
// Thinking / Agentic Stage Event
data: {"type": "thinking", "delta": "Evaluating query with DocChat agentic pipeline...\n"}

// Token Stream Event
data: {"type": "token", "delta": "According"}
data: {"type": "token", "delta": " to the document..."}

// Final Metadata & Hallucination Audit Event
data: {
  "type": "metadata",
  "sources": ["climate_change.txt"],
  "quotes": ["Global temperatures rose by 1.1C since pre-industrial times..."],
  "groundedness_score": 96.5,
  "hallucination_score": 3.5,
  "eval_reason": "All extracted factual claims verified directly against source chunks.",
  "followups": ["What mitigation strategies are discussed?", "Which regions are most impacted?"],
  "rag_mode": "Thinking",
  "hallucinated_spans": [],
  "unsupported_claims": []
}

// Done Signal
data: [DONE]
```

---

## 🧪 Evaluation & Benchmarks

The Phase 6 automated evaluation suite (`tests/scripts/run_tests.py`) runs ground-truth tests across diverse documents:

| Benchmark Metric | Measured Result | Performance Target | Status |
|---|---|---|---|
| **In-Document Answer Accuracy** | **93.0%** (40/43 questions) | > 85.0% | ✅ Passed |
| **Out-of-Document Refusal Rate** | **100.0%** (19/19 questions) | > 90.0% | ✅ Passed |
| **Edge-Case / Greeting Handling** | **100.0%** (4/4 test cases) | 100.0% | ✅ Passed |
| **Average End-to-End Latency** | **826 ms** | < 2,500 ms | ✅ Passed |
| **Retrieval Gate Precision** | **100.0%** | > 95.0% | ✅ Passed |
| **Prompt Injection Defense** | **100.0%** (11/11 patterns) | 100.0% | ✅ Passed |

---

## 📁 Repository Structure

```
rag-document-chatbot/
├── backend/                  # Python FastAPI Backend
│   ├── agent.py              # LLM orchestrator, streaming, hallucination auditor
│   ├── api_server.py         # FastAPI REST & SSE endpoints, rate limiters, auth middleware
│   ├── auth.py               # SQLite user database, PBKDF2 hashing, session manager
│   ├── chunker.py            # LangChain text splitter (500 chars / 50 overlap)
│   ├── config.py             # Centralized system configurations and thresholds
│   ├── conversations.py      # Conversation filesystem persistence with atomic writes
│   ├── file_processor.py     # Multi-format text extraction (PDF, DOCX, TXT, CSV, MD)
│   ├── grounding.py          # Vector cosine similarity grounding calculator
│   ├── healthcheck.py        # System diagnostic CLI pre-flight suite
│   ├── okf.py                # Open Knowledge Filtering, deduplication & fusion
│   ├── retrieval_gate.py     # Cosine similarity gate converting Chroma L2 distance
│   └── vector_store.py       # ChromaDB PersistentClient & SentenceTransformer embedder
├── src/                      # Next.js 16 Claude/ChatGPT Web Application
│   ├── app/                  # App Router pages and API routes
│   │   ├── api/chat/         # Streaming proxy & LLM fallback API route
│   │   ├── login/            # Dedicated authentication route
│   │   ├── share/            # Public chat sharing route
│   │   ├── layout.tsx        # Root layout with ThemeInitializer
│   │   └── page.tsx          # Main application page
│   ├── components/           # UI Components
│   │   ├── auth/             # Authentication & account switching modals
│   │   ├── chat/             # Chat area, message bubbles, Markdown renderer, prompt queue
│   │   ├── sidebar/          # Sidebar navigation, conversation history, Document Vault modal
│   │   └── theme/            # Theme provider and styling utilities
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Client DB, context helpers, and TypeScript definitions
│   └── stores/               # Zustand state stores (DocChat, Chat, Auth, Theme, UI)
├── docs/                     # Comprehensive Project Documentation
│   ├── Architecture.md       # Full system architecture and dataflow specifications
│   ├── DEPLOYMENT.md         # Production deployment, Docker, and cloud hosting guide
│   ├── DESIGN.md             # Design system, UX guidelines, and theme tokens
│   ├── MEMORY.md             # Institutional memory, engineering decisions, and rationale
│   ├── PRD.md                # Product Requirements Document
│   ├── REPORT.md             # Complete academic thesis / technical report
│   ├── RULES.md              # Engineering conventions and coding standards
│   ├── TASKS.md              # Phase-by-phase task breakdown and progress tracker
│   ├── limitations.md        # System limitations and planned enhancements
│   └── phase7.md             # Live viva demo script and presentation checklist
├── data/                     # Persistent application data (users.db SQLite store)
├── chroma_db/                # Local ChromaDB persistent vector collection
├── conversations/            # Persistent user conversation JSON files
├── notebooks/                # Google Colab fine-tuning notebooks (QLoRA LLaMA-3.2)
├── tests/                    # Automated test harness, evaluation data, and results
├── Dockerfile                # Multi-stage production container for FastAPI backend
├── Dockerfile.web            # Node.js container for Next.js web application
├── docker-compose.yml        # Multi-container orchestration definition
├── start.bat                 # 1-click Windows startup script
├── start.sh                  # 1-click Linux/macOS startup script
├── requirements.txt          # Python backend dependencies
└── package.json              # Node.js frontend dependencies and scripts
```

---

## 📚 Documentation Index

For in-depth technical specifications, please consult the documents in the [`docs/`](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/) directory:
- 🏛️ [System Architecture](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/Architecture.md)
- 🚀 [Deployment Guide](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/DEPLOYMENT.md)
- 🎨 [Design System Specification](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/DESIGN.md)
- 🧠 [Project Memory & Decisions](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/MEMORY.md)
- 📋 [Product Requirements Document](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/PRD.md)
- 📑 [Full Academic & Technical Report](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/REPORT.md)
- 📐 [Development Rules & Conventions](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/RULES.md)
- 📝 [Task Breakdown & Tracker](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/TASKS.md)
- ⚠️ [System Limitations & Known Issues](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/limitations.md)
- 🎬 [Viva Demo Script & Checklist](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/docs/phase7.md)

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](file:///c:/Users/yasht/OneDrive/Desktop/coding/rag/LICENSE) for details.
