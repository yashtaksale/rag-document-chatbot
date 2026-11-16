# Product Requirements Document (PRD) — DocChat (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Author:** Yash Taksale (PRN: 202301103086, BT-02, CSE)  
**Type:** Solo BTech Final-Year Project  
**Last Updated:** October 2026  

---

## 1. Executive Summary

### 1.1 Problem Statement
Large Language Models (LLMs) frequently hallucinate when answering questions about user-supplied documents — conflating pre-training knowledge with document content and generating plausible but ungrounded answers. In high-stakes domains (research, legal, compliance, education), this failure is dangerous because users cannot readily distinguish an accurate answer from a fabricated one. Standard commercial tools (such as generic ChatGPT file uploads) present answers with uniform confidence regardless of grounding quality.

### 1.2 The Solution: DocChat v2.0
DocChat v2.0 is an enterprise-grade document intelligence platform that solves the hallucination problem through a multi-tiered architecture:
1. **Strict Document Grounding**: A pre-retrieval similarity gate and strict system prompt instruct the model to answer **strictly** from uploaded documents and explicitly refuse when information is absent.
2. **Dual RAG Architecture**:
   - **Simple Mode**: Direct cosine similarity retrieval from a persistent ChromaDB vector store for rapid, fact-based answers.
   - **Thinking Mode (Agentic RAG)**: Dynamic query routing, parallel LLM chunk relevance grading, adaptive query rewriting, and self-correcting retrieval loops.
3. **Open Knowledge Filtering & Fusion (OKF)**: Proprietary deduplication, noise filtering, and cross-source conflict detection ensuring pristine context feeding into the LLM.
4. **Two-Layer Hallucination Audit**: Every generated answer undergoes automatic sentence-level vector grounding analysis and LLM claim-level verification, surfacing groundedness percentages, risk alerts, and verbatim hallucination highlights in the UI.
5. **Decoupled Modern Stack**: High-throughput **FastAPI** backend powering a sleek **Next.js 16 / React 19** Claude/ChatGPT-style web application with real-time SSE streaming.
6. **Multi-Tenant Isolation**: PBKDF2-hashed user accounts with SQLite WAL persistence, isolating vector chunks and conversation histories per user.

---

## 2. User Personas

### Primary User: Researcher / University Student
- **Goal**: Ingest academic papers, lecture notes, and textbooks; ask technical questions; and receive answers strictly verified against the text.
- **Pain Point**: LLMs fabricate citations and invent facts when papers lack explicit answers.
- **Value**: Guaranteed document citations, verifiable excerpts, and an explicit refusal when the document does not contain the answer.

### Secondary User: Legal / Technical Analyst
- **Goal**: Query dense contracts, API specifications, and compliance standards.
- **Pain Point**: Missing critical discrepancies across disparate multi-document revisions.
- **Value**: OKF cross-source conflict detection and verbatim hallucination span highlighting.

---

## 3. Functional Requirements (FR)

### FR-1: Document Ingestion & Text Extraction
- Support upload of `.pdf`, `.docx`, `.txt`, `.csv`, and `.md` documents up to 25 MB.
- Extract clean text using `pypdf`, `python-docx`, and multi-encoding fallback parsers.
- Reject empty, corrupted, or non-extractable documents with clear feedback.
- Sanitize filenames to prevent path traversal attacks.

### FR-2: Intelligent Text Chunking
- Split extracted text using LangChain's `RecursiveCharacterTextSplitter`.
- Standard chunk size: **500 characters** with an overlap of **50 characters**.
- Discard noise fragments (< 50 characters).
- Maintain source metadata (`filename`, `user_id`, `chunk_id`) on each chunk.

### FR-3: Vector Storage & Embedding Isolation
- Generate 384-dimensional dense vectors using `sentence-transformers/all-MiniLM-L6-v2` loaded as a memory-efficient module singleton.
- Normalize embeddings to map Euclidean distance directly to Cosine Similarity ($S = 1 - D^2/2$).
- Persist vectors in ChromaDB (`./chroma_db`) with strict multi-tenant filtering (`where={"user_id": user_id}`).
- Support granular document deletion and complete vault purging.

### FR-4: Agentic RAG Pipeline (Thinking Mode)
- **Query Router**: Classify incoming queries as `retrieve` (needs document search) or `direct` (greetings/chit-chat).
- **Parallel Chunk Grader**: Concurrently grade retrieved chunks for semantic relevance via parallel LLM calls (`ThreadPoolExecutor`).
- **Query Rewriter**: Keyword-optimize queries if initial chunks fail grading, triggering a fallback search cycle.
- **Retrieval Gate**: Enforce minimum cosine similarity (`SIMILARITY_THRESHOLD = 0.10`). Ungrounded queries trigger immediate explicit refusal without LLM generation.

### FR-5: Open Knowledge Filtering & Fusion (OKF)
- Filter noise fragments (< 30 characters, high punctuation density).
- Deduplicate chunks using token-level Jaccard similarity (threshold = 0.82).
- Detect cross-source numerical and factual divergence.
- Assemble synthesized context blocks with explicit source provenance tags.

### FR-6: Answer Generation & Streaming
- Stream answer tokens token-by-token over Server-Sent Events (SSE).
- Enforce strict refusal rules: forbid outside-knowledge guessing or extrapolation.
- Format responses with structured headings, code blocks, and KaTeX math formulas.

### FR-7: Two-Layer Hallucination Audit & Visualization
- **Layer 1**: Compute cosine similarity between question and retrieved passages.
- **Layer 2**: Extract atomic factual claims and verify each claim against source context.
- Output `groundedness_score` (0–100%), `hallucination_score`, and verbatim `hallucinated_spans`.
- Highlight unsupported spans in the UI with warning badges and explanatory tooltips.

### FR-8: User Authentication & Tenant Isolation
- User registration and login powered by PBKDF2-HMAC-SHA256 with unique 32-byte salts.
- Session tokens stored in SQLite with WAL mode and automated TTL expiry cleanup.
- Account switcher permitting testing of multiple tenant vaults in development.

### FR-9: Conversation History & Export
- Save conversations to disk under `conversations/` using atomic writes (`.tmp` $\to$ `os.replace`).
- Auto-generate conversation titles from the initial user query.
- Export conversations to GitHub-flavored Markdown including sources, excerpts, and hallucination scores.

### FR-10: Security & Guardrails
- **Prompt Injection Defense**: Scan all user queries against 11 compiled regex patterns (jailbreak, role-override, instructions leak).
- **Sliding-Window Rate Limiting**: Limit authentication (10/min), file uploads (25/min), and chat streams (60/min) per client IP.

---

## 4. Non-Functional Requirements (NFR)

### NFR-1: Performance & Latency
- Vector retrieval: < 300 ms for corpora up to 1,000 chunks.
- Stream initiation (Time to First Token): < 800 ms via Groq LPU inference.
- Hallucination verification: < 2.5 seconds using parallel multi-threaded claim checks.
- End-to-end response completion: < 5 seconds for standard queries.

### NFR-2: Reliability & Fault Tolerance
- Zero unhandled exceptions: All critical paths wrapped with graceful UI alerts.
- In-memory fallback: If agentic grading fails or times out, safely fall back to top retrieved chunks.
- Database integrity: SQLite WAL mode guarantees crash recovery without database corruption.

### NFR-3: Security & Data Privacy
- Zero credential exposure: API keys and database salts strictly confined to `.env`.
- Local vector persistence: User document chunks never leave the host machine; only LLM prompt context is transmitted to the inference engine.

---

## 5. Scope Evolution (v1 vs v2.0)

| Feature | v1 (Streamlit Prototype) | v2.0 (Current Production Stack) |
|---|---|---|
| **Frontend** | Single-page Streamlit (`app.py` @ 8501) | Next.js 16 / React 19 Claude/ChatGPT UI (@ 3001) |
| **Backend** | In-process Python functions | Decoupled FastAPI Server with SSE (@ 8001) |
| **Authentication** | Single hardcoded user (`USER_ID = 1`) | PBKDF2 + SQLite WAL multi-tenant auth & sessions |
| **File Formats** | PDF, TXT (scanned PDF rejected) | PDF, DOCX, TXT, CSV, MD with encoding fallback |
| **Context Processing**| Direct top-k chunk concatenation | OKF Engine (Noise filter, Jaccard dedup, Fusion) |
| **Hallucination UI** | Expandable Streamlit metric panel | Interactive span highlighting, groundedness badges |
| **Deployment** | Bare-metal `streamlit run` | Docker Compose (dual-container with pre-baked model) |
| **Health Suite** | None | 5-step pre-flight CLI (`healthcheck.py`) + `/api/health` |

---

## 6. Success Metrics & Measured Results

| Metric | Target | Measured Result (Phase 6 Test Suite) | Status |
|---|---|---|---|
| In-Document Answer Accuracy | > 85.0% | **93.0%** (40/43 questions) | ✅ Exceeded |
| Out-of-Document Refusal Rate | > 90.0% | **100.0%** (19/19 questions) | ✅ Exceeded |
| Edge-Case Handling | 100.0% | **100.0%** (4/4 questions) | ✅ Met |
| Average Response Time | < 2,500 ms | **826 ms** | ✅ Exceeded |
| Retrieval Gate Precision | > 95.0% | **100.0%** | ✅ Exceeded |
| Injection Attempt Blocking | 100.0% | **100.0%** (11/11 patterns) | ✅ Met |
