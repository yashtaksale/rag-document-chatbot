# System Architecture — DocChat (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Last Updated:** October 2026  

---

## 1. High-Level Architecture Overview

DocChat v2.0 is designed as a decoupled, multi-tier web application combining an ultra-responsive Next.js frontend with an asynchronous, high-throughput Python FastAPI backend:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               USER (Browser Client)                             │
│                              http://localhost:3001                              │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    TIER 1: FRONTEND (Next.js 16 / React 19)                     │
│                                                                                 │
│  ┌─────────────────────────┐  ┌───────────────────────┐  ┌───────────────────┐  │
│  │   Chat Interface        │  │  Document Vault Modal │  │ Auth & Multi-User │  │
│  │  - Real-time SSE Stream │  │  - Drag & Drop Upload │  │  - Login/Register │  │
│  │  - Thought Process Tree │  │  - Chunk breakdown    │  │  - User Switcher  │  │
│  │  - Highlighted Answers  │  │  - Multi-file delete  │  │  - Session Token  │  │
│  │  - Follow-up Chips      │  │  - Vault Purge        │  │  - Profile Gate   │  │
│  └─────────────────────────┘  └───────────────────────┘  └───────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ State Management: Zustand Stores (DocChat, Chat, Auth, Theme, Queue, UI)  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ HTTP REST (JSON / Multipart)
                                         │ Server-Sent Events (SSE)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     TIER 2: BACKEND (FastAPI / Starlette)                       │
│                              http://127.0.0.1:8001                              │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ Middleware: CORS · Sliding-Window Rate Limiter · Bearer Auth Dependency    │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────┐  ┌───────────────────────┐  ┌───────────────────┐  │
│  │  Authentication Engine  │  │   Document Processor  │  │  Health & Pre-fly │  │
│  │  - PBKDF2 + Unique Salt │  │  - PDF/DOCX/TXT/CSV/MD│  │  - Embedder check │  │
│  │  - SQLite WAL Database  │  │  - LangChain Chunker  │  │  - ChromaDB count │  │
│  │  - Session TTL Cleanup  │  │  - Filename sanitize  │  │  - Groq ping      │  │
│  └─────────────────────────┘  └───────────────────────┘  └───────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                       Agentic RAG Core (agent.py)                         │  │
│  │                                                                           │  │
│  │  [Prompt Injection Filter: 11 Patterns] ──▶ [Retrieval Gate: Cosine >=0.10]│  │
│  │                                                                           │  │
│  │  ┌──────────────┐     ┌──────────────┐     ┌───────────────────────────┐  │  │
│  │  │ Query Router │────▶│ Chunk Grader │────▶│  Query Expansion/Rewrite  │  │  │
│  │  └──────────────┘     └──────────────┘     └───────────────────────────┘  │  │
│  │         │                    │                         │                  │  │
│  │         ▼                    ▼                         ▼                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │   OKF Engine (Noise Reduction · Semantic Dedup · Conflict Analysis) │  │  │
│  │  └─────────────────────────────────┬───────────────────────────────────┘  │  │
│  │                                    │                                      │  │
│  │  ┌─────────────────────────────────▼───────────────────────────────────┐  │  │
│  │  │ Generator (Groq LPU: qwen3.8-27b) ──▶ Real-time SSE Token Yield     │  │  │
│  │  └─────────────────────────────────┬───────────────────────────────────┘  │  │
│  │                                    │                                      │  │
│  │  ┌─────────────────────────────────▼───────────────────────────────────┐  │  │
│  │  │ Two-Layer Hallucination Auditor (Claim Extraction & Span Highlight) │  │  │
│  │  └─────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└───────────────────┬───────────────────┬───────────────────┬─────────────────────┘
                    │                   │                   │
                    ▼                   ▼                   ▼
           ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
           │ ChromaDB Storage│ │ SQLite Users DB │ │ JSON Chat Logs  │
           │  ./chroma_db    │ │  ./data/users.db│ │ ./conversations │
           │ (all-MiniLM-L6) │ │   (WAL mode)    │ │ (Atomic writes) │
           └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## 2. Component Specifications

### 2.1 Frontend Tier (`src/`)

- **Framework**: Next.js 16 (App Router), React 19, TypeScript 5.
- **Styling**: Tailwind CSS v4 with custom CSS variables for light/dark theme tokens, glassmorphic backdrops, and animated indicators.
- **Typography & Math**: Markdown rendered via Marked with KaTeX equation rendering (`$..$` inline, `$$..$$` block).
- **State Architecture**:
  - `docchat-store.ts`: Tracks active document vault state, file list, chunk counts, RAG mode (`Simple` | `Thinking`), and modal visibility.
  - `chat-store.ts`: Manages active conversation branch, message tree, streaming token deltas, reasoning logs, and audit metrics.
  - `user-store.ts`: Handles user authentication credentials, JWT bearer session tokens, user switching, and login modals.
  - `theme-store.ts`: Persists user theme preference (`dark` | `light` | `system`).
- **Communication Protocol**:
  - Direct SSE streaming over `POST /api/chat/stream` with fallback through Next.js server route `POST /api/chat`.
  - Multipart form upload to `POST /api/documents/upload`.

### 2.2 Backend Tier (`backend/`)

#### 2.2.1 API Server (`backend/api_server.py`)
- **FastAPI / Starlette**: Exposes REST and SSE streaming endpoints.
- **CORS Protection**: Environment-controlled origins supporting `http://localhost:3000`, `http://localhost:3001`, and production hostnames.
- **Sliding-Window Rate Limiting**:
  - `auth_limiter`: 10 requests / minute per IP.
  - `upload_limiter`: 25 uploads / minute per IP.
  - `chat_limiter`: 60 requests / minute per IP.
- **Security Sanitization**:
  - File upload extensions strictly validated (`.pdf`, `.docx`, `.txt`, `.csv`, `.md`, `.json`, `.log`).
  - Filename sanitization against path traversal (`sanitize_filename`).
  - Max upload limit enforced at 25 MB.

#### 2.2.2 Authentication & User Isolation (`backend/auth.py`)
- **Database Engine**: Persistent SQLite store (`data/users.db`) using **Write-Ahead Logging (WAL)** and 5-second busy timeout for lockless concurrent reads/writes.
- **Credential Storage**: PBKDF2-HMAC-SHA256 with 100,000 iterations and per-user 32-byte cryptographically secure random salts.
- **Session Tokens**: 32-byte URL-safe tokens with automated expiry cleanup (`cleanup_expired_sessions`).
- **Data Isolation**: ChromaDB collections are partitioned via metadata filter `where={"user_id": user_id}`. Conversations are stored in user-isolated directories `conversations/{user_id_hash}/user_{user_id}.json`.

#### 2.2.3 Open Knowledge Filtering & Fusion (OKF) Engine (`backend/okf.py`)
Provides deterministic multi-document chunk processing before LLM conditioning:
1. **Noise Elimination**: Strips low-information fragments (<30 characters, high punctuation density, OCR scanning anomalies).
2. **Semantic Deduplication**: Token-level Jaccard similarity filter (threshold = 0.82) preventing redundant context pollution.
3. **Cross-Source Conflict Detection**: Identifies numerical and factual divergence across documents.
4. **Context Fusion**: Assembles synthesized context blocks tagged with source provenance (`[Source: filename.pdf]`).
5. **OKF Composite Score**: Calculates a composite quality metric:
   $$\text{Fusion Score} = 0.30 \cdot \text{Retention} + 0.30 \cdot \text{Diversity} + 0.40 \cdot \text{Consensus}$$

#### 2.2.4 Vector Store & Embedding Singleton (`backend/vector_store.py`)
- **Model**: `sentence-transformers/all-MiniLM-L6-v2` generating 384-dimensional dense vectors.
- **Optimization**: Module-level singleton pattern ensures model weights load once into RAM, eliminating redundant re-initialization.
- **Vector Metric**: Embeddings are unit-normalized (`normalize_embeddings=True`), allowing ChromaDB's Euclidean L2 distance ($D$) to be mapped to Cosine Similarity ($S$):
  $$S = 1 - \frac{D^2}{2}$$
- **Persistence**: ChromaDB `PersistentClient` targeting `./chroma_db`.

#### 2.2.5 Agentic RAG Pipeline (`backend/agent.py`)
- **Query Router (`_route_query`)**: Uses low-temperature classification to distinguish between:
  - `retrieve`: Document-dependent technical, factual, or analytical questions.
  - `direct`: Conversational greetings, general chit-chat, or syntax clarification.
- **Chunk Grader (`_grade_chunks`)**: Employs parallel LLM evaluations (`ThreadPoolExecutor`, 5 workers) to filter out irrelevant or misleading retrieved chunks.
- **Query Rewriter (`_rewrite_query`)**: Keyword-optimizes queries if initial chunks fail grading, triggering a fallback search cycle.
- **Retrieval Gate (`backend/retrieval_gate.py`)**: Pre-generation check comparing similarity against `SIMILARITY_THRESHOLD = 0.10`. Ungrounded questions trigger an immediate grounded refusal.

#### 2.2.6 Two-Layer Hallucination Audit (`evaluate_hallucination`)
1. **Layer 1 (Vector Grounding)**: Sentence-level cosine similarity between question and retrieved passages via `backend/grounding.py`.
2. **Layer 2 (LLM Claim Auditor)**:
   - Primary pass: Structured JSON evaluation auditing all factual statements against reference context.
   - Fallback pass: Atomic claim extraction followed by parallel individual claim verification.
   - **Output**: Returns `groundedness_score`, `hallucination_score`, `unsupported_claims`, and verbatim `hallucinated_spans` for visual highlight rendering in the frontend.

---

## 3. Detailed Data Flows

### 3.1 Document Ingestion Pipeline

```
User uploads document (.pdf, .docx, .txt)
                    │
                    ▼
  [Frontend] Drag-and-drop file upload
                    │
                    ▼ POST /api/documents/upload (multipart)
  [FastAPI] Validate extension, size (<=25MB), sanitize filename
                    │
                    ▼
  [file_processor.py] Extract text:
      - PDF: pypdf linear text stream
      - DOCX: python-docx paragraph/table extractor
      - Plaintext: multi-encoding fallback (UTF-8 -> Latin-1 -> Replace)
                    │
                    ▼
  [chunker.py] RecursiveCharacterTextSplitter:
      - chunk_size = 500 characters
      - chunk_overlap = 50 characters
      - Filter chunks < 50 characters
                    │
                    ▼
  [vector_store.py] Embedder Singleton (all-MiniLM-L6-v2):
      - Compute normalized 384-dim embeddings
      - Metadata: { "source": filename, "user_id": user_id, "chunk_id": index }
                    │
                    ▼
  [ChromaDB] Upsert chunks into persistent collection 'documents'
                    │
                    ▼
  [FastAPI] Return JSON confirmation: { success: true, chunk_count: N }
```

### 3.2 Thinking Mode (Agentic RAG) Query Flow

```
User submits question in Thinking mode
                    │
                    ▼ POST /api/chat/stream (SSE)
  [Rate Limiter] Verify sliding-window rate limit
                    │
  [Injection Guard] Scan question against 11 regex patterns
                    │ Passed
                    ▼
  [Vault Check] Check if user vault contains indexed documents
                    │ Has documents
                    ▼
  [Router] Classify query: 'retrieve' vs 'direct'
        │
   ┌────┴──────────────────────────────┐
   │ 'direct'                          │ 'retrieve'
   ▼                                   ▼
Skip document search         [ChromaDB] Query top_k=5 chunks filtered by user_id
                                       │
                             [Chunk Grader] Parallel grading of each chunk (LLM)
                                       │
                             Any relevant chunks?
                                ├── No ──▶ [Rewriter] Rephrase query & retry ChromaDB
                                └── Yes ─┐
                                         ▼
                             [OKF Engine] Deduplicate & assemble fused context
                                         │
                                         ▼
                             [Generator] Stream answer tokens token-by-token
                                         │
                             Stream complete
                                         │
                                         ▼
                             [Hallucination Auditor] Verify claims against context
                                         │
                             Calculate Groundedness % and Verbatim Hallucination Spans
                                         │
                                         ▼
                             Emit final 'metadata' SSE event + '[DONE]'
```

---

## 4. Hardware & Deployment Topology

### 4.1 Production Port Map
| Service | Technology | Port | Purpose |
|---|---|---|---|
| **Web Frontend** | Next.js 16 / Node 20 | `3001` | User interface, SSR, client-side store |
| **API Backend** | FastAPI / Uvicorn | `8001` | REST endpoints, SSE streams, vector retrieval |
| **Vector Database** | ChromaDB (In-Process) | Embedded | Local persistent vector storage (`./chroma_db`) |
| **User Database** | SQLite (WAL Mode) | Embedded | Local user credential & session store (`./data/users.db`) |

### 4.2 Docker Multi-Container Architecture
- **Service `api`**: Built from `Dockerfile` (Python 3.12 slim, non-root user `appuser`, pre-baked `all-MiniLM-L6-v2` model weights, curl healthcheck).
- **Service `web`**: Built from `Dockerfile.web` (Node 20 Alpine, multi-stage production build, port 3001).
- **Storage Volumes**:
  - `docchat_chroma_storage` $\to$ `/app/chroma_db`
  - `docchat_conversations_storage` $\to$ `/app/conversations`
  - `docchat_data_storage` $\to$ `/app/data`
