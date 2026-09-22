# System Architecture — DocChat
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot
**Last Updated:** September 2025

---

## 1. High-Level System Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER (Browser)                              │
│                     http://localhost:8501                            │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │  Streamlit    │
                    │     app.py    │  ← Entry point. All UI logic.
                    └───────┬───────┘
                            │ imports
          ┌─────────────────┼─────────────────┐
          │                 │                 │
  ┌───────▼───────┐ ┌───────▼───────┐ ┌───────▼───────┐
  │  backend/     │ │  backend/     │ │  backend/     │
  │  config.py    │ │ conversations │ │  file_        │
  │  (constants)  │ │  .py          │ │  processor.py │
  └───────────────┘ └───────────────┘ └───────────────┘
          │                 │                 │
          │                 │                 │ reads files (PDF/DOCX/TXT)
          │                 │                 │
          └────────┬────────┴────────┬────────┘
                   │                 │
          ┌────────▼────────┐  ┌─────▼──────────┐
          │  backend/       │  │  backend/      │
          │  chunker.py     │  │  vector_       │
          │                 │  │  store.py      │
          │  Split text     │  │                │
          │  into chunks    │  │  Embed + store │
          │  (500 chars)    │  │  in ChromaDB   │
          └────────┬────────┘  │  (persistent)  │
                   │           └─────┬──────────┘
                   │                 │
                   │           ┌─────▼──────────┐
                   │           │  chroma_db/    │
                   │           │  (on disk)     │
                   │           └────────────────┘
                   │
          ┌────────▼────────────────────────────────────┐
          │  backend/agent.py                           │
          │  ┌──────────┐ ┌────────┐ ┌───────────────┐ │
          │  │  Router   │ │ Chunk  │ │  Hallucination │ │
          │  │  (LLM 1)  │ │ Grader │ │  Evaluator    │ │
          │  │           │ │ (LLM×N)│ │  (LLM×M)      │ │
          │  └──────────┘ └────────┘ └───────────────┘ │
          │  ┌──────────────────────────────────────┐   │
          │  │  Follow-up Generator (LLM 1 call)   │   │
          │  └──────────────────────────────────────┘   │
          └───────────────────┬────────────────────────┘
                              │ calls via API
                      ┌───────▼────────┐
                      │  Groq API      │
                      │  (cloud LLM)   │
                      │  llama3-8b-    │
                      │  8192 or       │
                      │  openai/gpt-  │
                      │  oss-20b       │
                      └────────────────┘

  ┌───────────────────────────────────────────────────────────┐
  │  conversations/ (on disk, JSON)                          │
  │  ├── 01/user_1.json                                      │
  │  │   [{"id": "uuid", "title": "What is...",             │
  │  │     "messages": [...], "is_archived": false,          │
  │  │     "updated_at": 1700000000}, ...]                   │
  │  └── ...                                                 │
  └───────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────┐
  │  .env (gitignored)                                       │
  │  GROQ_API_KEY=gsk_...                                    │
  └───────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────┐
  │  docchat.log                                             │
  │  Timestamped log output for debugging                    │
  └───────────────────────────────────────────────────────────┘
```

---

## 2. Module-by-Module Architecture

### 2.1 `app.py` — Entry Point and UI Layer
**File:** `app.py` (469 lines)
**Role:** Streamlit UI, orchestrator, user interaction handler.

#### Responsibilities
1. Streamlit page configuration and custom CSS branding.
2. Sidebar: RAG mode toggle, document upload, file management, conversation history.
3. Main area: chat message rendering, input bar, answer display with citations and hallucination analysis.
4. Conversation lifecycle: create, switch, persist, export.
5.  protection at the input level.

#### Key Constants and State
| Variable | Type | Purpose |
|---|---|---|
| `USER_ID` | `int` | Hardcoded to `1`. Single-user app. |
| `PROMPT_INJECTION_PATTERNS` | `list[re.Pattern]` | 11 compiled regex patterns for blocking . |
| `coll` | `chromadb.Collection` | Cached ChromaDB collection (loaded once via `@st.cache_resource`). |
| `st.session_state.messages` | `list[dict]` | Current chat messages. Each assistant message may carry `sources`, `quotes`, `hallucination_score`, `eval_reason`, `followups`. |
| `st.session_state.processed_files` | `set[str]` | Filenames already indexed in the current session. |
| `st.session_state.current_conversation_id` | `str | None` | UUID of the active conversation. |
| `st.session_state.pending_prompt` | `str | None` | Follow-up question to auto-submit on next rerun. |
| `st.session_state._conversation_dirty` | `bool` | Whether the current conversation has unsaved changes. |

#### Request Flow (Simple Mode)
```
User types question
        │
        ▼
Prompt injection check (11 regex patterns)
        │
   blocked? ──yes──► Warning message, log, stop
        │
       no
        │
   Any files uploaded?
        │
    no ──► "Please upload documents first", stop
        │
   yes
        │
        ▼
   Append user message to session state
   Render user message in chat UI
        │
        ▼
   ┌── query_collection(coll, question, user_id=1, top_k=5)
   │   → ChromaDB similarity search → top 5 chunks + metadata
   │
   │   Check if chunks found?
   │   no ──► Refusal message
   │   yes ──▼
   │   Build  + user message (context + question)
   │   Call stream_response(messages) → yields text deltas
   │   Render answer via st.write_stream()
   │
   ├── Extract source filenames from metadata
   │   Render source captions
   │   Render supporting excerpts (top 2 chunks, truncated to 160 chars)
   │
   ├── evaluate_hallucination(answer, raw_context)
   │   → Claim extraction (LLM call)
   │   → Parallel claim verification (LLM calls × N)
   │   → groundedness_score + hallucination_score
   │   Render expandable "Hallucination Analysis" panel
   │
   └── generate_followups(answer, raw_context)
       → 3 follow-up questions (LLM call)
       Render as clickable buttons
        │
        ▼
   Append assistant message to session state (with all metadata)
   Mark conversation dirty
        │
        ▼
   persist_current_conversation() if dirty
   → build_conversation() → upsert_conversation(USER_ID, conv)
   → Atomic write to conversations/01/user_1.json
```

#### Request Flow (Thinking / Agentic Mode)
```
Same as Simple, BUT:
        │
        ▼
   prepare_agentic_context(coll, question, user_id=1)
   │
   ├── _route_query(question)
   │   → LLM call 1: JSON response {"route": "retrieve" | "direct"}
   │   if "direct" → skip retrieval, answer as general chat
   │
   ├── query_collection() → raw chunks
   │
   ├── _grade_chunks(question, raw_chunks)
   │   → For each chunk: LLM call (parallel, max_workers=5)
   │   → JSON response {"relevant": true/false}
   │   → Keep only relevant chunks
   │
   ├── If no relevant chunks after grading:
   │   ├── _rewrite_query(question)
   │   │   → LLM call: rewrite into keyword-optimized query
   │   ├── query_collection() with rewritten query → new raw chunks
   │   └── _grade_chunks(rewritten_question, new_chunks)
   │
   ├── If still no relevant chunks → "refusal"
   │
   └── Return: (status, relevant_docs, results, raw_context)
        │
        ▼
   [Same answer generation, hallucination eval, follow-ups as Simple mode]
```

#### Sidebar Layout (Top to Bottom)
1. **Settings header** — RAG Mode segmented control (Simple / Thinking).
2. **Divider.**
3. **Document Vault header** — New Chat button + Export button (side by side).
4. **File uploader** — Accepts PDF, DOCX, TXT. Multiple files.
5. **Processing** — For each new file: `extract_text()` → `chunk_text()` → `add_chunks()` → spinner + success/error message.
6. **Indexed Files** — List of uploaded files with per-file delete button (trash icon). "Clear All Documents" button below.
7. **Previous chats** — List of past conversations (if any) with clickable buttons. Active conversation highlighted as primary.

---

### 2.2 `backend/config.py` — Centralized Configuration
**File:** `backend/config.py` (36 lines)
**Role:** Single source of truth for all configuration constants.

#### Constants
| Constant | Value | Purpose |
|---|---|---|
| `EMBEDDER_NAME` | `"all-MiniLM-L6-v2"` | Hugging Face model ID for sentence embeddings. |
| `CHUNK_SIZE` | `500` | Characters per chunk when splitting text. |
| `CHUNK_OVERLAP` | `50` | Character overlap between consecutive chunks. |
| `TOP_K` | `5` | Number of chunks to retrieve per query. |
| `SIMILARITY_THRESHOLD` | `0.10` | Cosine similarity floor (for future retrieval gate use). |
| `TEMPERATURE_ROUTING` | `0.0` | LLM temperature for the router classification. |
| `TEMPERATURE_GRADING` | `0.0` | LLM temperature for chunk relevance grading. |
| `TEMPERATURE_REWRITE` | `0.2` | LLM temperature for query rewriting. |
| `TEMPERATURE_DIRECT` | `0.3` | LLM temperature for direct (non-retrieval) answers. |
| `TEMPERATURE_ANSWER` | `0.1` | LLM temperature for the final answer generation. |
| `TEMPERATURE_EVAL` | `0.0` | LLM temperature for hallucination evaluation (deterministic). |
| `TEMPERATURE_FOLLOWUPS` | `0.3` | LLM temperature for follow-up question generation. |
| `MODEL_NAME` | `"openai/gpt-oss-20b"` | The Groq model identifier used for all LLM calls. |
| `API_TIMEOUT` | `30` | Request timeout in seconds for Groq API calls. |
| `CHROMA_DB_PATH` | `"./chroma_db"` | Filesystem path for persistent ChromaDB storage. |
| `CHROMA_COLLECTION_NAME` | `"documents"` | ChromaDB collection name. |
| `MAX_QUERIES_PER_MINUTE` | `20` | Rate limit: max Groq API calls in any 60-second window. |
| `AGENTIC_CALL_THRESHOLD` | `5` | Log a warning if a Thinking-mode query triggers more than this many API calls. |

#### Design Notes
- All temperatures are set to `0.0` for deterministic, classification-style tasks (routing, grading, evaluation).
- `TEMPERATURE_REWRITE` and `TEMPERATURE_FOLLOWUPS` allow slight creativity for text generation tasks.
- `TEMPERATURE_ANSWER` is kept very low (0.1) to minimize hallucination in the final answer.
- `MODEL_NAME` is configurable — changing this one constant switches all LLM calls.

---

### 2.3 `backend/file_processor.py` — Document Text Extraction
**File:** `backend/file_processor.py` (35 lines)
**Role:** Extract plain text from uploaded files.

#### Function
```python
def extract_text(file) -> str
```

#### Behavior by File Type
| Extension | Library Used | Method |
|---|---|---|
| `.pdf` | `pypdf.PdfReader` | Iterate pages, extract text from each page via `page.extract_text()` |
| `.docx` | `docx.Document` | Iterate paragraphs via `document.paragraphs`, join with `\n` |
| `.txt` | Built-in | `file.read().decode("utf-8")` |
| Other | — | Raises `ValueError("Unsupported file type")` |

#### Error Handling
- If extracted text is empty or whitespace-only: raises `RuntimeError("No text found. This may be a scanned image PDF.")`.
- This catches scanned PDFs that pypdf cannot extract text from.

#### Return Value
Plain text string. Ready for chunking.

---

### 2.4 `backend/chunker.py` — Text Chunking
**File:** `backend/chunker.py` (25 lines)
**Role:** Split extracted text into overlapping chunks with metadata.

#### Function
```python
def chunk_text(text: str, source_filename: str) -> list[dict]
```

#### Process
1. Create a `RecursiveCharacterTextSplitter` with `chunk_size=500` and `chunk_overlap=50`.
2. Call `split_text(text)` to get raw text pieces.
3. Filter: skip any piece shorter than 50 characters.
4. For each remaining piece, create a chunk dict:
   ```python
   {
       "text": piece,              # The chunk text
       "source": source_filename,  # Original filename
       "chunk_id": len(chunks)     # Sequential index (0, 1, 2, ...)
   }
   ```

#### Return Value
`list[dict]` — typically 1-200 chunks depending on document size.

#### Design Rationale
- **500 characters** is large enough to contain coherent context but small enough for the LLM to process within its context window.
- **50-character overlap** prevents sentences at chunk boundaries from being lost — the same concept appears in both adjacent chunks.
- **50-character minimum** filters out garbage chunks (headers, page numbers, whitespace).

---

### 2.5 `backend/vector_store.py` — Embeddings and ChromaDB
**File:** `backend/vector_store.py` (104 lines)
**Role:** Manage the vector database — embed text, store chunks, retrieve similar chunks.

#### Module-Level Singleton
```python
EMBEDDER = SentenceTransformer(EMBEDDER_NAME)  # Loaded ONCE at import time
```
This is **critical** — the same `EMBEDDER` instance must be used by the hallucination detection code (imported from this module) to ensure vector compatibility.

#### Functions

##### `get_collection(path=CHROMA_DB_PATH)`
- Creates/opens a `chromadb.PersistentClient` at the given path.
- Returns (or creates) the `documents` collection.
- ChromaDB persists data to disk — chunks survive app restarts.

##### `add_chunks(collection, chunks, user_id)`
1. Extract `text` from each chunk dict.
2. Batch-encode all texts using `EMBEDDER.encode(texts).tolist()`.
3. Generate IDs: `f"u{user_id}_{source}_c{chunk_id}"` — e.g., `u1_research_paper_c0`.
4. Create metadata dicts: `{source, chunk_id, user_id}`.
5. Call `collection.add(documents, embeddings, ids, metadatas)`.

##### `query_collection(collection, question, user_id, top_k=5)`
1. Encode the question using `EMBEDDER.encode([question]).tolist()`.
2. Call `collection.query(query_embeddings=..., n_results=top_k, where={"user_id": user_id}, include=["documents", "metadatas", "distances"])`.
3. Returns a dict with `documents`, `metadatas`, `distances` — each is a list of lists (ChromaDB returns nested lists).

**Important:** The `where={"user_id": user_id}` filter ensures users only retrieve their own documents. This is the multi-tenancy mechanism.

##### `delete_document_chunks(collection, filename, user_id)`
1. Get all metadata for the user: `collection.get(where={"user_id": user_id}, include=["metadatas"])`.
2. Filter IDs where `meta["source"] == filename`.
3. Delete those IDs from the collection.

##### `clear_user_vault(collection, user_id)`
- Calls `collection.delete(where={"user_id": user_id})` to remove all chunks for a user.

##### `get_user_documents(collection, user_id)`
- Gets all metadata for the user.
- Extracts unique `source` values into a sorted list.
- Returns `list[str]` of filenames.

#### Data Format in ChromaDB
| Field | Type | Example |
|---|---|---|
| `id` | str | `u1_paper_c0` |
| `document` | str | "Machine learning is a subset of artificial intelligence..." |
| `embedding` | list[float] | [0.123, -0.456, ...] (384 floats) |
| `metadata.source` | str | `"paper.pdf"` |
| `metadata.chunk_id` | int | `0` |
| `metadata.user_id` | int | `1` |

---

### 2.6 `backend/conversations.py` — Conversation Persistence
**File:** `backend/conversations.py` (88 lines)
**Role:** Save, load, and manage conversation history on disk using JSON files.

#### File Organization
```
conversations/
└── 01/                    ← Last 2 digits of user_id (for user 1: "01")
    └── user_1.json        ← All conversations for user 1, as a JSON array
```

#### Data Structure (Each Conversation)
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "What is the main finding...",   // First user message, max 25 chars
    "messages": [
        {
            "role": "user",
            "content": "What is the main finding of this paper?"
        },
        {
            "role": "assistant",
            "content": "The main finding is...",
            "sources": ["`paper.pdf`"],
            "quotes": ["\"The study found that...\""],
            "hallucination_score": 5,
            "eval_reason": "4/5 claims verified against source context.",
            "followups": ["What methodology was used?", ...]
        }
    ],
    "is_archived": false,
    "updated_at": 1700000000.123  // epoch float, updated on every change
}
```

#### Functions

##### `_get_path(user_id) -> str`
- Computes the JSON file path for a user.
- Uses `user_id % 100` (last 2 digits) for directory nesting.
- Creates directory with `os.makedirs(base, exist_ok=True)`.

##### `load_all(user_id) -> list[dict]`
- Reads the JSON file if it exists.
- Returns conversations sorted by `updated_at` descending (newest first).
- Returns `[]` if file doesn't exist or on error.

##### `save_all(user_id, conversations) -> None`
- **Atomic write**: writes to `{path}.tmp` first, then `os.replace(tmp_path, path)`.
- If the process crashes during write, the original file is intact.
- On error: removes the `.tmp` file if it exists, re-raises the exception.

##### `get_conversation(user_id, conversation_id) -> dict | None`
- Loads all conversations, finds the one matching `conversation_id`.

##### `upsert_conversation(user_id, conv) -> None`
- Loads all conversations.
- Updates `updated_at` to `time.time()`.
- If conversation with same `id` exists: replace it.
- If not: insert at position 0 (newest first).
- Saves back to disk.

##### `delete_conversation(user_id, conversation_id) -> None`
- Filters out the conversation by `id`, saves the rest.

##### `build_conversation(conv_id, messages) -> dict`
- Creates a new conversation dict.
- Title: first user message, sliced to 25 chars + "..." if longer.
- Generates a new UUID if `conv_id` is None.

---

### 2.7 `backend/agent.py` — LLM Orchestration and Agentic Logic
**File:** `backend/agent.py` (315 lines)
**Role:** All LLM interactions — routing, grading, rewriting, answer streaming, hallucination evaluation, follow-up generation.

This is the most complex module. It manages the Groq API client and contains every function that calls an LLM.

#### Module-Level Setup
```python
load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
```
The Groq client is created **once** at import time using the API key from `.env`.

#### Rate Limiter
- `_query_log: list[float]` — timestamps of recent API calls (in-memory).
- `_check_rate_limit()` — removes timestamps older than 60 seconds. If count >= `MAX_QUERIES_PER_MINUTE` (20), raises `RuntimeError`.

#### Low-Level API Wrapper
```python
def _groq_call(**kwargs) -> dict
```
- Sets default `model` (from `MODEL_NAME`) and `timeout` (from `API_TIMEOUT`).
- Calls `_check_rate_limit()` before every API call.
- Logs errors and re-raises exceptions.

#### Agentic Pipeline Functions

##### `_route_query(question) -> str`
**LLM Call 1 per query (in Thinking mode)**
- Sends the question to the LLM with a routing prompt.
- Expected response: `{"route": "retrieve"}` or `{"route": "direct"}`.
- If routing fails: defaults to `"retrieve"`.
- Temperature: `TEMPERATURE_ROUTING` (0.0 — deterministic classification).

**Routing Prompt:**
```
You are an AI router. Determine if the user's input requires searching private documents
or if it is general conversational chat/greeting.
Respond ONLY with valid JSON: {"route": "retrieve" | "direct"}

Input: {question}
```

##### `_grade_chunks(question, chunks) -> list[str]`
**N parallel LLM calls, where N = number of retrieved chunks (up to 5)**
- For each chunk, creates a grading prompt asking if the chunk contains facts useful to answer the question.
- Expected response per chunk: `{"relevant": true}` or `{"relevant": false}`.
- Runs all calls in parallel using `ThreadPoolExecutor(max_workers=5)`.
- If grading fails for a chunk: defaults to `True` (keeps it — better to include a possibly irrelevant chunk than exclude a relevant one).
- Temperature: `TEMPERATURE_GRADING` (0.0 — deterministic).

**Grading Prompt (per chunk):**
```
Evaluate if the following excerpt contains facts useful to answer the question.
Respond ONLY with valid JSON: {"relevant": true | false}

Question: {question}
Excerpt: {chunk}
```

##### `_rewrite_query(question) -> str`
**LLM Call (only if grading finds no relevant chunks)**
- Asks the LLM to rewrite the user's question into a keyword-optimized search query.
- Temperature: `TEMPERATURE_REWRITE` (0.2 — slightly creative).
- If rewrite fails: returns the original question unchanged.

**Rewrite Prompt:**
```
Rewrite this user question into a dense, keyword-optimized semantic search query.
Return ONLY the rewritten search string with no conversational filler.

User Query: {question}
```

##### `prepare_agentic_context(collection, question, user_id) -> tuple`
**Main orchestrator for Thinking mode.**
1. Calls `_route_query()` — if "direct", returns immediately.
2. Calls `query_collection()` to get raw chunks.
3. Calls `_grade_chunks()` to filter relevant chunks.
4. If no relevant chunks: rewrites the query, retrieves again, regrades.
5. If still no relevant chunks: returns `"refusal"`.
6. Otherwise: joins relevant chunks with `"\n\n---\n\n"` separator and returns `"retrieved"`.

**Returns:** `(status, relevant_docs, results, raw_context)`
- `status`: `"direct"`, `"refusal"`, or `"retrieved"`.
- `relevant_docs`: list of relevant chunk texts.
- `results`: full ChromaDB result dict.
- `raw_context`: joined string of relevant chunks.

#### Answer Generation

##### `stream_response(messages, temperature) -> Generator[str, None, None]`
- Calls Groq with `stream=True`.
- Yields text deltas as they arrive from the API.
- Used in `app.py` with `st.write_stream()` for real-time token display.
- Temperature: `TEMPERATURE_ANSWER` (0.1).

#### Follow-Up Generation

##### `generate_followups(answer, context) -> list[str]`
**LLM Call 1 per answer**
- Sends the answer + first 1500 chars of context to the LLM.
- Expected response: `{"questions": ["q1", "q2", "q3"]}`.
- Returns at most 3 questions.
- Temperature: `TEMPERATURE_FOLLOWUPS` (0.3 — creative but controlled).

#### Hallucination Evaluation

##### `evaluate_hallucination(answer, context) -> dict`
**2 LLM calls minimum + up to N parallel calls (where N = number of extracted claims)**

This is the two-layer detection system implemented as a **single function** using a claim-verification approach:

**Step 1: Claim Extraction (LLM Call)**
- Sends the answer to the LLM asking it to extract every distinct factual claim.
- Expected response: `{"claims": ["claim1", "claim2", ...]}`.
- Temperature: `TEMPERATURE_EVAL` (0.0 — deterministic).
- If extraction fails: treats the entire answer as one claim.

**Claim Extraction Prompt:**
```
Extract every distinct factual claim from the following answer.
Return ONLY a JSON array of claim strings.

ANSWER:
{answer}
```

**Step 2: Parallel Claim Verification (N parallel LLM calls)**
- For each extracted claim, sends it to the LLM asking if it has direct textual support in the context.
- Expected response per claim: `{"supported": true}` or `{"supported": false}`.
- Runs all verification calls in parallel using `ThreadPoolExecutor(max_workers=5)`.
- Temperature: `TEMPERATURE_EVAL` (0.0 — deterministic).
- If verification fails: defaults to `True` (assume supported on error — conservative approach).

**Verification Prompt (per claim):**
```
Does the following CLAIM have direct textual support in the CONTEXT?
Respond ONLY with valid JSON: {"supported": true | false}

CONTEXT:
{context}

CLAIM:
{claim}
```

**Step 3: Scoring**
```python
groundedness_score = (supported_claims / total_claims) * 100
hallucination_score = 100 - groundedness_score
```
Both scores are clamped to [0, 100].

**Return Value:**
```python
{
    "groundedness_score": int,   # 0-100
    "hallucination_score": int,  # 0-100
    "reasoning": str             # e.g., "4/5 claims verified against source context."
}
```

#### Legacy Function (Not Called from app.py)

##### `run_agentic_rag(collection, question, user_id) -> tuple`
- A non-streaming version of the agentic pipeline.
- Calls `prepare_agentic_context()` then makes a single non-streaming LLM call for the answer.
- Returns `(answer, results, raw_context)`.
- **This function is not called from `app.py`** — `app.py` uses `prepare_agentic_context()` + `stream_response()` instead.
- It remains in the codebase as a potential utility for future use or testing.

---

## 3. Data Flow Diagrams

### 3.1 Document Ingestion Flow
```
[User uploads file via sidebar]
            │
            ▼
[app.py] ──► extract_text(file)
            │        │
            │        ├── PDF → PdfReader → text
            │        ├── DOCX → Document → text
            │        └── TXT → file.read() → text
            │
            ▼
        chunk_text(text, filename)
            │
            │  RecursiveCharacterTextSplitter(500, 50)
            │  Filter chunks < 50 chars
            │
            ▼
        add_chunks(collection, chunks, user_id=1)
            │
            ├── EMBEDDER.encode(chunk_texts) → embeddings
            ├── Generate IDs: u1_{source}_c{id}
            ├── Generate metadata: {source, chunk_id, user_id}
            │
            ▼
        ChromaDB persistent store (./chroma_db/)
            │
            ▼
        [UI: "Indexed: filename (N chunks)"]
```

### 3.2 Query Flow — Simple Mode
```
[User types question]
            │
            ▼
[_check_prompt_injection()] ── blocked? → warning + stop
            │
            ▼
[Any files processed?] ── no → "Upload documents" + stop
            │
            ▼
[Append user message → render in chat]
            │
            ▼
[query_collection(collection, question, user_id=1, top_k=5)]
            │
            ├── EMBEDDER.encode([question]) → question_embedding
            ├── collection.query(embedding, n_results=5, where={user_id: 1})
            └── Returns: {documents, metadatas, distances}
            │
            ▼
[Check: any chunks found?] ── no → "I do not have sufficient information..."
            │
            ▼
[Build  + messages]
            │  System: "Answer using the context. Maintain a natural, helpful tone."
            │  User: "CONTEXT:\n{chunks}\n\nQUESTION: {question}"
            │
            ▼
[stream_response(messages)]
            │
            ├── _groq_call(stream=True)
            ├── Groq streams tokens → yield delta
            └── st.write_stream() renders tokens in real-time
            │
            ▼
[Extract sources from metadatas]
            │  Format: `filename`
            │
            ▼
[Render: answer + sources + supporting excerpts]
            │
            ▼
[evaluate_hallucination(answer, context)]
            │
            ├── Claim extraction (LLM call)
            ├── Parallel claim verification (N LLM calls)
            ├── groundedness_score = supported/total * 100
            └── hallucination_score = 100 - groundedness
            │
            ▼
[Render expandable "Hallucination Analysis" panel]
            │
            ▼
[generate_followups(answer, context)]
            │
            ├── LLM call: generate 3 follow-up questions
            └── Returns list of 3 strings
            │
            ▼
[Render follow-up buttons]
            │
            ▼
[Append assistant message to session_state.messages]
            │  Includes: content, sources, quotes,
            │           hallucination_score, eval_reason, followups
            ▼
[Persist conversation to conversations/01/user_1.json]
```

### 3.3 Query Flow — Thinking (Agentic) Mode
```
[User types question]
            │
            ▼
[Same injection check + file check as Simple mode]
            │
            ▼
[Append user message → render in chat]
            │
            ▼
[prepare_agentic_context(collection, question, user_id=1)]
            │
            ├── _route_query(question) → LLM call 1
            │   "retrieve" or "direct"
            │
            ├── IF "direct":
            │   Return immediately → answer as general chat (no context)
            │
            ├── query_collection() → raw chunks (top 5)
            │
            ├── _grade_chunks(question, raw_chunks) → parallel LLM calls
            │   For each chunk: "Is this relevant?" → JSON {relevant: T/F}
            │
            ├── IF no relevant chunks:
            │   ├── _rewrite_query(question) → LLM call: rewrite
            │   ├── query_collection(rewritten_query) → new raw chunks
            │   └── _grade_chunks(rewritten_question, new_chunks)
            │
            ├── IF still no relevant chunks → "refusal"
            │
            └── Join relevant chunks → raw_context
            │
            ▼
[Build  + messages]
            │  System: "Answer strictly using the provided context. Do not invent or extrapolate."
            │  User: "CONTEXT:\n{chunks}\n\nQUESTION: {question}"
            │
            ▼
[stream_response(messages)] → same as Simple mode
            │
            ▼
[Same hallucination evaluation + follow-up generation + persistence as Simple mode]
```

### 3.4 Conversation Persistence Flow
```
[New conversation started]
            │
            ▼
[User sends messages, appends to st.session_state.messages]
            │
            ▼
[_needs_persist() checks _conversation_dirty flag]
            │
            ▼
[persist_current_conversation()]
            │
            ├── build_conversation(current_id, messages)
            │   ├── Generate UUID if first conversation
            │   ├── Title: first user message, max 25 chars
            │   └── Add updated_at = time.time()
            │
            ├── upsert_conversation(USER_ID, conversation)
            │   │
            │   ├── load_all(USER_ID) → read conversations/01/user_1.json
            │   ├── Update or insert conversation
            │   ├── Set updated_at = now
            │   │
            │   ├── save_all(USER_ID, conversations)
            │   │   ├── Write to user_1.json.tmp (JSON dump)
            │   │   ├── os.replace(tmp, user_1.json) ← atomic
            │   │   └── On error: remove .tmp file
            │   │
            │   └── Update st.session_state.current_conversation_id
            │
            └── _mark_clean() → _conversation_dirty = False
```

---

## 4. File Formats

### 4.1 `.env` File
```
GROQ_API_KEY=gsk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```
- Single variable: Groq API key.
- Loaded by `dotenv` at import time of `agent.py` and `conversations.py`.
- Gitignored — never committed.

### 4.2 Conversation JSON File
- Location: `conversations/{NN}/user_{id}.json`
- Format: JSON array of conversation objects.
- Top-level is always a list (even for one conversation).

### 4.3 ChromaDB Storage
- Location: `./chroma_db/`
- Format: ChromaDB's internal SQLite + Parquet files (managed by the library, not human-editable).
- Collection name: `documents`
- Contains: documents, embeddings, metadata, IDs.

### 4.4 Log File
- Location: `docchat.log`
- Format: Standard Python logging format: `2025-09-22 02:07:15,123 [INFO] docchat.agent: Added 15 chunks for user 1`
- Rotated by Python's `RotatingFileHandler` if configured (currently not — file grows unbounded).

---

## 5. UI Layout Specification

### 5.1 Page Configuration
```python
st.set_page_config(page_title="DocChat", layout="wide")
```
- Title: "DocChat" (appears in browser tab).
- Layout: wide (full browser width, not narrow column).

### 5.2 Custom CSS (Injected via st.markdown)
```css
/* Hide the Streamlit header (hamburger menu + "Made with Streamlit") */
.stApp > header { display: none; }

/* Title styling */
.main-title {
    font-size: 1.6rem;
    font-weight: 700;
    color: #0a0a0a;
    margin-bottom: 0.1rem;
}

/* Subtitle styling */
.main-subtitle {
    font-size: 0.85rem;
    color: #6b7280;
    margin-bottom: 1.2rem;
}
```

### 5.3 Sidebar Components (Top to Bottom)
| Component | Widget Type | Details |
|---|---|---|
| RAG Mode | `st.segmented_control` | Options: `["Simple", "Thinking"]`. Default: `"Simple"`. Label: `"RAG Mode"`, visibility: `collapsed`. |
| New Chat | `st.button` | Icon: `:material/edit_square:`. Calls `start_new_conversation()`. |
| Export | `st.download_button` | Available only when `st.session_state.messages` is non-empty. Downloads `chat_export.md`. |
| File Uploader | `st.file_uploader` | Label: `"Upload reference documents"`. Types: `["pdf", "docx", "txt"]`. Multiple: `True`. |
| Indexed Files | `st.subheader` + per-file buttons | Each file: caption with 📎 icon + delete button (🗑️). "Clear All Documents" button below. |
| Previous Chats | `st.subheader` + buttons | Listed only if `load_all(USER_ID)` returns results. Active conversation gets `type="primary"`. |

### 5.4 Main Chat Area Components
| Component | Widget Type | Details |
|---|---|---|
| Title | `st.markdown` | `<div class="main-title">DocChat</div>` |
| Subtitle | `st.markdown` | `<div class="main-subtitle">Chat with your documents</div>` |
| Chat Messages | `st.chat_message` | Rendered in a loop over `st.session_state.messages`. |
| User Messages | `st.markdown` | Just the text content. |
| Assistant Messages | `st.markdown` (answer) + `st.caption` (sources) + `st.expander` (quotes, hallucination) + buttons (followups) | |
| Input | `st.chat_input` | Placeholder: `"Ask a question about your documents..."` |

### 5.5 Assistant Message Rendering
Each assistant message renders these elements in order:
1. **Answer text** — `st.markdown(msg["content"])`
2. **Sources** — `st.caption(f"**Sources:** {', '.join(sources)}")` — shown as `\`filename\``.
3. **Supporting Excerpts** — expandable panel with up to 2 quoted passages (truncated to 160 chars).
4. **Hallucination Analysis** — expandable panel (last message only) with:
   - Hallucination Risk percentage + Grounded percentage.
   - Reasoning text.
   - Progress bar (hallucination_score / 100).
5. **Suggested Follow-ups** — clickable buttons (last message only).

---

## 6. Security Architecture

### 6.1  Protection
11 regex patterns block common  attempts at the application level (before the text reaches the LLM):

| Pattern | Blocks |
|---|---|
| `ignore\s+(all\s+)?previous\s+instructions?` | "Ignore all previous instructions" |
| `disregard\s+(all\s+)?(the\s+)?(above\|prior\|previous)` | "Disregard the above" |
| `you\s+are\s+(now\|a\|an)\s+` | "You are now a hacker" |
| `system\s*(prompt\|instruction\|role)` | Direct references to  |
| `override\s+(your\|all)\s+` | "Override your rules" |
| `act\s+as\s+(a\s+)?(?:dan\|jailbreak\|unfiltered\|evil)` | DAN mode, jailbreak attempts |
| `pretend\s+(you\s+)?(?:are\|to\s+be)` | "Pretend you are..." |
| `new\s+instruction[s]?\s*:` | "New instructions:" |
| `\[INST\]\|\[/INST\]\|<<SYS>>\|</SYS>` | Llama-style special tokens |
| `<\|im_start\|>\|<\|im_end\|>` | ChatML special tokens |

All patterns use `re.IGNORECASE`.

### 6.2 API Key Protection
- `GROQ_API_KEY` stored in `.env` (gitignored).
- Loaded via `python-dotenv` (`load_dotenv()`).
- Never logged, never displayed in UI, never sent to any service other than Groq.

### 6.3 Data Isolation
- ChromaDB queries filtered by `where={"user_id": user_id}` — users can only retrieve their own documents.
- Conversation files organized by user ID — no cross-user data leakage.

---

## 7. Error Handling Strategy

### 7.1 Layered Error Handling
1. **API layer** (`_groq_call`): Logs error, re-raises for caller to handle.
2. **Agentic pipeline** (`prepare_agentic_context`): Falls back to retrieval on routing failure, keeps chunks on grading failure, returns original query on rewrite failure.
3. **UI layer** (`app.py` try/except blocks): Catches all exceptions, shows friendly error messages, uses `st.stop()` or `st.error()` to prevent crash.

### 7.2 Graceful Degradation
- Hallucination evaluation failure: Logs error, continues without showing hallucination analysis. Answer is still displayed.
- Follow-up generation failure: Logs error, continues without follow-up buttons.
- Conversation persistence failure: Logs error, shows warning in UI, messages remain in session.
-  detection: Shows warning, does not crash.

---

## 8. Dependencies

### 8.1 Backend Libraries
| Library | Version (minimum) | Purpose |
|---|---|---|
| `streamlit` | 1.28+ | Web UI framework |
| `chromadb` | 0.4+ | Vector database |
| `sentence-transformers` | 2.2+ | Text embedding model |
| `groq` | 0.4+ | Groq API client |
| `python-dotenv` | 1.0+ | Environment variable loading |
| `langchain-text-splitters` | 0.1+ | `RecursiveCharacterTextSplitter` |
| `pypdf` | 3.0+ | PDF text extraction |
| `python-docx` | 1.0+ | DOCX text extraction |

### 8.2 External Services
| Service | Purpose | API Key Required |
|---|---|---|
| **Groq API** (console.groq.com) | LLM inference (all LLM calls) | Yes — `GROQ_API_KEY` in `.env` |

### 8.3 Local Storage
| Path | Purpose | Gitignored |
|---|---|---|
| `./chroma_db/` | Persistent vector database | Yes |
| `conversations/` | Chat history JSON files | Yes |
| `docchat.log` | Application log file | Yes |
| `.env` | API key storage | Yes |

---

## 9. Technology Choices — Rationale

| Choice | Alternatives Considered | Why This One |
|---|---|---|
| **Streamlit** | Flask, Django, FastAPI + React | Pure Python, no HTML/CSS/JS, fastest to build, built-in chat components |
| **ChromaDB** | Pinecone, Weaviate, FAISS | Open-source, local-first, persistent, no external service needed |
| **SentenceTransformer all-MiniLM-L6-v2** | OpenAI embeddings, Cohere | Free, 384-dim, fast enough for offline use, no per-token cost |
| **Groq API** | OpenAI, Anthropic, local model | Free tier available, extremely fast inference (LPU), supports streaming |
| **LangChain TextSplitter** | Custom splitter, spaCy | RecursiveCharacterTextSplitter is the gold standard, minimal overhead |
| **pypdf** | PyMuPDF, pdfplumber | Pure Python, no system dependencies, handles standard PDFs well |
| **JSON for persistence** | SQLite, PostgreSQL | Sufficient for single-user, zero setup, human-readable for debugging |
