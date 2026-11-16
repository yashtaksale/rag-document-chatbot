# Task Breakdown — DocChat (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Last Updated:** October 2026  

This document tracks all completed and active tasks across all phases of the DocChat project lifecycle.

**Status legend:** ✅ Done · 🟡 In Progress · 🔴 Not Started

---

## Phase 1 — Environment & Foundation Setup
**Goal:** Establish development toolchain, dependencies, configuration, and API access.

### T1.1 — Python & Environment Initialization
- **Status:** ✅ Done
- **Output:** Python 3.10+ configured in dedicated virtual environment (`venv`).

### T1.2 — Core Python Dependency Specification
- **Status:** ✅ Done
- **Dependencies:** `fastapi`, `uvicorn`, `chromadb`, `sentence-transformers`, `groq`, `python-dotenv`, `langchain-text-splitters`, `pypdf`, `python-docx`, `numpy`. Captured in `requirements.txt`.

### T1.3 — Configuration & Secrets Management
- **Status:** ✅ Done
- **Output:** Centralized configuration in `backend/config.py`; API keys and local environment variables isolated in `.env` (gitignored).

### T1.4 — Project Directory Structure
- **Status:** ✅ Done
- **Structure:** Modular layout separating backend (`backend/`), frontend (`src/`), persistent storage (`chroma_db/`, `data/`, `conversations/`), notebooks (`notebooks/`), and tests (`tests/`).

---

## Phase 2 — RAG Ingestion & Vector Retrieval Pipeline
**Goal:** Build foundational document parsing, vector embeddings, and persistent search.

### T2.1 — Multi-Format Document Ingestion Module
- **Status:** ✅ Done
- **File:** `backend/file_processor.py`
- **Capabilities:** Extracts text from `.pdf` (pypdf), `.docx` (python-docx), `.txt`, `.csv`, `.md` with encoding fallback and zero-byte sanitization.

### T2.2 — Text Chunking Engine
- **Status:** ✅ Done
- **File:** `backend/chunker.py`
- **Specification:** `RecursiveCharacterTextSplitter` configured for 500-character chunks with 50-character overlap; noise filtering for segments under 50 characters.

### T2.3 — ChromaDB Vector Store & Embedding Singleton
- **Status:** ✅ Done
- **File:** `backend/vector_store.py`
- **Specification:** Singleton loader for `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions); persistent ChromaDB collection `documents`; normalized dot product mapping to cosine similarity.

### T2.4 — Retrieval Gate
- **Status:** ✅ Done
- **File:** `backend/retrieval_gate.py`
- **Specification:** Converts ChromaDB L2 distance ($D$) to cosine similarity ($S = 1 - D^2/2$). Rejects queries scoring below `SIMILARITY_THRESHOLD = 0.10` with a strict refusal.

### T2.5 — Prompt Injection Defense Guard
- **Status:** ✅ Done
- **Specification:** 11 compiled regex patterns detecting system prompt overrides, role changes, and jailbreak tags prior to LLM submission.

### T2.6 — Conversation Storage with Atomic Writes
- **Status:** ✅ Done
- **File:** `backend/conversations.py`
- **Specification:** Per-user JSON storage using atomic write patterns (`.tmp` $\to$ `os.replace`) preventing corruption during power loss or abrupt termination.

---

## Phase 2.5 — Agentic RAG Pipeline (Thinking Mode)
**Goal:** Enable self-correcting query routing, relevance grading, and adaptive rewriting.

### T2.5.1 — Query Router
- **Status:** ✅ Done
- **Function:** `_route_query(question) -> str`
- **Specification:** Low-temperature classification categorizing queries as `retrieve` (needs document search) or `direct` (greetings/chit-chat).

### T2.5.2 — Parallel Chunk Grader
- **Status:** ✅ Done
- **Function:** `_grade_chunks(question, chunks) -> list[str]`
- **Specification:** Concurrently evaluates retrieved chunks for semantic relevance via `ThreadPoolExecutor(max_workers=5)` with fail-closed rejection defaults.

### T2.5.3 — Query Rewriter
- **Status:** ✅ Done
- **Function:** `_rewrite_query(question) -> str`
- **Specification:** Reformulates user query into keyword-dense search terms when initial retrieval fails relevance grading.

### T2.5.4 — Agentic Orchestrator
- **Status:** ✅ Done
- **Function:** `prepare_agentic_context(collection, question, user_id) -> tuple`
- **Specification:** Chains routing $\to$ retrieval $\to$ grading $\to$ rewriting $\to$ OKF fusion into a unified pipeline.

---

## Phase 3 — LLM Fine-Tuning Infrastructure (LoRA / QLoRA)
**Goal:** Train and validate open-source models for refusal alignment on document QA.

### T3.1 — Base Model Selection & Licensing
- **Status:** ✅ Done
- **Model:** `meta-llama/Llama-3.2-3B-Instruct` verified on Hugging Face Hub.

### T3.2 — Diverse Curated Document Corpus
- **Status:** ✅ Done
- **Corpus:** 5 multi-domain documents in `tests/test_docs/` covering climate science, space exploration, nutrition, computer science, and country demographics.

### T3.3 — Synthetic Training Dataset Generation
- **Status:** ✅ Done
- **Implementation:** `backend/generate_dataset.py`
- **Dataset:** 420 structured `{instruction, input, output}` pairs formatted for LLaMA-3.2 chat templates with a 33.3% refusal ratio.

### T3.4 — Google Colab Fine-Tuning Notebook
- **Status:** ✅ Done
- **File:** `notebooks/phase3_finetuning.ipynb`
- **Specification:** QLoRA 4-bit NF4 double quantization using `bitsandbytes`, target linear projection adapters ($r=16, \alpha=32$), and `SFTTrainer`.

---

## Phase 4 — Two-Layer Hallucination Detection
**Goal:** Audit generated responses against retrieved context in real time.

### T4.1 — Layer 1: Vector Grounding Score
- **Status:** ✅ Done
- **File:** `backend/grounding.py`
- **Function:** `compute_grounding_score(question, chunks) -> float`
- **Specification:** Computes average cosine similarity between query and retrieved chunks (0–100%).

### T4.2 — Layer 2: LLM Claim Auditor
- **Status:** ✅ Done
- **Function:** `evaluate_hallucination(answer, context) -> dict` in `backend/agent.py`
- **Specification:** Extracts atomic factual statements from the answer, verifies each claim against reference context, and outputs `groundedness_score`, `hallucination_score`, and verbatim `hallucinated_spans`.

### T4.3 — Contextual Follow-Up Generator
- **Status:** ✅ Done
- **Function:** `generate_followups(answer, context) -> list[str]`
- **Specification:** Generates 3 relevant follow-up questions for one-click exploration.

---

## Phase 5 — Knowledge Filtering & Health Diagnostics
**Goal:** Eliminate context noise and implement system verification tools.

### T5.1 — Open Knowledge Filtering & Fusion (OKF) Engine
- **Status:** ✅ Done
- **File:** `backend/okf.py`
- **Features:** Noise fragment filtering, token-level Jaccard deduplication (threshold = 0.82), cross-source numerical conflict analysis, and unified context assembly.

### T5.2 — Pre-Flight Diagnostic Healthcheck Suite
- **Status:** ✅ Done
- **File:** `backend/healthcheck.py`
- **Verification:** 5-step test validating Groq API key, SentenceTransformer embedder, ChromaDB storage count, parser integrity, and live LLM ping.

---

## Phase 6 — Automated Evaluation & Quality Assurance
**Goal:** Benchmark accuracy, refusal reliability, edge-case resilience, and latency.

### T6.1 — Automated Test Runner
- **Status:** ✅ Done
- **Script:** `tests/scripts/run_tests.py`
- **Test Set:** 66 ground-truth questions across 5 diverse documents.

### T6.2 — Quality & Performance Benchmarking
- **Status:** ✅ Done
- **Results:**
  - **In-document accuracy**: **93.0%** (40/43 questions).
  - **Out-of-document refusal rate**: **100.0%** (19/19 questions).
  - **Edge-case handling**: **100.0%** (4/4 questions).
  - **Average response time**: **826 ms**.

---

## Phase 7 — Reporting & Presentation Deliverables
**Goal:** Document academic findings, system architecture, and demo materials.

### T7.1 — Academic Project Report
- **Status:** ✅ Done
- **File:** `docs/REPORT.md` (14 comprehensive chapters).

### T7.2 — Architecture Documentation
- **Status:** ✅ Done
- **File:** `docs/Architecture.md`.

### T7.3 — Live Demo Script & Viva Cheat Sheet
- **Status:** ✅ Done
- **File:** `docs/phase7.md`.

---

## Phase 8 — DocChat v2.0 Production Web Application
**Goal:** Migrate to a decoupled FastAPI backend and Next.js 16 Claude/ChatGPT-style frontend.

### T8.1 — FastAPI Backend Server & SSE Streaming
- **Status:** ✅ Done
- **File:** `backend/api_server.py`
- **Features:** REST endpoints for vault management, CORS middleware, sliding-window rate limiters, and real-time SSE streaming on `/api/chat/stream`.

### T8.2 — SQLite PBKDF2 Multi-Tenant Authentication
- **Status:** ✅ Done
- **File:** `backend/auth.py`
- **Features:** SQLite in WAL mode, PBKDF2-HMAC-SHA256 password hashing with per-user salts, session token issuance, and metadata tenant isolation.

### T8.3 — Next.js 16 / React 19 Frontend Application
- **Status:** ✅ Done
- **Path:** `src/`
- **Features:** App Router, React 19, TypeScript, Tailwind CSS v4, Lucide icons, KaTeX math rendering, and dark/light theme switching.

### T8.4 — Zustand State Management Architecture
- **Status:** ✅ Done
- **Files:** `src/stores/docchat-store.ts`, `src/stores/chat-store.ts`, `src/stores/user-store.ts`, `src/stores/theme-store.ts`, `src/stores/queue-store.ts`.

### T8.5 — Document Vault Modal & Progress UI
- **Status:** ✅ Done
- **File:** `src/components/sidebar/DocumentVaultModal.tsx`
- **Features:** Drag-and-drop file upload, live chunk indexing indicator, badge counters, and individual/bulk document deletion.

### T8.6 — Live Thought Process & Hallucination Span Highlighter
- **Status:** ✅ Done
- **File:** `src/components/chat/MessageBubble.tsx`
- **Features:** Real-time accordion displaying agentic thinking steps and inline visual badges highlighting unsupported claims directly within answer text.

### T8.7 — Multi-Container Docker Stack
- **Status:** ✅ Done
- **Files:** `Dockerfile`, `Dockerfile.web`, `docker-compose.yml`
- **Features:** Python 3.12 slim backend with non-root user and pre-baked model weights; Node 20 Alpine frontend; named persistent storage volumes.

### T8.8 — Cross-Platform 1-Click Launchers
- **Status:** ✅ Done
- **Files:** `start.bat` (Windows), `start.sh` (Linux/macOS)
- **Features:** Automated venv detection, pre-flight healthcheck execution, and dual background service startup.

---

## Progress Tracker Summary

| Phase | Total Tasks | Done | Partial | Not Started | % Complete |
|---|---|---|---|---|---|
| **Phase 1 — Setup** | 4 | 4 | 0 | 0 | 100% |
| **Phase 2 — RAG Pipeline** | 6 | 6 | 0 | 0 | 100% |
| **Phase 2.5 — Agentic RAG** | 4 | 4 | 0 | 0 | 100% |
| **Phase 3 — Fine-Tuning** | 4 | 4 | 0 | 0 | 100% |
| **Phase 4 — Hallucination** | 3 | 3 | 0 | 0 | 100% |
| **Phase 5 — OKF & Diagnostics** | 2 | 2 | 0 | 0 | 100% |
| **Phase 6 — Testing & Benchmarks**| 2 | 2 | 0 | 0 | 100% |
| **Phase 7 — Report & Demo** | 3 | 3 | 0 | 0 | 100% |
| **Phase 8 — v2.0 Web Application**| 8 | 8 | 0 | 0 | 100% |
| **TOTAL** | **36** | **36** | **0** | **0** | **100%** |
