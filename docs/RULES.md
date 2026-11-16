# Development Conventions & Rules — DocChat (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Last Updated:** October 2026  

This document serves as the **single source of truth** for engineering standards, coding conventions, architectural boundaries, security policies, and workflow guidelines across the DocChat codebase.

---

## 1. Backend Code Conventions (Python / FastAPI)

### 1.1 Language & Typing Standards
- **Python Version**: Target Python 3.10+ runtime.
- **Modern Type Hints**:
  - Use standard generic collections: `list[dict]`, `dict[str, Any]`, `tuple[str, bool]`.
  - Use union syntax: `str | None` rather than `Optional[str]`.
- **Formatting**:
  - Maximum line length: **100 characters**.
  - Indentation: 4 spaces (no tabs).
  - Quotes: Double quotes (`"`) for strings; single quotes (`'`) for characters/keys where appropriate.
  - Public functions and classes **must** have Google-style docstrings (Args, Returns, Raises).

### 1.2 Import Standards
Imports must follow three distinct blocks, alphabetically sorted within each block:
```python
# 1. Standard Library
import asyncio
import io
import json
import logging
import os
import time

# 2. Third-Party Libraries
from fastapi import FastAPI, HTTPException, Request
from groq import Groq
from sentence_transformers import SentenceTransformer

# 3. Local Project Modules (Absolute imports only)
from backend.config import CHUNK_SIZE, MODEL_NAME
from backend.vector_store import query_collection
```
- **Prohibited**: Wildcard imports (`from module import *`) and relative imports (`from .config import ...`).
- **Single Import Rule**: No duplicated imports within a single file.

### 1.3 FastAPI & Async Guidelines
- Endpoints doing CPU-bound or blocking I/O (such as file extraction or ChromaDB queries) should be standard `def` endpoints so FastAPI runs them on the thread pool, or explicitly wrapped in `asyncio.to_thread`.
- Streaming endpoints returning SSE must use `StreamingResponse` with `media_type="text/event-stream"` and explicit cache-control headers:
  ```python
  headers={
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
  }
  ```
- Always validate request bodies using Pydantic `BaseModel` classes.

---

## 2. Frontend Code Conventions (Next.js 16 / React 19 / TypeScript)

### 2.1 Component & File Structure
- Components reside in `src/components/` grouped by domain (`auth/`, `chat/`, `sidebar/`, `theme/`).
- Page routes adhere to Next.js 16 App Router conventions (`src/app/`).
- Use PascalCase for React component files: `MessageBubble.tsx`, `DocumentVaultModal.tsx`.
- Use camelCase for state stores and utility libraries: `docchat-store.ts`, `db.ts`.

### 2.2 State Management Rules (Zustand)
- Store logic must be modularized by domain (`docchat-store.ts`, `chat-store.ts`, `user-store.ts`, `theme-store.ts`).
- Avoid putting large transient streaming text deltas into full component re-render loops; batch or isolate updates within message leaf nodes.
- Synchronize persistent client state (e.g., active user token) with `localStorage` via safe client-side utilities.

### 2.3 Styling & Design System (Tailwind CSS v4)
- **CSS Variables**: Always consume theme colors via CSS custom properties (`var(--bg-primary)`, `var(--text-primary)`, `var(--border-color)`). Never hardcode static background hex colors inside components.
- **Glassmorphism**: Use backdrop filters (`backdrop-blur-md`) with semi-transparent alphas for modals and sticky headers.
- **Accessibility**: Interactive elements must provide visible focus rings and appropriate `aria-label` or button descriptions.

---

## 3. Vector Database & Embedding Rules (ChromaDB)

1. **Singleton Embedder**: The `SentenceTransformer` embedder must be loaded once as a module-level singleton. Never instantiate the model inside per-request endpoints or loops.
2. **Normalized Embeddings**: Always specify `normalize_embeddings=True` during vector encoding so that Euclidean distance maps directly to cosine similarity:
   $$\text{Cosine Similarity} = 1 - \frac{\text{Distance}^2}{2}$$
3. **Mandatory Tenant Filtering**: Every ChromaDB query (`query_collection`, `get_user_documents`, `delete_document_chunks`, `clear_user_vault`) **must** include `where={"user_id": user_id}`. Never perform an unpartitioned search over the global document collection.
4. **Persistent Collection Access**: Obtain collection handles via `get_collection()`. Do not instantiate duplicate `PersistentClient` instances across threads.

---

## 4. API & Event Streaming Protocols

### 4.1 Server-Sent Events (SSE) Wire Format
The `/api/chat/stream` endpoint emits line-delimited SSE data in valid JSON:
```
data: {"type": "thinking", "delta": "Evaluating query with DocChat agentic pipeline...\n"}

data: {"type": "token", "delta": "Here is the summary"}

data: {
  "type": "metadata",
  "sources": ["report.pdf"],
  "quotes": ["Excerpt from page 1..."],
  "groundedness_score": 95.0,
  "hallucination_score": 5.0,
  "eval_reason": "Claims verified against source context.",
  "followups": ["What about next quarter?"]
}

data: [DONE]
```

### 4.2 Error Responses
All REST errors must return standard HTTP status codes with structured detail JSON:
```json
{
  "detail": "Descriptive, human-readable error message explaining the failure."
}
```

---

## 5. Security & Authentication Rules

1. **Password Storage**: Passwords must be hashed using PBKDF2-HMAC-SHA256 with 100,000 iterations and a cryptographically unique 32-byte salt (`secrets.token_bytes(32)`). Plaintext passwords must never be logged or persisted.
2. **Session Cleanup**: Session tokens must include an expiration timestamp and be purged periodically via `cleanup_expired_sessions()`.
3. **Prompt Injection Sanitization**: All incoming chat queries must be tested against the 11 compiled regex patterns before routing to ChromaDB or the LLM. Blocked attempts must return safe refusal messages and be logged at warning level.
4. **Rate Limiting**: Apply sliding-window rate limiters to authentication attempts, document uploads, and streaming chat requests.
5. **File Upload Security**:
   - Limit uploads to 25 MB max.
   - Enforce whitelist of allowed file extensions (`.pdf`, `.docx`, `.txt`, `.csv`, `.md`, `.json`, `.log`).
   - Sanitize all filenames using `sanitize_filename()` to remove directory traversal tokens (`..`, `/`, `\`).

---

## 6. Persistence & File Operations

1. **Atomic File Writes**: Writing JSON files to disk must follow atomic temp-file replacement:
   ```python
   temp_path = file_path.with_suffix(".tmp")
   with open(temp_path, "w", encoding="utf-8") as f:
       json.dump(data, f, indent=2)
   os.replace(temp_path, file_path)
   ```
2. **SQLite WAL Mode**: The user database must execute with `PRAGMA journal_mode = WAL;` and a 5000 ms busy timeout to enable high-concurrency read/write operations without locking.
3. **Rotating Log Files**: Logs must be written via `RotatingFileHandler` with UTF-8 encoding and bounded size limits (10 MB max, 5 backup files).

---

## 7. Prohibited Practices

- ❌ **No Hardcoded Secrets**: Never commit API keys, salts, or passwords to git. Always load from `.env`.
- ❌ **No Permissive Grounding**: Never allow the LLM to guess or extrapolate outside the provided document context. If context is missing, the response must state refusal.
- ❌ **No Unbounded Memory Leaks**: Never store unlimited in-memory history without bounded maxlen deques.
- ❌ **No Global Mutexes on I/O**: Do not lock entire request pipelines during LLM inference or vector generation.
