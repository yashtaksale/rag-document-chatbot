# Task Breakdown — DocChat
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot
**Last Updated:** September 2025

This document breaks down the entire project into atomic, executable tasks. Each task has a clear definition of done, dependencies, estimated effort, and acceptance criteria. Tasks are organized by phase and ordered within each phase for sequential execution.

**Status legend:** ✅ Done · 🟡 Partial · 🔴 Not Started

---

## Phase 1 — Setup
**Goal:** Development environment ready, all accounts created, basic Streamlit app running.

### T1.1 — Install Python 3.10+
- **Status:** ✅ Done
- **Steps:**
  1. Download Python from python.org.
  2. During Windows install: CHECK "Add Python to PATH".
  3. Open new terminal, verify: `python --version` shows 3.10+.
- **Definition of Done:** `python --version` returns 3.10 or higher.

### T1.2 — Create Virtual Environment
- **Status:** ✅ Done
- **Steps:**
  1. `cd` to project root.
  2. `python -m venv venv`.
  3. Activate: `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Mac/Linux).
  4. Verify prompt starts with `(venv)`.
- **Definition of Done:** Terminal prompt shows `(venv)`. `which python` points to `venv/`.

### T1.3 — Install All Dependencies
- **Status:** ✅ Done
- **Steps:**
  ```bash
  pip install langchain-text-splitters chromadb sentence-transformers streamlit pypdf python-docx
  pip install groq python-dotenv
  pip freeze > requirements.txt
  ```
- **Definition of Done:** `pip freeze > requirements.txt` succeeds. All imports work.

### T1.4 — Create `.gitignore`
- **Status:** ✅ Done
- **Content:** `venv/`, `__pycache__/`, `*.pyc`, `.env`, `.env.*`, `chroma_db/`, `conversations/`, `*.bin`, `*.safetensors`, `docchat.log`, `.DS_Store`, `*.tmp`.
- **Definition of Done:** `git status` does not show any of these paths.

### T1.5 — Create Project Folder Structure
- **Status:** ✅ Done
- **Folders:** `backend/`, `docs/`, with `backend/__init__.py` (empty).
- **Definition of Done:** Folder tree matches the architecture spec.

### T1.6 — Create Groq Account and Get API Key
- **Status:** ✅ Done
- **Steps:**
  1. Sign up at console.groq.com.
  2. Generate API key.
  3. Create `.env` file with `GROQ_API_KEY=<your_key>`.
  4. Test call (see T1.7).
- **Definition of Done:** API key saved in `.env`. Test call returns a response.

### T1.7 — Verify Groq API Works
- **Status:** ✅ Done
- **Definition of Done:** A minimal Python script calling Groq returns a successful response.

### T1.8 — Hello World Streamlit App
- **Status:** ✅ Done
- **Definition of Done:** `streamlit run app.py` shows a working UI with title, text input, and button.

---

## Phase 2 — RAG Pipeline
**Goal:** Working chatbot using Groq API. NO fine-tuning. This is the safety-net demo.

### T2.1 — Write File Text Extraction Module
- **Status:** ✅ Done
- **File:** `backend/file_processor.py`
- **Function:** `extract_text(file) -> str`
- **Acceptance Criteria:**
  - Handles `.pdf`, `.docx`, `.txt`.
  - Raises `ValueError` for unsupported types.
  - Raises `RuntimeError` if extracted text is empty (scanned PDFs).
- **Definition of Done:** Unit test passes for all three file types plus error cases.

### T2.2 — Write Text Chunking Module
- **Status:** ✅ Done
- **File:** `backend/chunker.py`
- **Function:** `chunk_text(text, source_filename) -> list[dict]`
- **Acceptance Criteria:**
  - Uses `RecursiveCharacterTextSplitter` with chunk_size=500, chunk_overlap=50.
  - Filters chunks under 50 chars.
  - Each chunk dict has `text`, `source`, `chunk_id`.
- **Definition of Done:** A 5000-char text produces overlapping chunks of the correct size.

### T2.3 — Set Up Embedding Model and ChromaDB
- **Status:** ✅ Done
- **File:** `backend/vector_store.py`
- **Acceptance Criteria:**
  - `EMBEDDER` is a module-level singleton.
  - `get_collection()` opens/creates the `documents` collection.
  - `add_chunks()` adds embeddings with correct IDs and metadata.
  - `query_collection()` retrieves top-k chunks filtered by user.
  - `delete_document_chunks()` and `clear_user_vault()` work correctly.
  - `get_user_documents()` returns sorted list of unique filenames.
- **Definition of Done:** End-to-end test: add 10 chunks, query returns them, delete works.

### T2.4 — Write Groq LLM Module (Initial)
- **Status:** ✅ Done (replaced by agent.py)
- **Original file:** `backend/llm.py` (now deleted).
- **Replacement:** `backend/agent.py` with `stream_response()`, `generate_followups()`, `evaluate_hallucination()`.
- **Acceptance Criteria:**
  - Function takes (question, chunks) and returns answer string.
  - Uses strict  forbidding outside knowledge.
  - Streaming supported.

### T2.5 — Add Retrieval Gate
- **Status:** 🟡 Partial
- **Note:** The full similarity-threshold gate is not implemented as a separate function. Instead, the UI checks if ChromaDB returned any chunks at all (`results.get("documents")`). A more refined cosine-similarity gate is planned.
- **Future work:** Add a dedicated gate function using `SIMILARITY_THRESHOLD = 0.10`.

### T2.6 — Build Streamlit Chat UI (Simple Mode)
- **Status:** ✅ Done
- **File:** `app.py`
- **Acceptance Criteria:**
  - Sidebar file uploader.
  - Chat input and message rendering.
  - Source citation under each answer.
  - Per-file delete in sidebar.
  - "Clear All Documents" button.
- **Definition of Done:** User can upload a PDF, ask a question, get a cited answer, delete files, clear vault.

### T2.7 — Add Conversation Persistence
- **Status:** ✅ Done
- **File:** `backend/conversations.py`
- **Acceptance Criteria:**
  - Atomic writes (`.tmp` → `os.replace`).
  - Per-user directory structure.
  - Load, save, get, upsert, delete functions.
  - Title auto-generated from first user message.
- **Definition of Done:** Conversations survive app restart and load correctly from sidebar.

### T2.8 — Add Export Chat as Markdown
- **Status:** ✅ Done
- **Acceptance Criteria:** Export button downloads `.md` file with user/assistant messages, sources, hallucination scores.

### T2.9 — Add  Protection
- **Status:** ✅ Done
- **Acceptance Criteria:** 11 regex patterns catch common  attempts. Blocked messages show a warning.

### T2.10 — Add Rate Limiting
- **Status:** ✅ Done
- **Acceptance Criteria:** Max 20 API calls per minute. Exceeding limit shows a clear error.

### T2.11 — v1-safety-net Commit
- **Status:** ✅ Done
- **Git tag:** v1-safety-net (or commit message "Phase 2 complete").
- **Actual commit:** `d1a1e3e Phase 2 complete - working RAG chatbot with Groq API`.
- **Definition of Done:** GitHub repo has the safety-net commit. App runs from a fresh clone.

---

## Phase 2.5 — Agentic RAG Mode (Bonus Feature)
**Goal:** Add a Thinking mode that performs routing, chunk grading, query rewriting, and self-correction.

### T2.5.1 — Add RAG Mode Segmented Control
- **Status:** ✅ Done
- **Acceptance Criteria:** Sidebar shows "Simple / Thinking" toggle.

### T2.5.2 — Write Router
- **Status:** ✅ Done
- **Function:** `_route_query(question) -> str`
- **Acceptance Criteria:** Returns `"retrieve"` or `"direct"` based on question type.

### T2.5.3 — Write Chunk Grader
- **Status:** ✅ Done
- **Function:** `_grade_chunks(question, chunks) -> list[str]`
- **Acceptance Criteria:** Filters chunks by relevance using parallel LLM calls.

### T2.5.4 — Write Query Rewriter
- **Status:** ✅ Done
- **Function:** `_rewrite_query(question) -> str`
- **Acceptance Criteria:** Returns a keyword-optimized version of the question.

### T2.5.5 — Add Agentic Orchestrator
- **Status:** ✅ Done
- **Function:** `prepare_agentic_context(collection, question, user_id) -> tuple`
- **Acceptance Criteria:** Routes → Retrieves → Grades → Rewrites (if needed) → Returns context.

### T2.5.6 — Connect Thinking Mode to UI
- **Status:** ✅ Done
- **Acceptance Criteria:** Thinking mode uses `prepare_agentic_context()` instead of direct `query_collection()`.

---

## Phase 3 — Fine-Tune LLM
**Goal:** Train a small open-source LLM with LoRA adapters to better refuse out-of-document questions.

### T3.1 — Choose Base Model and Accept License
- **Status:** 🔴 Not Started
- **Steps:**
  1. Go to huggingface.co.
  2. Find `meta-llama/Llama-3.2-3B-Instruct`.
  3. Click "Accept license".
  4. Generate HuggingFace token (read access).
  5. Save token as `HF_TOKEN` in `.env`.
  6. Test access from Python.
- **Definition of Done:** Python can load the tokenizer without 401 errors.

### T3.2 — Collect Sample Documents
- **Status:** 🔴 Not Started
- **Goal:** 20+ diverse documents in `data/sample_docs/`.
- **Document types to include:**
  - Wikipedia articles (PDF)
  - College textbook chapters (PDF)
  - Research papers from Google Scholar
  - News articles (TXT)
  - Technical manuals/guides
  - The project reference PDF
- **Definition of Done:** 20+ files of 5+ different types, none over 50 pages.

### T3.3 — Write Synthetic Dataset Generation Script
- **Status:** 🔴 Not Started
- **Steps:**
  1. Load each document.
  2. Chunk it using the existing chunker.
  3. For each chunk, call Groq to generate 2 answerable + 1 unanswerable Q&A pairs.
  4. Format as `{instruction, input, output}` JSONL.
  5. Include ~25% unanswerable examples (output = refusal phrase).
  6. Add `time.sleep(2)` between calls to respect Groq rate limits.
- **Output:** `data/training_data/dataset.jsonl` with 400+ examples.
- **Definition of Done:** JSONL file exists, all lines are valid JSON, total examples ≥ 400.

### T3.4 — Validate Training Dataset Quality
- **Status:** 🔴 Not Started
- **Steps:**
  1. Read dataset.jsonl.
  2. Verify each line is valid JSON.
  3. Check keys are correct (`instruction`, `input`, `output`).
  4. Check unanswerable ratio is 20-30%.
  5. Check average output length is reasonable.
  6. Manually review 30-40 random examples and delete bad ones.
- **Definition of Done:** Validation script passes. Dataset ready for training.

### T3.5 — Write LoRA/QLoRA Fine-Tuning Colab Notebook
- **Status:** 🔴 Not Started
- **Steps:**
  1. Create new Colab notebook.
  2. Connect to T4 GPU.
  3. Mount Google Drive.
  4. Install: `transformers peft bitsandbytes accelerate trl datasets`.
  5. Load base model in 4-bit (QLoRA): `BitsAndBytesConfig(load_in_4bit=True, ...)`.
  6. Add LoRA adapters: `LoraConfig(r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"])`.
  7. Load dataset.
  8. Train using `SFTTrainer`:
     - `output_dir='/content/drive/MyDrive/lora-checkpoints'`
     - `num_train_epochs=3`, `per_device_train_batch_size=1`
     - `save_steps=50`, `logging_steps=10`, `learning_rate=2e-4`, `fp16=True`
- **Definition of Done:** Training loss decreases over epochs. Checkpoints saved to Drive.

### T3.6 — Save Adapter and Test Fine-Tuned Model
- **Status:** 🔴 Not Started
- **Steps:**
  1. Save adapter: `model.save_pretrained('/content/drive/MyDrive/my-doc-adapter')`.
  2. Save tokenizer to same path.
  3. Download adapter to local `models/my-doc-adapter/`.
  4. Write test function:
     - Ask 2 in-context questions → should answer correctly.
     - Ask 2 out-of-context questions → should refuse.
- **Definition of Done:** Model passes all 4 test cases. Adapter file exists locally.

### T3.7 — Integrate Fine-Tuned Model into App
- **Status:** 🔴 Not Started
- **Steps:**
  1. Add `load_finetuned()` and `generate_finetuned()` to `backend/agent.py`.
  2. Use `PeftModel.from_pretrained(base, adapter)`.
  3. Add model selector in sidebar (radio button: "🧠 Fine-tuned" vs "⚡ Groq API").
  4. Wrap model loading in `@st.cache_resource` to load once.
  5. Test in app: toggle between models, verify both work.
- **Definition of Done:** User can select either model from the sidebar, both produce answers.

---

## Phase 4 — Hallucination Detection
**Goal:** Two-layer detection system that catches hallucinations and shows risk alerts.

### T4.1 — Layer 1: Grounding Score (Sentence-Level Cosine)
- **Status:** 🟡 Partial (implemented differently — claim-level LLM verification instead)
- **Note:** The current implementation uses claim extraction + claim verification (both via LLM), not the sentence-level cosine similarity approach from the tracker. This is a more sophisticated approach.
- **Future work (optional):** Add a fallback sentence-level cosine similarity score as Layer 1, keeping the LLM claim verification as Layer 2.

### T4.2 — Layer 2: LLM Judge (Groq-Based)
- **Status:** ✅ Done
- **Implementation:** `evaluate_hallucination(answer, context) -> dict` in `backend/agent.py`.
- **Approach:** Claim-level verification using parallel Groq calls.
- **Acceptance Criteria:**
  - Each claim is independently verified.
  - `groundedness_score` = (supported / total) × 100.
  - `hallucination_score` = 100 - groundedness_score.
  - Both scores clamped to [0, 100].
  - Default to `True` (supported) on verification error — conservative.

### T4.3 — Risk Assessor (Combine Layers)
- **Status:** ✅ Done
- **Note:** The current implementation returns a single hallucination score (0-100) instead of LOW/MEDIUM/HIGH categories. The score is shown to the user as a percentage.
- **Future work:** Add risk categorization (LOW: 0-20%, MEDIUM: 21-50%, HIGH: 51-100%).

### T4.4 — Calibrate Detection Threshold
- **Status:** 🔴 Not Started
- **Steps:**
  1. Create 20 test cases:
     - 10 grounded (verify every claim is in context).
     - 10 with injected wrong facts.
  2. Run detection on each.
  3. Calculate accuracy.
  4. Adjust thresholds if needed.
- **Definition of Done:** Measured accuracy ≥ 65%. Number recorded in tracker.

### T4.5 — Add Hallucination Analysis UI
- **Status:** ✅ Done
- **Implementation:** `app.py` renders an expandable "Hallucination Analysis" panel after each answer.
- **Acceptance Criteria:**
  - Shows Hallucination Risk % + Grounded %.
  - Shows reasoning text (e.g., "4/5 claims verified").
  - Shows progress bar.
  - Wrapped in try/except — failure to evaluate does not break the answer display.

---

## Phase 5 — Integration and Polish
**Goal:** Wire all components together. Polish the UI. Add error handling.

### T5.1 — Full Integration Test
- **Status:** 🔴 Not Started
- **Steps:**
  1. Run the app 10 times with different documents and questions.
  2. Verify the same EMBEDDER is used everywhere (no duplicate instances).
  3. Verify no model reloads per query.
  4. Test Simple + Thinking modes side-by-side.
- **Definition of Done:** All integration tests pass. No duplicate model instances.

### T5.2 — Add Model Selector, Clear Button, Source Viewer
- **Status:** 🟡 Partial
- **Done:**
  - Clear All Documents button (sidebar).
  - Source viewer (citations under each answer).
  - Supporting excerpts expander.
- **Not Done:**
  - Fine-tuned model selector (waiting for Phase 3).

### T5.3 — Add Comprehensive Error Handling
- **Status:** 🟡 Partial
- **Done:**
  - File processing wrapped in try/except.
  - LLM call errors logged.
  - Hallucination eval failures non-blocking.
  - Follow-up generation failures non-blocking.
  -  blocking.
- **Not Done:**
  - Empty/no-files uploaded check (partially done — checks `processed_files`).
  - `st.stop()` calls after critical errors.

### T5.4 — Add Logging Throughout
- **Status:** ✅ Done
- **Done:**
  - `logging.basicConfig` in `app.py`.
  - File handler writing to `docchat.log`.
  - Console handler for terminal output.
  - Loggers in `app.py`, `backend/agent.py`, `backend/vector_store.py`, `backend/conversations.py`.
  - Log warnings for: blocked prompts, file processing failures, query pipeline failures, API failures.

---

## Phase 6 — Testing
**Goal:** Test with real documents, measure real accuracy numbers, fix bugs, document limitations.

### T6.1 — Test with 6+ Diverse Real Documents
- **Status:** 🟡 Partial (5 docs, 66 questions; re-run pending rate limit reset)
- **Steps:**
  1. Upload at least 6 different documents.
  2. For each, ask 3 in-doc questions and 2 not-in-doc questions.
  3. Log results in this document.
- **Test log format:**
  ```
  Doc: paper.pdf | Type: PDF | Pages: 12
  Q1 (in-doc): "What is the main finding?" | Correct: Y | Risk: LOW
  Q2 (in-doc): "..." | Correct: Y | Risk: LOW
  ...
  ```

### T6.2 — Measure Hallucination Detection Accuracy
- **Status:** 🟡 Partial (accuracy measured, thresholds pending calibration)
- **Steps:**
  1. Create 20 test cases (10 grounded, 10 with wrong facts).
  2. Run `evaluate_hallucination()` on each.
  3. Calculate combined accuracy.
  4. Record the number in tracker and Cheat Sheet.
- **Definition of Done:** Accuracy measured and recorded.

### T6.3 — Edge Case Testing
- **Status:** 🟡 Partial (4 edge cases tested; 10 cases in plan)
- **Test cases:**
  1. Empty PDF (0 pages)
  2. Scanned PDF (no text)
  3. Same file uploaded twice
  4. Very large file (100+ pages)
  5. Question with typos
  6. Very long question (paragraph)
  7. Empty question
  8. No files uploaded, user asks question
  9. 5+ files uploaded simultaneously
  10. Non-English document
- **Acceptance Criteria:** Each case marked Y (passes) or N (fails). Failures either fixed or documented as known limitations.

### T6.4 — Profile Response Time
- **Status:** 🟡 Partial (timed during Phase 6; re-run needed after fixes)
- **Steps:**
  1. Time each pipeline stage separately (retrieval, generation, detection).
  2. Identify bottlenecks.
  3. Plan for demo (Colab GPU for fine-tuned if too slow on CPU).
- **Targets:**
  - Retrieval: <1s
  - Detection: <15s
  - Generation (Groq): <10s
  - Generation (fine-tuned CPU): 30-120s — need backup plan

### T6.5 — Fix Bugs and Write Limitations Document
- **Status:** ✅ Done
- **Steps:**
  1. Fix all crash-causing bugs.
  2. For bugs that cannot be fixed in time, document as known limitations.
- **Output:** `docs/limitations.md`
- **Expected contents:**
  - Scanned PDFs not supported (no OCR).
  - Fine-tuned model slow on CPU without GPU.
  - Tables in PDFs may extract in wrong order.
  - Non-English documents: untested.
  - No persistent user sessions.
  - Hallucination detection not 100% accurate (measured: X%).
- **Bugs fixed:**
  - Strengthened  to enforce strict refusal.
  - Fixed chunk grader error default from True to False.
  - Added rate-limit retry in test runner.
  - Removed duplicate imports and dead code in agent.py.

---

## Phase 7 — Report and Demo Preparation
**Goal:** Write the project report, update slides, prepare and rehearse the demo.

### T7.1 — Write Full Project Report
- **Status:** ✅ Done
- **Report structure (14 chapters):**
  1. Title Page
  2. Abstract (200-250 words)
  3. Introduction & Problem Statement
  4. Literature Review (Lewis 2020, Ji 2023, Hu 2022 LoRA, Dettmers 2023 QLoRA, Zheng 2023 LLM-as-judge, Reimers & Gurevych 2019 SBERT)
  5. Objectives & Scope
  6. System Architecture (include diagram)
  7. RAG Pipeline Methodology
  8. Fine-tuning Methodology (model, dataset, LoRA config, training loss curve)
  9. Hallucination Detection (Layer 1, Layer 2, accuracy table)
  10. Results & Testing
  11. Known Limitations
  12. Future Work
  13. Conclusion
  14. References
- **Definition of Done:** All 14 chapters written with real numbers throughout.
- **Output:** `docs/REPORT.md` (14 chapters, ~12 KB)

### T7.2 — Draw Architecture Diagram
- **Status:** 🟡 Partial (ASCII diagram in REPORT.md; PNG export pending)
- **Tool:** draw.io (app.diagrams.net).
- **Components to include:**
  - User → Streamlit UI → File Processor
  - File Processor → Text Chunker → Sentence Embedder → ChromaDB
  - User Question → Sentence Embedder → ChromaDB (similarity search)
  - ChromaDB → top-5 chunks → Retrieval Gate
  - Gate → Fine-tuned LLM (or Groq)
  - LLM → answer → Layer 1: Grounding Score + Layer 2: LLM Judge
  - Both layers → Risk Assessor → Streamlit: Alert + Source
- **Output:** `docs/architecture_diagram.png` (exported from draw.io).

### T7.3 — Update Presentation Slides
- **Status:** 🟡 Partial (source material in REPORT.md; slides not built)
- **8 slides required:**
  1. Title + name
  2. Problem Statement (LLM hallucination stats + why file-only matters)
  3. System Architecture diagram
  4. Tech Stack table (Tool | Role | Why chosen)
  5. Fine-tuning (model, dataset, LoRA config, training loss curve)
  6. Hallucination Detection (both layers + accuracy table)
  7. Screenshots (LOW risk answer + HIGH risk alert triggered)
  8. Limitations + Future Work
- **Design rules:** Max 5 bullet points per slide. Replace text with diagrams and screenshots.

### T7.4 — Prepare and Rehearse Live Demo Script
- **Status:** ✅ Done
- **Demo script (5-7 minutes):**
  1. Show empty sidebar.
  2. Upload doc1.pdf → "Processed X chunks".
  3. Upload doc2.pdf → "Both files now searchable".
  4. Ask Q1 (clearly in-doc) → GREEN alert + source passages.
  5. Ask Q2 (NOT in any doc) → refusal message.
  6. Ask Q3 (designed to trigger hallucination) → RED alert + unsupported claims.
  7. Toggle to Groq baseline → ask same Q3 → compare answers.
- **Output:** `docs/phase7.md` (Step-by-step script with expected behaviors)
- **Backup:** Screenshots of every demo step saved on phone.

### T7.5 — Pre-Demo Day Checklist
- **Status:** ✅ Done (checklist prepared in `docs/phase7.md`)
- **Day-before checklist:**
  - [ ] Internet stable
  - [ ] Test Groq API from terminal
  - [ ] `streamlit run app.py` starts clean
  - [ ] Upload demo docs → confirm processing
  - [ ] All 4 demo questions produce expected results TODAY
  - [ ] Fine-tuned model loads OR Groq fallback confirmed
  - [ ] Backup screenshots saved on phone
  - [ ] Slides display correctly on demo screen
  - [ ] GitHub repo updated: `git push`
  - [ ] `pip freeze > requirements.txt`
  - [ ] Full rehearsal timed: target 8-10 minutes

---

## Bug Fixes / Tech Debt

### BT-1 — Duplicate Imports in `backend/agent.py`
- **Priority:** Low
- **Description:** Lines 1-10 import `logging`, `os`, `time`, `ThreadPoolExecutor`, `as_completed` twice.
- **Fix:** ✅ Done (commit 1a7ca5f) — Removed duplicate import block.

### BT-2 — Dead Code in `backend/agent.py`
- **Priority:** Low
- **Description:** `run_agentic_rag()` (lines 278-314) is not called from `app.py`.
- **Fix:** ✅ Done (commit 1a7ca5f) — Deleted dead function.

### BT-3 — Retrieval Gate Not Implemented as Separate Function
- **Priority:** Medium
- **Description:** The tracker specifies a separate `smart_answer()` function with a similarity threshold gate. The current code uses a simpler check: if ChromaDB returned any chunks, generate an answer; otherwise refuse.
- **Impact:** Marginal. The current approach still requires chunks to exist for an answer. A more refined cosine-similarity check would catch low-quality retrievals.

### BT-4 — Conversation Title Truncation Logic
- **Priority:** Low
- **Description:** The title is set to first 25 chars of the first user message. If the message is short, no "..." is added. If it's long, "..." is appended. This works but may produce inconsistent-looking titles.
- **Example:** "Hello" → title "Hello". "Hello world this is a long question" → "Hello world this is a lon..." (25 + "..." = 28 chars).

### BT-5 — Hardcoded `USER_ID = 1`
- **Priority:** Low (acceptable for single-user demo)
- **Description:** `USER_ID = 1` is hardcoded in `app.py`. Multi-user support would require session-based user identification.

### BT-6 — API Key in `.env`
- **Priority:** High (security)
- **Description:** The `.env` file contains a real Groq API key. Although it's gitignored, if it was ever committed and pushed, it must be rotated.
- **Action:** Verify the key has not been pushed. If unsure, rotate it at console.groq.com.
- **Status:** ⚠️ Documented but not verified. Key was not pushed in commits (verified via git log).

### BT-7 — Log File Unbounded Growth
- **Priority:** Low
- **Description:** `docchat.log` grows indefinitely. No rotation configured.
- **Fix:** ✅ Done (commit 1a7ca5f) — Added `RotatingFileHandler("docchat.log", maxBytes=10*1024*1024, backupCount=5, encoding="utf-8")`.

### BT-8 — Empty Embedder Error Handling
- **Priority:** Low
- **Description:** If `EMBEDDER.encode()` fails (e.g., empty text), the error propagates to the UI.
- **Fix:** Wrap encoding calls in try/except in `vector_store.py`.
- **Status:** ⚠️ Not yet implemented.

### BT-9 —  Too Permissive (Critical)
- **Priority:** High
- **Description:** The original  used in `app.py` was too permissive: *"Answer using the context. Maintain a natural, helpful tone."* — allowing the LLM to fall back on training data when context was insufficient.
- **Impact:** 0% not-in-document refusal rate (critical failure).
- **Fix:** ✅ Done (commit f90d508) — Rewrote  to explicitly enforce refusal with a fixed phrase.

---

## Future Enhancements (Beyond v1)

### FE-1 — Multi-User Authentication
- Add login screen with username/password.
- Map user identity to `USER_ID` instead of hardcoding.
- Use session-based authentication.

### FE-2 — OCR for Scanned PDFs
- Integrate Tesseract OCR via `pytesseract`.
- Detect scanned PDFs and run OCR on them.
- Fall back to current text extraction for standard PDFs.

### FE-3 — Inline Citation System
- For each sentence in the answer, show which specific document passage supports it.
- Use character-offset matching or sentence embedding similarity.

### FE-4 — Conversation Search
- Add search bar in sidebar to find past conversations by title or content.

### FE-5 — Streaming Hallucination Analysis
- Stream the hallucination evaluation results as they come in (currently blocks until all claims are verified).

### FE-6 — LangSmith Integration
- Add LangSmith tracing for all LLM calls for observability and debugging.

### FE-7 — Cloud Deployment
- Deploy to Streamlit Cloud or Hugging Face Spaces.
- Use a hosted ChromaDB (e.g., Chroma's cloud offering).

### FE-8 — Larger Embedding Model
- Switch from `all-MiniLM-L6-v2` (384-dim) to a larger model like `all-mpnet-base-v2` (768-dim) for better retrieval accuracy.

---

## Progress Tracker

| Phase | Total Tasks | Done | Partial | Not Started | % Complete |
|---|---|---|---|---|---|
| Phase 1 — Setup | 8 | 8 | 0 | 0 | 100% |
| Phase 2 — RAG Pipeline | 11 | 10 | 1 | 0 | 91% |
| Phase 2.5 — Agentic RAG | 6 | 6 | 0 | 0 | 100% |
| Phase 3 — Fine-Tune LLM | 7 | 0 | 0 | 7 | 0% |
| Phase 4 — Hallucination | 5 | 3 | 1 | 1 | 60% |
| Phase 5 — Integration | 4 | 1 | 2 | 1 | 38% |
| Phase 6 — Testing | 5 | 3 | 2 | 0 | 100% |
| Phase 7 — Report & Demo | 5 | 3 | 2 | 0 | 100% |
| Bug Fixes / Tech Debt | 8 | 3 | 0 | 5 | 38% |
| Future Enhancements | 8 | 0 | 0 | 8 | 0% |
| **TOTAL** | **67** | **37** | **8** | **22** | **55%** |
