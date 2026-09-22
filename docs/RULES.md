# Rules — DocChat Development Conventions
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot
**Last Updated:** September 2026

This document is the **single source of truth** for how code is written in this project. It combines code style rules, architectural boundaries, API conventions, security policies, and workflow rules into one reference. Every developer working on this codebase must follow these rules.

---

## Table of Contents
1. [Code Style and Structure](#1-code-style-and-structure)
2. [Backend Architecture Rules](#2-backend-architecture-rules)
3. [API and LLM Rules](#3-api-and-llm-rules)
4. [ChromaDB Rules](#4-chromadb-rules)
5. [Conversation Persistence Rules](#5-conversation-persistence-rules)
6. [UI and Streamlit Rules](#6-ui-and-streamlit-rules)
7. [Security Rules](#7-security-rules)
8. [Logging Rules](#8-logging-rules)
9. [Error Handling Rules](#9-error-handling-rules)
10. [Git Rules](#10-git-rules)
11. [Testing Rules](#11-testing-rules)
12. [Performance Rules](#12-performance-rules)
13. [Documentation Rules](#13-documentation-rules)
14. [Prohibited Practices](#14-prohibited-practices)
15. [Quick Decision Tree](#15-quick-decision-tree)

---

## 1. Code Style and Structure

### 1.1 Python Version
- **Target:** Python 3.10+
- Use `list[dict]` instead of `typing.List[dict]`.
- Use `str | None` instead of `typing.Optional[str]`.
- Use `match/case` (Python 3.10+) instead of chained `if/elif` where appropriate.

### 1.2 Formatting
- **Line length:** 100 characters max.
- **Indentation:** 4 spaces, no tabs.
- **Quotes:** Double quotes (`"`) for strings, single quotes (`'`) for empty strings or characters.
- **Blank lines:** Two blank lines between top-level function/class definitions. One blank line between methods in a class.
- **Trailing commas:** Always include in multi-line collections and function calls.

### 1.3 Naming Conventions
| Element | Convention | Example |
|---|---|---|
| Files | `snake_case.py` | `file_processor.py`, `vector_store.py` |
| Functions | `snake_case()` | `chunk_text()`, `query_collection()` |
| Variables | `snake_case` | `user_id`, `raw_context`, `chunk_id` |
| Constants | `UPPER_SNAKE_CASE` | `CHUNK_SIZE`, `TOP_K`, `MODEL_NAME` |
| Classes | `PascalCase` | *(no classes in current codebase)* |
| Private functions | `_leading_underscore` | `_groq_call()`, `_check_rate_limit()` |
| Module-level singletons | `UPPER_CASE` | `EMBEDDER`, `client` |

### 1.4 Import Order
```python
# 1. Standard library
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# 2. Third-party
from dotenv import load_dotenv
from groq import Groq
from sentence_transformers import SentenceTransformer

# 3. Local (absolute imports only, no relative imports)
from backend.config import CHUNK_SIZE, MODEL_NAME
from backend.vector_store import query_collection
```

- One import per line.
- Alphabetical within each group.
- Absolute imports only — no relative imports (`from .config import ...`).
- No wildcard imports (`from x import *`).
- **No duplicate imports** — each module imported exactly once.

### 1.5 Docstrings
Every **public** function must have a docstring. Private functions (leading `_`) should have docstrings if their logic is non-obvious.

```python
def query_collection(collection, question: str, user_id: int, top_k: int = 5):
    """Retrieve top-k chunks relevant to a question for a specific user.

    Args:
        collection: ChromaDB collection object (from get_collection()).
        question: The user's question string.
        user_id: The user's ID for data isolation (matches metadata filter).
        top_k: Number of chunks to retrieve. Default 5.

    Returns:
        ChromaDB query result dict with keys 'documents', 'metadatas', 'distances'.
        Each value is a list of lists (outer list has one entry per query).
    """
```

Format: **Google-style** (Args, Returns, Raises). One-line summary + detailed description if needed.

### 1.6 Type Hints
- Required on **all** function signatures.
- Required on module-level variables that are mutable.
- Use `from __future__ import annotations` for forward references if needed.

```python
def chunk_text(text: str, source_filename: str) -> list[dict]:
def get_collection(path: str = CHROMA_DB_PATH) -> chromadb.Collection:
def evaluate_hallucination(answer: str, context: str) -> dict:
```

### 1.7 Comments
- Comments explain **why**, never **what**.
- The code already shows what it does. Comments should explain the reasoning behind non-obvious decisions.

```python
# Good: explains the rationale
# Skip chunks under 50 chars to filter out garbage from headers, page numbers, and whitespace
if len(piece) < 50:
    continue

# Bad: restates the code
# Skip short chunks
if len(piece) < 50:
    continue
```

- Use `# ── Section Name ──` for visual section separators within files.
- Use `# NOTE:` for important observations that future developers should know.
- Use `# TODO:` for planned future work (with a brief description of what and why).

### 1.8 No Dead Code
- Do not leave commented-out code in committed files.
- Do not leave unused functions in modules unless they are explicitly kept as public API.
- Git preserves history — if you remove something and need it back, `git checkout` the old version.
- If keeping a function that's not currently called, add `# NOTE: kept for [reason]`.

### 1.9 Module Boundaries (Strict)
Each file in `backend/` has exactly one responsibility:

| File | Owns | Must Not Touch |
|---|---|---|
| `config.py` | All constants | Functions, classes, app-library imports |
| `file_processor.py` | File → text conversion | LLM calls, vector DB, UI |
| `chunker.py` | Text → chunks | File I/O, embeddings |
| `vector_store.py` | Embeddings + ChromaDB | UI code, LLM calls |
| `agent.py` | All Groq API interactions | File processing, direct ChromaDB calls |
| `conversations.py` | JSON conversation persistence | LLM calls, embedding logic |

**Rule:** If a function calls Groq, it belongs in `agent.py`. If it reads a file, it belongs in `file_processor.py`. No exceptions.

---

## 2. Configuration Rules

### 2.1 All Tunables Live in config.py
- Every value that might need tuning (sizes, temperatures, timeouts, paths, thresholds) is defined in `backend/config.py`.
- No magic numbers in function bodies.
- If you need a new constant, add it to `config.py` first, then import it.

```python
# backend/config.py
CHUNK_SIZE = 500
TEMPERATURE_ANSWER = 0.1
TOP_K = 5

# backend/chunker.py
from backend.config import CHUNK_SIZE
splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, ...)

# WRONG:
splitter = RecursiveCharacterTextSplitter(chunk_size=500, ...)  # hardcoded
```

### 2.2 Temperature Guidelines
| Task | Temperature | Rationale |
|---|---|---|
| Routing (retrieve vs direct) | 0.0 | Deterministic classification |
| Chunk grading (relevant?) | 0.0 | Deterministic classification |
| Query rewriting | 0.2 | Slight creativity for text generation |
| Answer generation | 0.1 | Mostly deterministic, slight flexibility |
| Hallucination evaluation | 0.0 | Deterministic — consistency matters |
| Follow-up generation | 0.3 | Creative but controlled |

---

## 3. API and LLM Rules

### 3.1 All LLM Calls Use `_groq_call()`
Never call `client.chat.completions.create()` directly. `_groq_call()` handles rate limiting, timeout, logging, error handling, and default model name.

```python
# Correct
res = _groq_call(messages=messages, temperature=0.0)

# WRONG:
res = client.chat.completions.create(
    model=MODEL_NAME, messages=messages, temperature=0.0
)
```

### 3.2 Rate Limiting Cannot Be Bypassed
- `_check_rate_limit()` is called inside `_groq_call()`.
- No `skip_rate_limit` parameter exists or will exist.
- No global variable manipulation to clear the rate limit log.
- The rate limit is a shared resource and applies to all calls equally.

### 3.3 Structured Outputs Always Use `response_format`
```python
res = _groq_call(
    messages=[...],
    response_format={"type": "json_object"},
    temperature=0.0,
)
```
- This forces the LLM to output pure JSON — no markdown wrapping, no explanations.
- Always wrap `json.loads()` in try/except with a sensible fallback.

### 3.4 Parallel LLM Calls Use ThreadPoolExecutor
For N independent LLM calls (chunk grading, claim verification), use `ThreadPoolExecutor(max_workers=5)`:

```python
with ThreadPoolExecutor(max_workers=5) as pool:
    futures = {pool.submit(_grade_single, c): c for c in chunks}
    for future in as_completed(futures):
        chunk, is_relevant = future.result()
        if is_relevant:
            relevant.append(chunk)
```

- I/O-bound operations → threads are correct.
- `asyncio` is not used (Groq client is synchronous).
- `multiprocessing` is not used (overhead not needed for I/O-bound work).

### 3.5 Timeouts
- All Groq calls use `API_TIMEOUT = 30` seconds.
- Do not increase without documenting why.
- Do not remove — the app must not hang.

---

## 4. ChromaDB Rules

### 4.1 Always Filter by User
Every query must include `where={"user_id": user_id}`:
```python
results = collection.query(
    query_embeddings=embedding,
    n_results=top_k,
    where={"user_id": user_id},
    include=["documents", "metadatas", "distances"],
)
```
Without this filter, all users share the same collection and can see each other's documents.

### 4.2 Chunk ID Format
```
u{user_id}_{source_filename}_c{chunk_index}
```
Example: `u1_research_paper_c0` — ensures uniqueness across users and files.

### 4.3 Chunk Metadata Fields
Every chunk stored in ChromaDB must have metadata with:
- `source` (str): Original filename.
- `chunk_id` (int): Sequential index within the file.
- `user_id` (int): User identifier for data isolation.

### 4.4 Collection Must Be Cached
```python
@st.cache_resource
def load_collection():
    return get_collection()
```
Never reload the collection on every Streamlit rerun. ChromaDB's `PersistentClient` handles disk I/O internally.

### 4.5 The Embedder Is a Singleton
- `EMBEDDER = SentenceTransformer(EMBEDDER_NAME)` is defined at module level in `vector_store.py`.
- It is loaded **once** when the module is imported.
- Every module that needs embeddings must import this instance: `from backend.vector_store import EMBEDDER`.
- **Never** create a new `SentenceTransformer()` in any other file. Two instances produce incompatible vector spaces → similarity scores are meaningless.

---

## 5. Conversation Persistence Rules

### 5.1 Atomic Writes (Mandatory)
```python
def save_all(user_id: int, conversations: list[dict]) -> None:
    path = _get_path(user_id)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(conversations, f, indent=2)
    os.replace(tmp_path, path)  # atomic on all modern OSes
```
Never write directly to the target file. The `.tmp` → `os.replace()` pattern prevents JSON corruption if the app crashes mid-write.

### 5.2 Persist After Every Change
- After every assistant response (if conversation is dirty).
- Before switching conversations.
- Before starting a new conversation.
- Do not defer persistence — the app may crash before the deferred time.

### 5.3 Conversation File Format
```json
[
    {
        "id": "uuid-string",
        "title": "First 25 chars of first user message...",
        "messages": [
            {"role": "user", "content": "What is RAG?"},
            {"role": "assistant", "content": "RAG stands for...", "sources": ["`doc.pdf`"]}
        ],
        "is_archived": false,
        "updated_at": 1700000000.123
    }
]
```
- Top-level is always a JSON **array**.
- `updated_at` is a Unix timestamp (float from `time.time()`).
- Loaded sorted by `updated_at` descending (newest first).

### 5.4 Conversation Title Logic
- Title is the first user message, sliced to 25 characters + "..." if truncated.
- If the first message is 25 chars or shorter, no ellipsis is added.
- A new conversation gets a new UUID via `str(uuid.uuid4())`.

---

## 6. UI and Streamlit Rules

### 6.1 No Tracebacks to Users
Every critical operation in `app.py` is wrapped in try/except:
```python
try:
    text = extract_text(uploaded_file)
    chunks = chunk_text(text, uf.name)
    add_chunks(coll, chunks, user_id=USER_ID)
except Exception as e:
    st.error(f"Failed {uf.name}: {e}")
    logger.error("Failed to process %s: %s", uf.name, e)
```
- `st.error()` shows a user-friendly message.
- `logger.error()` records the full traceback with `exc_info=True`.
- `st.stop()` is used where continuing would use bad state.

### 6.2 Hallucination Eval Is Non-Blocking
If `evaluate_hallucination()` raises an exception, the answer is still displayed. The hallucination panel simply doesn't appear. The answer must always be shown — detection is supplementary.

### 6.3 Follow-Ups Are Best-Effort
If `generate_followups()` fails, log it and continue. Missing follow-up buttons is acceptable. Missing the answer is not.

### 6.4 Spinner Messages Must Be Descriptive
| Operation | Spinner Message |
|---|---|
| Processing document | `"Processing {filename}..."` |
| Simple mode query | `"Searching documents..."` |
| Thinking mode query | `"Agent reasoning and validating context..."` |

Never use generic: `"Loading..."`, `"Please wait..."`, `"Working..."`.

### 6.5 Source Citations Are Always Shown
If chunks were retrieved and have metadata, source filenames must appear below the answer:
```python
st.caption(f"**Sources:** {', '.join(sources)}")
```
Sources are formatted as inline code: `` `filename.pdf` ``.

### 6.6 Cached Resources
```python
@st.cache_resource
def load_collection():
    return get_collection()
```
- Use `@st.cache_resource` for anything that takes >1 second to initialize.
- This includes: ChromaDB collection, embedding model, fine-tuned LLM (future).
- Do NOT use `@st.cache_data` for mutable objects (collections, models).

### 6.7 Session State Keys
All session state keys are initialized in one block at the top of `app.py`:
```python
if "messages" not in st.session_state:
    st.session_state.messages = []
if "processed_files" not in st.session_state:
    st.session_state.processed_files = set(...)
```
Never access `st.session_state[key]` without checking it exists first.

### 6.8 The `pending_prompt` Pattern
```python
# Set on button click (one rerun)
st.session_state.pending_prompt = question_text

# Read on next rerun
prompt = st.chat_input("...")
active_prompt = prompt or st.session_state.pending_prompt
if active_prompt:
    st.session_state.pending_prompt = None
    # process the prompt
```
This is the standard Streamlit pattern for cross-rerun communication.

---

## 7. Security Rules

### 7.1 Never Log or Display API Keys
- The Groq API key appears only in `.env`.
- Never reference it in code outside of the `Groq(api_key=...)` constructor.
- Never include it in logs, error messages, or UI output.

### 7.2  Checks Come First
Injection checks happen before file checks, before LLM calls, before everything:
```python
injection_warning = _check_prompt_injection(active_prompt)
if injection_warning:
    st.warning(injection_warning)
    logger.warning("Injection blocked: %s", active_prompt[:100])
    # Do NOT process the message further
```

### 7.3 No Data Sent to Services Other Than Groq
- The only external API endpoint is Groq (`api.groq.com`).
- Document text, questions, and answers are sent to Groq for inference.
- No analytics, no telemetry, no tracking services.

### 7.4 .env Is Gitignored
Before every `git add`, verify with `git status` that `.env` does not appear in changes.

### 7.5 The v1-safety-net Tag
- Before starting Phase 3, the Phase 2 working chatbot must be tagged `v1-safety-net` on GitHub.
- Command: `git tag v1-safety-net && git push origin main --tags`
- Do NOT start Phase 3 until this tag exists on the remote.

---

## 8. Logging Rules

### 8.1 Every Module Has a Logger
```python
import logging
logger = logging.getLogger(__name__)
```

### 8.2 Use Log Levels Correctly
| Level | Use For | Example |
|---|---|---|
| `logger.debug()` | Detailed diagnostic info | Full LLM prompts (if needed for debugging) |
| `logger.info()` | Normal operations | "Added 15 chunks for user 1" |
| `logger.warning()` | Unexpected but handled | "Routing failed, defaulting to retrieve" |
| `logger.error()` | Failures affecting functionality | "Failed to process file", "Query pipeline failed" |

### 8.3 Log Format
```
2025-09-22 02:07:15,123 [INFO] docchat.agent: Added 15 chunks for user 1
2025-09-22 02:07:16,456 [WARNING] docchat.agent: Routing failed, defaulting to retrieve
```

### 8.4 Log With Context
Always include relevant values, not just the exception:
```python
# Good
logger.error("Failed to process %s: %s", filename, exc)

# Bad
logger.error("Error processing file")  # Which file? What error?
```

---

## 9. Error Handling Rules

### 9.1 Never Use Bare `except:`
```python
# WRONG
try:
    ...
except:
    pass

# Correct
try:
    ...
except Exception as exc:
    logger.error("Operation failed: %s", exc)
    raise  # or return a fallback
```

### 9.2 Always Log Before Re-raising
```python
try:
    response = client.chat.completions.create(**kwargs)
    return response
except Exception as exc:
    logger.error("Groq API call failed: %s", exc)
    raise  # Let the caller handle it
```

### 9.3 Graceful Degradation Hierarchy
1. **Detection failure** → Continue without hallucination analysis. Answer still displayed.
2. **Follow-up failure** → Continue without follow-up buttons. Answer still displayed.
3. **Conversation save failure** → Show `st.error()` but keep messages in session.
4. **LLM failure** → Show `st.error()` with generic message. No traceback.
5. **File processing failure** → Show `st.error()` with specific error. Continue with other files.

**Principle:** Never let a secondary feature crash the primary feature.

### 9.4 Default to Conservative
When a check fails and the code must guess:
- Chunk grading fails → default to `True` (keep the chunk). Better to include an irrelevant chunk than exclude a relevant one.
- Claim verification fails → default to `True` (assume supported). Better to under-report hallucination than falsely accuse.
- Routing fails → default to `"retrieve"` (search documents). Better to search unnecessarily than skip retrieval.

---

## 10. Git Rules

### 10.1 Commit Message Format
```
<type>: <description>
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

Examples:
```
feat: add chunk grading in Thinking mode
fix: prevent duplicate imports in agent.py
refactor: split llm.py into agent.py and config.py
docs: update tracker after Phase 2 completion
```

### 10.2 Commit Frequency
- Commit at the end of every coding session.
- Commit when a feature is complete and tested.
- Do NOT commit half-working features.
- Do NOT commit with failing behavior.

### 10.3 The Safety-Net Tag
- `v1-safety-net` must be created on the Phase 2 commit before starting Phase 3.
- Command: `git tag v1-safety-net && git push origin main --tags`
- This tag must exist on the remote (GitHub) before any Phase 3 work begins.
- Do NOT start Phase 3 without this tag. No exceptions.

### 10.4 Branching Strategy
- `main` is the stable branch. Only working, tested code goes here.
- Feature branches for large phases: `git checkout -b phase3-finetuning`
- Merge back to `main` only when the feature is complete and tested.
- Delete feature branches after merging.

### 10.5 .env Is Never Committed
- `.env` is in `.gitignore`.
- Before `git add`, verify with `git status` that `.env` does not appear.
- If accidentally committed: rotate the key immediately at console.groq.com.

---

## 11. Testing Rules

### 11.1 Test After Every Significant Change
After modifying any of these files, run the relevant tests:

| File Changed | Test |
|---|---|
| `agent.py` | Test with 3+ questions in both Simple and Thinking modes |
| `vector_store.py` | Test add + query + delete cycle |
| `conversations.py` | Test save + load + switch + delete |
| `file_processor.py` | Test with PDF, DOCX, TXT, unsupported type |
| `chunker.py` | Test with text of various lengths |
| `app.py` | Full end-to-end: upload → question → verify answer |

### 11.2 Test Both Modes
Every change to the query pipeline must be tested in both Simple and Thinking modes. Never assume one mode works if the other does.

### 11.3 Test with Real Documents
- Use at least 3 different document types (PDF, DOCX, TXT).
- Use documents of different lengths (short < 1 page, medium 5-20 pages, long 50+ pages).
- Test with documents that have: headers, tables, lists, code blocks, multi-column layouts.

### 11.4 No Test Data in Repo
- Do not commit test PDFs or test data files.
- Use local files for testing.
- If a sample document is needed for documentation, reference it, don't commit it.

---

## 12. Performance Rules

### 12.1 Expensive Resources Load Once
- Embedding model: loaded once at module level (`vector_store.py`), cached in Streamlit.
- ChromaDB collection: loaded once via `@st.cache_resource`.
- Fine-tuned model (future): loaded once via `@st.cache_resource`.

### 12.2 Parallelize Independent Operations
- Chunk grading (up to 5 chunks): parallel with `ThreadPoolExecutor(max_workers=5)`.
- Claim verification (up to N claims): parallel with `ThreadPoolExecutor(max_workers=5)`.
- Sequential LLM calls are acceptable when they depend on each other.

### 12.3 Response Time Targets
| Component | Target | Action if Exceeded |
|---|---|---|
| Document processing | <5s per file | Show progress indicator |
| Retrieval | <1s | Check collection size |
| LLM answer (Groq) | <10s | Not controllable — show spinner |
| Hallucination evaluation | <15s | Limit number of claims checked |
| Full pipeline | <20s | Show clear thinking message |

---

## 13. Documentation Rules

### 13.1 Tracker Must Be Updated
- After each completed task, update the Excel tracker (`Project_Tracker_Solo_Updated.xlsx`).
- Change status from "Not Started" → "Done".
- Fill in notes with observations.

### 13.2 Cheat Sheet Accuracy Numbers
- Before the demo, replace `[X]%`, `[Y]%`, `[Z]%` in the Panel Q&A Cheat Sheet with real measured numbers.
- GitHub link must be updated with the actual repository URL.

### 13.3 Code Comments Explain Why
```python
# Good: explains rationale
# Skip chunks under 50 chars to filter out garbage from headers and page numbers
if len(piece) < 50:
    continue

# Bad: restates the code
# Skip short chunks
if len(piece) < 50:
    continue
```

---

## 14. Prohibited Practices

| Practice | Rule | Why |
|---|---|---|
| Bare `except:` | 9.1 | Swallows critical errors, impossible to debug |
| `print()` for logging | 8.1 | No timestamps, no severity levels, no output control |
| Hardcoded magic numbers | 2.1 | Impossible to tune, easy to miss on change |
| Direct `client.chat.completions.create()` | 3.1 | Bypasses rate limiting and error handling |
| New `SentenceTransformer()` instances | 4.5 | Produces incompatible vector spaces |
| Direct file writes (no `.tmp`) | 5.1 | Risk of JSON corruption on crash |
| Showing tracebacks to users | 6.1 | Unprofessional, exposes internals |
| Committing `.env` | 7.4 | API key leak |
| Relative imports | 1.4 | Inconsistent with absolute imports policy |
| Importing `streamlit` in `backend/` | 1.9 | Creates circular dependency risk |
| `st.rerun()` to fix state issues | 6.8 | Fix the state, don't reset the world |
| Wildcard imports | 1.4 | Namespace pollution, unclear dependencies |
| Commented-out code in committed files | 1.8 | Git has history, dead code is noise |
| Testing in only one mode | 11.2 | Other mode breaks silently |
| Duplicate imports in a file | 1.4 | Code smell, potential for confusion |
| Skipping the safety-net tag | 10.3 | No insurance before fine-tuning |

---

## 15. Quick Decision Tree

```
"What should I name this file?"
→ snake_case.py in backend/

"Where does this function go?"
→ Calls Groq?           → agent.py
→ Reads/writes files?   → file_processor.py
→ Splits text?          → chunker.py
→ Embeddings/ChromaDB?  → vector_store.py
→ JSON persistence?     → conversations.py
→ Constants/config?     → config.py

"What temperature should I use?"
→ Classification (routing, grading, eval)? → 0.0
→ Answer generation?            → 0.1
→ Query rewriting / follow-ups? → 0.2-0.3
→ Check config.py first. If not there, add it.

"How do I call the LLM?"
→ _groq_call(messages=..., temperature=..., stream=True/False)
→ Never client.chat.completions.create() directly.

"How do I make parallel LLM calls?"
→ ThreadPoolExecutor(max_workers=5), submit each, as_completed().

"Where do I put a new config value?"
→ backend/config.py, UPPER_SNAKE_CASE, import where needed.

"How do I call the embedder?"
→ from backend.vector_store import EMBEDDER
→ Never SentenceTransformer(...) directly.

"How do I persist conversations?"
→ Use save_all() in conversations.py — it handles atomic writes.

"What do I do when the app crashes?"
→ Check docchat.log for the full traceback. User sees only st.error().

"I need to reset everything."
→ Delete chroma_db/, conversations/, docchat.log. Keep app.py and backend/.

"The app is slow."
→ Check: (1) Is embedder loading every rerun? Should be cached.
→ Check: (2) Is ChromaDB reloading? Should be cached.
→ Check: (3) Are LLM calls sequential when parallel is possible?

"Can I add a cloud service?"
→ No. Discuss with the project owner first. Default is local-only.

"Can I change the Groq model?"
→ Change MODEL_NAME in config.py. That's it. One constant.
```
