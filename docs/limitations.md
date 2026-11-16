# System Limitations & Known Issues — DocChat (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Last Updated:** October 2026  

This document provides a transparent, comprehensive inventory of the current limitations, technical constraints, and planned enhancements for the DocChat platform.

---

## 1. Document Extraction & Preprocessing

### 1.1 Scanned (Image-Only) PDFs
- **Severity:** Medium
- **Current State:** PDFs lacking an underlying digital text layer (e.g., scanned physical documents or flat image exports) cannot be parsed by `pypdf`. The extractor detects empty text and raises an informative error.
- **Impact:** Users uploading scanned paper documents without embedded OCR cannot query them.
- **Planned Resolution:** Integrate a fallback OCR pipeline utilizing `pytesseract` and `pdf2image` for automatic text recognition on image-only pages.

### 1.2 Multi-Column & Complex Table Layouts
- **Severity:** Low
- **Current State:** `pypdf` extracts text sequentially from the PDF content stream. In complex multi-column scientific layouts or financial tables without explicit grid borders, text across columns may be read linearly, potentially fracturing table rows.
- **Impact:** Highly complex numerical tabular data may exhibit slight layout distortion in extracted chunks.
- **Planned Resolution:** Incorporate layout-aware parsers such as `pdfplumber` or `unstructured` for structured table extraction.

### 1.3 Non-English Corpora Optimization
- **Severity:** Low
- **Current State:** The default embedding model (`all-MiniLM-L6-v2`) was primarily pre-trained on English corpora. While the Groq generation models (`qwen/qwen3.8-27b` and `llama3-8b`) possess multilingual capabilities, retrieval accuracy on non-English texts is suboptimal.
- **Planned Resolution:** Provide one-click embedder switching in `backend/config.py` to multilingual checkpoints such as `paraphrase-multilingual-MiniLM-L12-v2` or `BAAI/bge-m3`.

---

## 2. Model Inference & Cloud Dependency

### 2.1 External Cloud API Dependency
- **Severity:** Medium
- **Current State:** The primary generation and hallucination evaluation engines connect to the Groq Cloud API for ultra-high-throughput LPU inference. If external internet connectivity is unavailable, generation cannot proceed.
- **Mitigation:** The system supports local base models via OpenAI-compatible endpoints (such as local `Ollama` or `vLLM` instances) by reconfiguring `API_BASE` in `.env`.

### 2.2 LLM Judge Calibration
- **Severity:** Low
- **Current State:** Layer 2 hallucination evaluation relies on structured LLM claim verification. Although calibrated to high precision on ground-truth benchmarks, LLM evaluators can occasionally exhibit subtle bias or minor grading variance on highly ambiguous phrasing.
- **Mitigation:** The system pairs Layer 2 with Layer 1 vector cosine similarity grounding to provide a dual-metric check.

---

## 3. Storage & Scalability

### 3.1 Embedded SQLite & ChromaDB Scale Ceiling
- **Severity:** Low
- **Current State:** ChromaDB runs in embedded persistent mode (`PersistentClient`), and user accounts run on embedded SQLite with WAL mode.
- **Suitability:** Highly optimized for individual researchers, university labs, and workgroups with up to tens of thousands of chunks.
- **Enterprise Roadmap:** For enterprise scale (> 1,000,000 chunks across thousands of concurrent users), ChromaDB should be transitioned to a standalone distributed Chroma server or Qdrant cluster, and SQLite transitioned to PostgreSQL.

---

## 4. Status of Previously Identified Limitations (Resolved in v2.0)

| Previous Limitation | Status in v2.0 | Resolution Details |
|---|---|---|
| **No DOCX Support** | ✅ **Resolved** | Added `python-docx` support in `backend/file_processor.py` extracting paragraphs and tables. |
| **No User Authentication** | ✅ **Resolved** | Built PBKDF2 authentication with per-user salts, session tokens, and SQLite WAL in `backend/auth.py`. |
| **No Rate Limiting** | ✅ **Resolved** | Added thread-safe sliding-window rate limiters for auth, file upload, and chat streaming. |
| **UI State Reruns** | ✅ **Resolved** | Migrated from Streamlit to Next.js 16 / React 19 App Router with Zustand client-side stores. |
| **Docker Cold-Starts** | ✅ **Resolved** | Pre-baked SentenceTransformer model weights into container image during build in `Dockerfile`. |
| **Out-of-Doc Refusal Bug** | ✅ **Resolved** | Rewrote prompt constraints and flipped chunk grading error defaults, achieving 100% refusal on test suite. |

---

## 5. Summary Matrix

| Severity | Count | Remaining Technical Items |
|---|---|---|
| **High** | 0 | *None. Core functional requirements fully operational.* |
| **Medium** | 2 | Scanned PDF OCR fallback; Cloud API dependency in air-gapped environments. |
| **Low** | 3 | Multi-column table layout heuristics; non-English embedding optimization; distributed vector DB scaling. |
