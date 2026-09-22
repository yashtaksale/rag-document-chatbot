# Project Memory — DocChat
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot
**Last Updated:** September 2025

This document is the **institutional memory** of the project. It captures decisions, their rationales, what was tried and discarded, lessons learned, known issues, and the context that doesn't fit in architecture diagrams or task lists. Anyone working on this project should read this file before making changes.

---

## 1. How This Project Was Built

### 1.1 Development Timeline
| Week | What Happened |
|---|---|
| Early | Set up project structure, virtual environment, dependencies, GitHub repo. |
| Week 1-2 | Learned Python, RAG concepts, LangChain, Streamlit, ChromaDB, Groq API. Built and tested each individually. |
| Week 2-3 | Built `file_processor.py` and `chunker.py`. Tested with 5+ PDF types. Discovered scanned PDF issue. |
| Week 3-4 | Built `vector_store.py` with ChromaDB + SentenceTransformer. Confirmed module-level embedder pattern. |
| Week 4 | Built initial Groq LLM integration. Created the strict . Tested with 10+ questions, verified refusal behavior. |
| Week 4 | Built `app.py` with full Streamlit UI. Added file upload, chat interface, source citations. |
| Week 4 | Added conversation persistence (`conversations.py`) with atomic writes. |
| Week 4 | Added  protection (11 regex patterns). Tested with 15+  attempts. |
| Week 4 | Added rate limiting (20 queries/min sliding window). |
| End Week 4 | **v1-safety-net committed to GitHub.** Phase 2 declared complete. |
| Week 5 | Refactored backend: deleted `backend/llm.py`, created `backend/agent.py` (all LLM logic), `backend/config.py` (centralized constants), `backend/conversations.py` (moved from inline). |
| Week 5 | Added **Thinking mode** (Agentic RAG): router, chunk grader, query rewriter. |
| Week 5 | Added hallucination evaluation: claim extraction + claim verification (parallel). |
| Week 5 | Added follow-up question generation. |
| Week 5 | Added chat export to Markdown. |
| Ongoing | Phase 3 (fine-tuning) not started. Phase 6 (testing) and Phase 7 (report) not started. |

### 1.2 The Safety-Net Rule (Critical)
**Phase 2 was committed and tagged before Phase 2.5 (agentic features) was built.** This is non-negotiable. The safety-net version is the version you demo if everything else fails. It is the version that proves you understand RAG fundamentals.

Current commit: `d1a1e3e Phase 2 complete - working RAG chatbot with Groq API`.

The current working tree has additional changes (agentic mode, hallucination eval, follow-ups, refactored modules) that are **not yet committed**. These represent Phase 2.5 work.

---

## 2. Key Decisions and Rationale

### D1 — Groq API as the LLM Backend
**Decision:** Use Groq API (not OpenAI, not Anthropic, not a local model).

**Rationale:**
- Free tier available — no cost for development.
- Extremely fast inference (LPU hardware) — streaming feels instant.
- Supports the `llama3-8b-8192` model which is good enough for the RAG use case.
- Supports `response_format={"type": "json_object"}` — critical for structured outputs (routing, grading, claim extraction).
- The API is OpenAI-compatible — easy to swap if needed.

**Trade-off:** Groq is a third-party service. If it goes down, the app breaks. No offline mode planned for v1.

**If this breaks:** Swap the `client = Groq(...)` line in `agent.py` for `client = OpenAI(...)` and update `MODEL_NAME` in `config.py`. The rest of the code is API-agnostic.

### D2 — `all-MiniLM-L6-v2` as the Embedding Model
**Decision:** Use `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional).

**Rationale:**
- Smallest model in the all-MiniLM family — fast to encode, low memory.
- Good enough quality for document retrieval at the BTech level.
- No API key needed — runs locally.
- 384 dimensions is a sweet spot for ChromaDB performance.

**Trade-off:** Larger models (all-mpnet-base-v2, 768-dim) have better retrieval accuracy but are slower. For a demo with a few hundred chunks, MiniLM is sufficient.

**If this breaks:** The model downloads from Hugging Face on first run. If internet is unavailable, it fails. Pre-cache the model by running the import once on an internet connection.

### D3 — ChromaDB as the Vector Store
**Decision:** Use ChromaDB with `PersistentClient` (local, file-based).

**Rationale:**
- Open-source, no external service.
- Persistent by default — data survives app restarts.
- Simple Python API — `add()`, `query()`, `delete()`.
- Supports `where` filters for multi-tenancy (user_id filtering).
- No need for a separate server — runs in-process.

**Trade-off:** Not suitable for production scale (millions of chunks). For a demo with hundreds of chunks, it's perfect.

**If this breaks:** ChromaDB stores data in `./chroma_db/` using internal SQLite + Parquet files. Deleting the `chroma_db/` folder resets the vector store. This is the nuclear option but always works.

### D4 — Sentence-Level Embeddings, Not TF-IDF
**Decision:** Use neural embeddings (SentenceTransformer) instead of TF-IDF or BM25 for retrieval.

**Rationale:**
- Semantic search is better than keyword search for natural language questions.
- "What is the main argument?" matches paragraphs discussing the central thesis, even if the exact words differ.
- TF-IDF would miss paraphrased questions.

### D5 — Hardcoded USER_ID = 1
**Decision:** Single user, `USER_ID = 1` hardcoded in `app.py`.

**Rationale:** This is a solo project demo. Multi-user auth adds significant complexity (login, session management, per-user routing) that is not in scope. The ChromaDB `where` filter and conversation file structure already support multi-tenancy — the user ID is the only thing hardcoded.

**If multi-user is needed:** Replace `USER_ID = 1` with `st.session_state.user_id` set during a login flow. The rest of the code is already user-aware.

### D6 — Two RAG Modes (Simple vs. Thinking)
**Decision:** Provide both a simple pipeline and an agentic pipeline, selectable by the user.

**Rationale:**
- Simple mode: fast, reliable, easy to understand in a demo. Good for the panel.
- Thinking mode: shows advanced capabilities (routing, grading, self-correction). Impressive in a demo.
- Having both lets the panel see the contrast: basic vs. agentic RAG.

**Trade-off:** Thinking mode uses 3-5x more API calls per query. On Groq's free tier, this could hit rate limits during heavy testing.

### D7 — Claim-Level Hallucination Detection (Not Sentence-Level)
**Decision:** Use LLM-based claim extraction + claim verification instead of sentence-level cosine similarity.

**Rationale:**
- A single sentence can contain multiple claims (e.g., "The model achieved 95% accuracy and was trained on 1000 examples" — two claims).
- Sentence-level cosine similarity would give one score for both claims, masking one being wrong.
- Claim-level verification catches partial hallucinations.
- The tracker's original spec called for sentence-level cosine similarity as Layer 1. The claim-level approach is more sophisticated and replaces it entirely.

**Trade-off:** More API calls (one per claim). For an answer with 5 claims, that's 5 parallel LLM calls. With `max_workers=5`, this adds 2-5 seconds.

### D8 — JSON Files for Conversation Storage (Not SQLite)
**Decision:** Use flat JSON files on disk, not SQLite or any database.

**Rationale:**
- Zero additional dependencies.
- Human-readable — easy to debug and inspect.
- Atomic writes are simple with `.tmp` + `os.replace()`.
- For a single user with a few dozen conversations, performance is not a concern.
- File size per user is tiny (a few KB to a few hundred KB).

**Trade-off:** No query capabilities (can't search conversations, can't paginate). Not suitable for production.

### D9 —  Protection at the Application Level
**Decision:** Block  attempts with regex patterns before the text reaches the LLM.

**Rationale:**
- Defense in depth: the LLM's  is the first line, regex blocking is the second.
- Regex is fast and catches the most common patterns.
- The  itself has limitations — a determined attacker could find ways around it. Application-level blocking adds a safety net.

**Trade-off:** Regex patterns need to be maintained as new  techniques emerge. The 11 patterns cover the most common vectors but are not exhaustive.

### D10 — Streaming Responses
**Decision:** Use Groq's streaming API (`stream=True`) for answer generation.

**Rationale:**
- Better UX — user sees the answer appearing token by token.
- Perceived latency is lower even if total time is the same.
- Streaming is free with Groq — no performance cost.

---

## 3. What Was Tried and Discarded

### 3.1 TF-IDF Retrieval
**Tried:** Using scikit-learn's TF-IDF vectorizer for retrieval before switching to embeddings.

**Why discarded:** TF-IDF matches keywords, not meaning. "How does the model learn?" wouldn't match a paragraph about "training process" even if they're the same concept. Embeddings solve this.

### 3.2 BM25 via LangChain
**Tried:** LangChain's BM25 retriever as an alternative retrieval method.

**Why discarded:** Same keyword-matching problem as TF-IDF. Also added another dependency. Embeddings are strictly better for this use case.

### 3.3 Cosine Similarity Per Sentence (Layer 1)
**Tried:** The tracker's original spec for Layer 1 — embedding each answer sentence and each chunk, computing cosine similarity per sentence.

**Why modified:** Replaced with claim-level LLM verification for more granular detection. The sentence-level approach is kept as a **potential fallback** if the LLM-based approach is too slow or unreliable. See BT-1 in TASKS.md.

### 3.4 Single LLM Call for Hallucination Evaluation
**Tried:** Asking the LLM once: "Is this answer supported by the context?"

**Why discarded:** The LLM tends to give a one-word "yes" or "no" without nuance. By extracting individual claims and verifying each, we get a granular score and specific evidence about which parts are problematic.

### 3.5 Monolithic `backend/llm.py`
**Tried:** Putting all LLM logic (answer generation, hallucination evaluation, follow-ups) in one file.

**Why refactored:** The file grew to 470+ lines. Separating concerns into `agent.py` (LLM orchestration), keeping routing/grading/eval/followups together (they all call the LLM), and putting config in `config.py` made the codebase maintainable.

### 3.6 Non-Streaming Responses
**Tried:** Generating the full answer and then displaying it.

**Why discarded:** The user sees nothing for 3-10 seconds. Streaming provides a much better UX and costs nothing extra with Groq.

### 3.7 SQLite for Conversation Storage
**Tried:** Storing conversations in SQLite for "proper" database storage.

**Why discarded:** Added a dependency for no real benefit. JSON files are simpler, human-readable, and atomic writes are easier with `.tmp` + `os.replace()`.

---

## 4. Known Issues and Gotchas

### K1 — Scanned PDFs Fail Silently
**Issue:** `pypdf` returns empty strings for image-based (scanned) PDFs. The error message is clear, but users may not understand what "scanned PDF" means.

**Workaround:** The error message says "This may be a scanned image PDF." Future: add OCR with Tesseract.

###  — Duplicate Imports in `agent.py`
**Issue:** Lines 1-10 in `agent.py` have duplicate imports: `logging`, `os`, `time`, `ThreadPoolExecutor`, `as_completed` are each imported twice.

**Impact:** None functional — Python handles duplicate imports gracefully. But it's a code smell.

**Fix:** Remove the second import block (lines 7-10).

### K3 — `run_agentic_rag()` Is Dead Code
**Issue:** The function at lines 278-314 of `agent.py` is a non-streaming version of the agentic pipeline. It is never called from `app.py`.

**Impact:** Dead code increases maintenance burden. If the function signature changes, this function might break without anyone noticing.

**Options:** Delete it, keep it as a test utility, or refactor `app.py` to use it (requires removing streaming).

### K4 — Retrieval Gate Is Implicit
**Issue:** The tracker specifies a separate `smart_answer()` function with an explicit cosine-similarity threshold. The current code checks "did ChromaDB return any chunks?" rather than "is the best match above a similarity threshold?"

**Impact:** Marginal. If the best chunk has a very low similarity score, the LLM might still generate an answer. The strict  partially mitigates this.

**Fix:** Add a `SIMILARITY_THRESHOLD` check in `app.py` before calling the LLM. Convert ChromaDB L2 distance to cosine similarity: `similarity = 1 - (distance / 2)`.

### K5 — Log File Grows Indefinitely
**Issue:** `docchat.log` has no size limit. Over months of use, it could become large.

**Fix:** Add `RotatingFileHandler(maxBytes=10*1024*1024, backupCount=5)`.

### K6 — Groq Rate Limit on Thinking Mode
**Issue:** Thinking mode can trigger 3-7 API calls per query (router + 5 chunk graders + optional rewriter). With `MAX_QUERIES_PER_MINUTE = 20`, a user asking 4 questions rapidly in Thinking mode will hit the limit.

**Mitigation:** The rate limit error message tells the user to wait. The `AGENTIC_CALL_THRESHOLD = 5` logs a warning but doesn't block.

**Fix if needed:** Lower `AGENTIC_CALL_THRESHOLD` or implement exponential backoff.

### K7 — No Empty State for No Files
**Issue:** When no files are uploaded and the user sends a message, the warning "Please upload at least one document first" appears. But the chat input is still enabled.

**Trade-off:** Disabling the chat input when no files are uploaded would be cleaner, but Streamlit's `st.chat_input` doesn't support conditional disabling easily.

### K8 — Conversation Title Edge Cases
**Issue:** If the first user message is empty (e.g., they click a follow-up button without typing), the title would be an empty string or "..."

**Workaround:** Follow-up buttons set `pending_prompt` which bypasses the empty input case. In practice, this shouldn't happen.

### K9 — ThreadPoolExecutor Not Closed Gracefully
**Issue:** `ThreadPoolExecutor` is used as a context manager (`with` statement) in `_grade_chunks()` and `evaluate_hallucination()`. If the app is interrupted during parallel calls, threads may not shut down cleanly.

**Impact:** Low. Streamlit reruns are fast, and the context manager ensures cleanup in normal operation.

### K10 — Embedder Model Download on First Run
**Issue:** `sentence-transformers/all-MiniLM-L6-v2` (~100MB) downloads from Hugging Face on the first run. Without internet, the app crashes on import.

**Workaround:** Run the app once on an internet connection. The model is cached in `~/.cache/huggingface/hub/`.

---

## 5. Lessons Learned

### L1 — Module-Level Singletons Are Essential
Loading the embedding model inside a function causes it to reload on every Streamlit rerun, making the app unusably slow. Always load expensive resources once at module level and cache in Streamlit.

### L2 — Atomic Writes Prevent Data Loss
The first version of `conversations.py` wrote directly to the JSON file. During testing, the app crashed mid-write and corrupted the conversation file. The `.tmp` + `os.replace()` pattern fixed this immediately.

### L3 — Strict  Work — But Not Perfectly
The  "Answer strictly using the provided context. Do not invent or extrapolate." prevents most hallucinations, but not all. The model occasionally inserts plausible-sounding details. This is why the hallucination detection layer is essential — the  is the first line of defense, not the only one.

### L4 — Parallel LLM Calls Are Safe With Rate Limiting
Initially worried about hitting Groq's rate limits with `ThreadPoolExecutor(max_workers=5)`. In practice, the rate limiter (20/min) handles this fine. The parallel workers only matter for the user's perceived latency, not for the rate limit.

### L5 — ChromaDB's `where` Filter Is Essential for Multi-Tenancy
Without `where={"user_id": user_id}`, all users share the same collection and can see each other's documents. This was caught during testing when two test accounts were accidentally created.

### L6 — The Safety-Net Tag Is Non-Negotiable
Building Phase 2.5 (agentic features) before committing the Phase 2 safety-net would have been risky. The agentic features introduced bugs (rate limit issues, JSON parsing failures) that took time to fix. Having the working Phase 2 as a fallback made debugging much less stressful.

### L7 — Streamlit Caching Requires Understanding the Cache Key
`@st.cache_resource` caches based on function arguments. `load_collection()` has no arguments, so it's a singleton — perfect. If arguments are added later, the cache key changes and the collection reloads. Be careful when modifying cached functions.

### L8 — Groq's `response_format={"type": "json_object"}` Is a Game-Changer
Without this parameter, the LLM occasionally wraps JSON in markdown code blocks or adds explanatory text, breaking `json.loads()`. With this parameter, the output is always pure JSON. Use it for every structured-output call.

### L9 — Follow-Up Buttons Require `pending_prompt`
Streamlit reruns the entire script on every interaction. A button click happens in one rerun, but the value isn't available until the next rerun. The `pending_prompt` pattern (set in one rerun, read in the next) is the standard Streamlit way to handle this.

### L10 — The Tracker Should Be Updated Continuously
The Excel tracker is now significantly out of date (most Phase 2 tasks show "Not Started" despite being complete). Updating it after each task would have prevented the large gap between tracker and reality. **Rule: update the tracker at the end of every coding session.**

---

## 6. Environment Setup Instructions

### 6.1 Prerequisites
- Python 3.10 or higher (tested on 3.12).
- Windows (primary development machine), Mac or Linux also supported.
- 4GB+ RAM (for embedding model).
- Internet connection (for Groq API, HuggingFace model download).

### 6.2 Setup Steps
```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/hallucination-chatbot.git
cd hallucination-chatbot

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create .env file
echo GROQ_API_KEY=your_key_here > .env

# 6. Run the app
streamlit run app.py
```

### 6.3 First-Run Notes
- On first run, `sentence-transformers` downloads `all-MiniLM-L6-v2` (~100MB). This takes 30-60 seconds on a fast connection.
- ChromaDB creates the `./chroma_db/` directory automatically.
- The `conversations/` directory is created on first conversation save.

### 6.4 Important Files and Their Locations
```
hallucination-chatbot/
├── .env                          ← YOUR API key (gitignored, do not commit)
├── .streamlit/config.toml        ← UI theme configuration
├── app.py                        ← Main entry point (run this with streamlit)
├── docchat.log                   ← Application log (gitignored)
├── chroma_db/                    ← Vector database (gitignored)
├── conversations/                ← Chat history (gitignored)
├── backend/
│   ├── __init__.py               ← Empty (makes it a package)
│   ├── agent.py                  ← All LLM logic
│   ├── chunker.py                ← Text splitting
│   ├── config.py                 ← All configuration constants
│   ├── conversations.py          ← Conversation persistence
│   ├── file_processor.py         ← Document text extraction
│   └── vector_store.py           ← Embeddings + ChromaDB
├── docs/
│   ├── PRD.md                    ← Product requirements
│   ├── Architecture.md           ← System architecture
│   ├── TASKS.md                  ← Task breakdown with progress
│   ├── DESIGN.md                 ← Visual and interaction design
│   ├── RULES.md                  ← Development rules and conventions
│   └── MEMORY.md                 ← This file
└── requirements.txt              ← Python dependencies
```

---

## 7. Glossary of Project-Specific Terms

| Term | Meaning in This Project |
|---|---|
| **Safety-net** | The working Phase 2 chatbot committed and tagged as `v1-safety-net`. The fallback if later phases fail. |
| **Chunk** | A 500-character segment of document text, with its own embedding vector. |
| **Embedder** | The `SentenceTransformer("all-MiniLM-L6-v2")` singleton in `vector_store.py`. |
| **Collection** | A ChromaDB collection — the container for all chunk embeddings for one user. |
| **Vault** | The user's document collection in ChromaDB. "Clearing the vault" = deleting all chunks. |
| **Thinking mode** | Agentic RAG mode with routing, chunk grading, query rewriting. |
| **Simple mode** | Direct retrieval → answer pipeline (no agentic steps). |
| **Claim** | An individual factual statement extracted from an LLM answer. Used in hallucination detection. |
| **Grounding score** | Percentage of claims verified as supported by the context (0-100). |
| **Hallucination score** | 100 minus grounding score. Higher = more likely hallucinated. |
| **Retrieval gate** | Pre-LLM check that ensures the question is related to any document. Currently implicit (checks if chunks exist). |
| **Dirty flag** | `_conversation_dirty` in session state — indicates unsaved conversation changes. |
| ** v1-safety-net** | Git tag on the Phase 2 commit. Do not start Phase 3 without this tag. |
| **`processed_files`** | `st.session_state.processed_files` — set of filenames already indexed in the current session. |
| **`pending_prompt`** | `st.session_state.pending_prompt` — a follow-up question queued for the next rerun. |

---

## 8. People and Roles

| Person | Role | Contact |
|---|---|---|
| Yash Taksale | Sole developer, project owner | PRN: 202301103086, BT-02, CSE |

---

## 9. External Dependencies and Their Status

| Dependency | Version | Status | Notes |
|---|---|---|---|
| Python | 3.10+ | ✅ Stable | Tested on 3.12 |
| Streamlit | latest | ✅ Stable | UI framework |
| ChromaDB | latest | ✅ Stable | Vector database |
| SentenceTransformers | latest | ✅ Stable | Embedding model |
| Groq SDK | latest | ⚠️ API may change | Free tier, rate limits apply |
| pypdf | latest | ✅ Stable | PDF text extraction |
| python-docx | latest | ✅ Stable | DOCX text extraction |
| python-dotenv | latest | ✅ Stable | Env variable loading |
| langchain-text-splitters | latest | ✅ Stable | Text chunking |

---

## 10. What Makes This Project Unique

### 10.1 The Engineering Contribution
The core engineering contribution of this project is the **claim-level hallucination detection system**:

1. **Claim extraction** — The LLM breaks its own answer into discrete factual claims.
2. **Parallel verification** — Each claim is independently checked against the retrieved context.
3. **Granular scoring** — The user sees not just "this might be wrong" but *which parts* are grounded and which aren't.

This is more sophisticated than sentence-level similarity scoring (what the tracker originally planned) and more practical than full LLM-as-judge (which gives a binary verdict without granularity).

### 10.2 The Two-Layer Philosophy
The original plan was two independent layers (similarity + LLM judge). The implementation evolved into a single claim-verification function that is itself a two-phase process:

- **Phase 1: Claim extraction** — breaks the answer into testable units.
- **Phase 2: Parallel verification** — tests each unit independently.

The result is functionally equivalent to the two-layer approach but more granular.

### 10.3 Agentic RAG in a Solo Project
The Thinking mode implements a simplified agentic RAG pipeline:
- Router (1 LLM call)
- Chunk grader (up to 5 parallel LLM calls)
- Query rewriter (1 LLM call, conditional)
- Self-correction loop (one retry)

This is typically seen in production systems from companies like LlamaIndex or LangChain, not in BTech solo projects. Implementing it demonstrates understanding of advanced RAG patterns.

---

## 11. Open Questions

| Question | Status | Who Decides |
|---|---|---|
| What detection accuracy will be achieved? | Unknown — needs testing | Measured in Phase 6 |
| Will the fine-tuned model be faster or slower than Groq? | Unknown — depends on hardware | Measured in Phase 3 |
| Can the retrieval gate threshold be tuned automatically? | Not implemented | Future enhancement |
| Should the project be deployed publicly? | Undecided | User's choice |
| What is the final GitHub repository URL? | Not set | User's choice |

---

## 12. Quick Reference for Common Tasks

### "I need to add a new constant"
→ Add it to `backend/config.py`. Import it where needed. Do NOT hardcode.

### "I need to call the LLM"
→ Use `_groq_call()` from `backend/agent.py`. Never call `client.chat.completions.create()` directly.

### "I need to add a new file type support"
→ Add the handler in `backend/file_processor.py::extract_text()`.

### "I need to change the chunk size"
→ Change `CHUNK_SIZE` in `backend/config.py`.

### "I need to debug why a query returned no chunks"
→ Check: (1) Was the file actually processed? (2) Is the embedder working? (3) Is the question semantically related to the document content?

### "I need to reset everything and start fresh"
→ Delete `chroma_db/`, `conversations/`, and `docchat.log`. Keep `app.py` and `backend/`.

### "I need to see what's in ChromaDB"
→ Use `get_user_documents(collection, USER_ID)` to list files. Use `collection.get()` to inspect raw data.

### "The app is slow"
→ Check: (1) Is the embedder loading on every rerun? Should be cached. (2) Is the ChromaDB collection being reloaded? Should be cached. (3) Are LLM calls sequential when they could be parallel?
