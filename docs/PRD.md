# Product Requirements Document — DocChat
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot
**Author:** Yash Taksale (PRN: 202301103086, BT-02, CSE)
**Type:** Solo BTech Final-Year Project
**Last Updated:** September 2025 (during development)

---

## 1. Executive Summary

### The Problem
Large Language Models (LLMs) are powerful but unreliable when asked about specific documents. They mix training knowledge with the document content and generate confident-sounding answers that have **no basis in the uploaded files** — this is called **hallucination**. For students, researchers, and professionals who need to query their own documents (research papers, manuals, reports), hallucination is dangerous: the user cannot tell a correct answer from a fabricated one.

Existing solutions like ChatGPT File Upload or Perplexity do not give users visibility into whether the answer is trustworthy. They present answers with equal confidence regardless of grounding quality.

### The Solution
DocChat is a web application that:

1. Lets users upload documents (PDF, DOCX, TXT).
2. Splits them into chunks and stores them as vector embeddings in a local ChromaDB.
3. 
4. Sends the chunks + question to an LLM with a strict  that forbids outside-knowledge guessing.
5. **Evaluates every answer** using a two-layer hallucination detection system and shows the user a real-time risk assessment (LOW / MEDIUM / HIGH).
6. Shows the user exactly which document passages were used to build the answer.

### Two RAG Modes
| Mode | What Happens | Use Case |
|---|---|---|
| **Simple** | User question → ChromaDB retrieval → LLM answer with strict  | Fast, reliable, 100% grounded answers |
| **Thinking** | User question → Router (is this a doc question or chat?) → Retrieve → Chunk grader (is this chunk relevant?) → Self-correct if no results (query rewrite + retry) → LLM answer | Agentic, deeper reasoning, handles ambiguous queries |

### Key Differentiators from ChatGPT
- **Document-constrained:** The LLM is instructed (and the retrieval gate enforces) that it must ONLY answer from uploaded documents.
- **Hallucination detection:** Two independent layers check every answer and alert the user in real time.
- **Source attribution:** Every answer shows exactly which files and passages it came from.
- **Local-first:** Vector database runs on the user's machine. No data leaves the laptop except API calls to Groq (for LLM inference only).

---

## 2. User Personas

### Primary User: University Student / Researcher
- **Goal:** Upload lecture notes, research papers, and textbooks. Ask specific questions and get answers strictly from those documents.
- **Pain point:** LLMs mix training knowledge with document content. They cannot tell if an answer is correct or hallucinated.
- **How DocChat helps:** Retrieval gate + strict  + hallucination detection + source viewer.

### Secondary User: Solo Developer / Professional
- **Goal:** Query technical documentation, API manuals, code documentation.
- **How DocChat helps:** Same pipeline. Multiple document types supported. Chat history persists across sessions.

---

## 3. Functional Requirements

### FR-1: Document Upload and Processing
- Accept PDF, DOCX, and TXT file uploads via a Streamlit file uploader.
- Extract plain text from uploaded files.
- Reject scanned/image-based PDFs with a clear error message.
- Skip empty or near-empty files (chunks under 50 characters are discarded).

### FR-2: Text Chunking
- Split extracted text using LangChain's `RecursiveCharacterTextSplitter`.
- Default chunk size: **500 characters**.
- Default chunk overlap: **50 characters**.
- Each chunk stores: `text`, `source` (filename), `chunk_id` (sequential index).

### FR-3: Vector Storage and Retrieval
- Embed chunks using `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional vectors).
- Store embeddings in a **persistent** ChromaDB collection at `./chroma_db`.
- Query by question embedding, return top-k=5 chunks filtered by user.
- Support per-file deletion and full vault clearing.
- Embedder instance is created **once at module level** and shared across all modules.

### FR-4: Answer Generation
- Construct a  that strictly constrains the LLM to the provided context.
- Two  variants: one for Simple mode (natural tone), one for Thinking mode (strict, no extrapolation).
- Stream the LLM response token-by-token to the UI using Groq's streaming API.

### FR-5: Retrieval Gate
- Before calling the LLM, check the best similarity score from ChromaDB results.
- If the best score is below the configured threshold, skip the LLM and return the standard refusal phrase.
- This is a hard gate that the LLM cannot override.

### FR-6: Agentic RAG (Thinking Mode)
- **Router:** Classifies the user input as "retrieve" (needs document search) or "direct" (general chat/greeting).
- **Chunk Grader:** For each retrieved chunk, asks the LLM if it is relevant to the question. Runs in parallel using `ThreadPoolExecutor(max_workers=5)`.
- **Query Rewriter:** If no chunks pass grading, rewrites the query into a keyword-optimized search string and retries retrieval.
- **Self-Correction:** If rewriting also fails, returns refusal.

### FR-7: Hallucination Detection
- **Claim Extraction:** The LLM extracts individual factual claims from the generated answer.
- **Claim Verification:** Each claim is independently checked against the retrieved context using the LLM. Runs in parallel.
- **Scoring:** `groundedness_score = (supported_claims / total_claims) * 100`, `hallucination_score = 100 - groundedness_score`.
- Results displayed in an expandable panel with a progress bar.

### FR-8: Follow-Up Suggestions
- After each answer, generate 3 contextual follow-up questions using the LLM.
- Displayed as clickable buttons below the answer.
- Clicking a follow-up submits it as the next user question.

### FR-9: Conversation Persistence
- All conversations saved to JSON files on disk under `conversations/{user_id_last_2_digits}/user_{user_id}.json`.
- Atomic writes: write to `.tmp` file, then `os.replace()` to prevent corruption.
- Each conversation stores: `id` (UUID), `title` (first user message, truncated to 25 chars + "..."), `messages` (full list), `is_archived`, `updated_at` (epoch timestamp).
- Previous conversations listed in the sidebar; clicking loads that conversation.
- "New Chat" button persists the current conversation (if dirty) and starts a fresh one.

### FR-10: Document Vault Management
- Show all indexed files in the sidebar with per-file delete buttons.
- "Clear All Documents" button removes all chunks for the current user from ChromaDB.
- "New Chat" and "Export" buttons in the sidebar.

### FR-11: Chat Export
- Export the current conversation as a Markdown file.
- Includes user/assistant messages, source citations, and hallucination scores.

### FR-12: Security —  Protection
- 11 regex patterns detect common  attempts (ignore previous instructions,  overrides, role-change commands, tag-based injections like `[INST]`, `<<SYS>>`, `<|im_start|>`).
- Detected injections are blocked with a warning message and logged.

### FR-13: Rate Limiting
- In-memory sliding window: maximum **20 Groq API calls per minute** per session.
- If exceeded, the user sees an error asking them to wait.

### FR-14: Conversation Monitoring
- Log warning when a Thinking-mode query triggers more than 5 API calls (configurable threshold).

---

## 4. Non-Functional Requirements

### NFR-1: Performance
- Document processing: show a spinner; no hard timeout on file extraction.
- Retrieval: under 1 second for 500+ chunks.
- LLM response streaming: first token within 2-5 seconds (depends on Groq).
- Hallucination evaluation: 2-10 seconds (parallel claim verification).
- Total response time target: under 15 seconds for the full pipeline.

### NFR-2: Reliability
- The app must never crash and show a Python traceback to the user.
- All critical operations wrapped in try/except.
- Detection failure falls back to MEDIUM risk, never blocks answer display.
- Conversation persistence uses atomic writes (no JSON corruption on crash).

### NFR-3: Security
- `.env` with API keys is gitignored. Never committed.
-  patterns block common jailbreak attempts at the application level.
- ChromaDB data is local — no cloud vector database.

### NFR-4: Usability
- Single-page Streamlit app — no navigation needed.
- Responsive layout: `layout="wide"`, mobile hamburger menu auto-hidden via CSS.
- Clear visual hierarchy: title, subtitle, sidebar for settings/vault, main area for chat.
- Source citations shown as `\`filename\`` captions under each answer.
- Hallucination analysis shown in an expander so it doesn't clutter the main chat.

### NFR-5: Maintainability
- Backend split into 6 focused modules (`config.py`, `file_processor.py`, `chunker.py`, `vector_store.py`, `agent.py`, `conversations.py`).
- No single file exceeds ~470 lines.
- All configuration values in one place (`backend/config.py`).
- Logging to both file (`docchat.log`) and console.

---

## 5. Out of Scope (v1 — This Project)

These are explicitly **NOT** part of the current build and are listed as future work:

| Feature | Why Out of Scope |
|---|---|
| Multi-user authentication | Single-user demo (`USER_ID = 1`). Auth infrastructure is beyond the project scope. |
| OCR for scanned PDFs | pypdf cannot extract text from image-based PDFs. Tesseract OCR is a future enhancement. |
| Fine-tuned LLM integration | Phase 3 of the tracker — LoRA adapter training on Colab, not yet started. |
| Persistent user sessions across browsers | Session state is in-memory; conversations persist to JSON but not across browser sessions. |
| Non-English document support | Untested. The embedding model and LLM work best with English. |
| Table extraction from PDFs | pypdf extracts text linearly; multi-column PDFs and tables may extract in wrong order. |
| Cloud deployment | Runs locally via `streamlit run app.py`. |
| API rate limit handling for Groq | Basic in-memory sliding window exists; exponential backoff is not implemented. |

---

## 6. Success Metrics

| Metric | Target |
|---|---|
| Document types supported | 3 (PDF, DOCX, TXT) |
| Hallucination detection accuracy | ≥65% on 20-example test set (to be measured in Phase 6) |
| Average response time | <15 seconds end-to-end |
|  refusal rate | 100% on out-of-document questions |
| Supported concurrent documents | Tested up to 5+ simultaneous uploads |
| Conversation persistence reliability | 100% (atomic writes, no JSON corruption) |
|  blocking | All 11 patterns caught |

---

## 7. Glossary

| Term | Definition |
|---|---|
| **RAG** | Retrieval-Augmented Generation — fetching relevant document chunks before asking the LLM to answer. |
| **Chunk** | A segment of text (500 chars) extracted from a document, with its own embedding vector. |
| **Embedding** | A 384-dimensional numerical vector representing the semantic meaning of text. |
| **Cosine Similarity** | A measure (0-1) of how aligned two vectors are. Used for retrieval and hallucination scoring. |
| **Hallucination** | When the LLM generates an answer not supported by the provided context, filling gaps from training knowledge. |
| **LoRA** | Low-Rank Adaptation — a fine-tuning technique that adds small trainable layers to a frozen model. |
| **QLoRA** | Quantized LoRA — LoRA with 4-bit quantized base model for memory-efficient training. |
| **Grounding Score** | Percentage of claims in the answer that are directly supported by the retrieved context. |
| **Hallucination Score** | 100 minus the grounding score. Higher = more likely hallucinated. |
| **Retrieval Gate** | A pre-LLM check that compares the best retrieval similarity score against a threshold. Below threshold = refusal, no LLM call. |
| **** | User input designed to override the  and change the LLM's behavior. |
| **Groq** | A fast LLM inference API. Used as the LLM backend in this project. |
| **ChromaDB** | An open-source vector database for storing and searching embeddings locally. |
| **SentenceTransformer** | A library for generating text embeddings. Uses `all-MiniLM-L6-v2` in this project. |
| **v1-safety-net** | The git tag marking the Phase 2 (working basic chatbot) commit — the insurance policy before starting fine-tuning. |
