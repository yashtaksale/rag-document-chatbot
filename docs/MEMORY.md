# Project Memory — DocChat (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Last Updated:** October 2026  

This document preserves the **institutional memory** of DocChat: architectural decisions, rationales, discarded approaches, lessons learned, and context that underpins the codebase.

---

## 1. Project Evolution & Milestones

| Milestone | Phase | Description | Key Learnings |
|---|---|---|---|
| **v1.0 Safety Net** | Phase 1–2 | Python Streamlit prototype with basic ChromaDB retrieval and Groq streaming. | Proved baseline RAG concept; highlighted need for strict refusal prompts and persistent storage. |
| **Agentic Thinking** | Phase 2.5 | Integrated router, parallel chunk grader, and query rewriter. | Dynamic self-correction handles ambiguous queries, but requires fail-closed defaults to avoid noise. |
| **Fine-Tuning Prep**| Phase 3 | Formatted 420-example synthetic dataset with 33.3% refusal ratio for LLaMA-3.2-3B QLoRA. | Negative refusal examples are critical for teaching models when to say "I cannot find this information". |
| **Audit & Testing** | Phase 4 & 6 | Calibrated two-layer hallucination auditor and automated test suite. | Discovered initial 0% refusal bug; rewrote system prompt to achieve 100% refusal on out-of-doc queries. |
| **v2.0 Architecture**| Phase 8 | Full migration from Streamlit to decoupled FastAPI backend and Next.js 16 Claude/ChatGPT frontend. | Drastically improved UX, eliminated UI reruns, and enabled inline hallucination span highlighting. |

---

## 2. Key Engineering Decisions & Rationales

### D1 — Groq LPU as Primary Inference Provider
- **Decision:** Use Groq API running high-capacity open-weight models (`qwen/qwen3.8-27b` and `meta-llama/llama-3.2-3b-instruct`).
- **Rationale:** Ultra-fast inference (hundreds of tokens/sec) makes streaming feel instantaneous. Supports strict JSON mode (`response_format={"type": "json_object"}`) necessary for router, chunk grader, and hallucination evaluation.
- **Fallback:** Standardized OpenAI-compatible client interface allows swapping to local vLLM or Ollama endpoints with zero codebase refactoring.

### D2 — `sentence-transformers/all-MiniLM-L6-v2` as Embedding Model
- **Decision:** Use local 384-dimensional embeddings via SentenceTransformer.
- **Rationale:** Runs locally on CPU with minimal memory footprint (< 120 MB RAM). Produces high semantic similarity precision. Embeddings are unit-normalized to map Euclidean distance directly to Cosine Similarity ($S = 1 - D^2/2$).

### D3 — Persistent ChromaDB Vector Store
- **Decision:** In-process ChromaDB with `PersistentClient` targeting `./chroma_db`.
- **Rationale:** Eliminates the operational complexity of managing external vector database services. Provides metadata filtering (`where={"user_id": user_id}`) for multi-tenant isolation.

### D4 — Migration from Streamlit to Next.js 16 + FastAPI (v2.0)
- **Decision:** Replace the monolithic Streamlit `app.py` with a decoupled Next.js 16 App Router frontend and FastAPI backend.
- **Rationale:**
  - Streamlit reruns the entire Python script on user interaction, causing input field resets and UI flickering during streaming.
  - Streamlit lacked fine-grained DOM control needed to highlight exact verbatim hallucinated text spans within the answer stream.
  - Next.js 16 with React 19 and Tailwind CSS v4 provides a Claude/ChatGPT-level polished interface with instant client-side transitions and persistent state.

### D5 — Server-Sent Events (SSE) over WebSockets for Token Streaming
- **Decision:** Implement SSE on `/api/chat/stream` rather than bi-directional WebSockets.
- **Rationale:**
  - Token streaming is inherently unidirectional (server $\to$ client).
  - SSE operates over standard HTTP/1.1 and HTTP/2, passing effortlessly through enterprise proxies and firewalls without connection-upgrade overhead.
  - Native browser `EventSource` and fetch streaming handle automatic reconnections gracefully.

### D6 — SQLite in WAL Mode for User Management
- **Decision:** Use SQLite with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) for user credentials and sessions.
- **Rationale:** Zero external database infrastructure required (no PostgreSQL or MySQL setup). WAL mode enables non-blocking concurrent reads while writes occur, delivering sub-millisecond authentication verification.

### D7 — PBKDF2-HMAC-SHA256 for Password Hashing
- **Decision:** Use Python standard library `hashlib.pbkdf2_hmac` with 100,000 rounds and 32-byte per-user cryptographic salts.
- **Rationale:** Avoids native C dependencies (such as `bcrypt` or `argon2-cffi`) that frequently cause compilation failures across disparate Docker images and Windows environments. Meets NIST SP 800-63B standards.

### D8 — Open Knowledge Filtering & Fusion (OKF) Engine
- **Decision:** Implement deterministic multi-source chunk filtering before feeding context to the LLM.
- **Rationale:**
  - Vector search frequently retrieves redundant chunks from adjacent paragraphs. Token-level Jaccard deduplication (threshold = 0.82) strips redundancy.
  - Cross-source analysis identifies contradictory numerical metrics across disparate documents, alerting the user to document conflicts.

### D9 — Two-Layer Hallucination Audit Architecture
- **Decision:** Combine sentence-level vector grounding (Layer 1) with LLM claim verification (Layer 2).
- **Rationale:**
  - Layer 1 (Cosine similarity) is fast and cheap, providing an immediate numerical grounding baseline.
  - Layer 2 extracts atomic claims and verifies textual support, producing verbatim text spans that are highlighted in the frontend message bubble.

### D10 — Pre-Baked Embedding Weights in Docker Image
- **Decision:** Download the SentenceTransformer model during the Docker build phase.
- **Rationale:** Eliminates cold-start latency when launching new containers and guarantees the container will start reliably even in air-gapped or firewalled environments.

---

## 3. What Was Tried and Discarded

1. **Monolithic Streamlit Session State (`st.session_state`)**:
   - *Discarded because:* State was ephemeral to browser tabs, easily cleared on refresh, and struggled with complex branching message trees. Replaced by client-side Zustand stores and local JSON persistence.
2. **Sequential Claim Verification Loops**:
   - *Discarded because:* Verifying 5–8 claims sequentially against context took 8–12 seconds. Replaced by a primary single-pass structured JSON audit with parallel `ThreadPoolExecutor(max_workers=5)` fallback, cutting audit time to < 2 seconds.
3. **Chunk Grading with Permissive Defaults**:
   - *Discarded because:* In early builds, when an LLM grading call errored or returned invalid JSON, it defaulted to *keeping* the chunk (`True`). This allowed noise to leak into the answer stage, contributing to the initial 0% refusal bug. Flipped to fail-closed (`False`).
4. **Sentence-Level Splitting via NLTK**:
   - *Discarded because:* Punctuation-based splitting frequently severed mathematical formulas, code blocks, and abbreviation lists. Replaced with LangChain's `RecursiveCharacterTextSplitter`.

---

## 4. Key Lessons Learned

- **Prompts Alone Are Not Enough**: System prompts instructing models to "refuse if not in context" are insufficient without hard retrieval gates. The retrieval gate (`passes_gate`) guarantees that queries below the similarity threshold never reach the LLM.
- **Atomic Writes Prevent Data Loss**: Direct writes to JSON files can leave zero-byte corrupted files if a process is killed mid-write. Always use atomic writes (`tempfile` $\to$ `os.replace`).
- **Deterministic Evaluation Sets Are Invaluable**: Building the 66-question ground-truth evaluation harness early allowed immediate verification of fixes, measuring the jump from 0% to 100% refusal rate quantitatively.
