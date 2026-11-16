# Phase 7 — Report, Viva Presentation & Demo Script (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Last Updated:** October 2026  

This document contains the complete deliverables for presentation day, including the live demonstration script, viva defense cheat sheet, and pre-flight verification checklist.

---

## 1. Pre-Demo Day Checklist

Execute these verification steps 15 minutes prior to the examination or presentation:

- [ ] **Repository Status**: `git status` is clean with zero uncommitted scratch files.
- [ ] **Virtual Environment**: Python 3.10+ virtual environment ready (`venv`).
- [ ] **Node Environment**: Node.js 20+ and npm dependencies installed (`node_modules/`).
- [ ] **API Key Validation**: `.env` has valid `GROQ_API_KEY` (`gsk_...`).
- [ ] **Pre-Flight Diagnostics**: Run `python -m backend.healthcheck` and verify **5/5 Checks Passed**.
- [ ] **Test Corpora Ready**: Verify sample documents exist in `tests/test_docs/`:
  - `climate_change.txt`
  - `space_missions.txt`
  - `python_programming.txt`
  - `mediterranean_diet.txt`
  - `countries.csv`
- [ ] **Clean Vault**: Purge old test chunks if you want a clean demonstration slate.
- [ ] **Browser Prepared**: Open Google Chrome or Brave at `http://localhost:3001` in fullscreen.

---

## 2. Timed Live Demo Script (5–7 Minutes)

### Launching the Application
Execute the 1-click startup script:
```cmd
start.bat
```
*(On Linux/macOS: `./start.sh` or `docker compose up -d`)*

---

### Step 1: The Modern Interface & System Tour (1 Minute)
- **Action**: Display `http://localhost:3001`. Toggle between Dark Mode and Light Mode to demonstrate responsive theme styling.
- **Talking Points**:
  > *"DocChat v2.0 is built on a modern decoupled architecture: a Next.js 16 and React 19 frontend paired with an asynchronous FastAPI backend. Unlike typical RAG demos with basic UI scripts that flash on every question, DocChat features a production-grade Claude/ChatGPT-style canvas with full client-side state management, Markdown rendering with KaTeX equations, and real-time Server-Sent Events (SSE) streaming."*

---

### Step 2: Multi-Tenant Isolation & Document Vault (1 Minute)
- **Action**: Click the user profile / account switcher. Show active session and switch to `demo` user. Open the **Document Vault** modal.
- **Talking Points**:
  > *"DocChat enforces strict multi-tenancy. Vector embeddings and conversations are completely partitioned per user. Even if multiple users upload documents with the same name, user metadata isolates the ChromaDB vector namespace. Let's open the Document Vault and upload our first technical paper."*
- **Action**: Drag and drop `climate_change.txt` into the dropzone. Observe the live progress indicator transitioning from text extraction to chunking and vector embedding generation.

---

### Step 3: In-Document Query & The Thinking Process (1.5 Minutes)
- **Action**: Toggle RAG Mode to **Thinking**.
- **Action**: Submit the query:
  > *"What was the atmospheric CO2 concentration in 2023 and how much have temperatures risen since the pre-industrial period?"*
- **Observation**:
  - The live **Thinking Process** accordion animates in real time.
  - Point out the steps: query routing (`retrieve`), parallel chunk grading, and OKF (Open Knowledge Filtering) deduplication.
  - The response streams token-by-token with KaTeX formatting and source citations (`[Source: climate_change.txt]`).
  - The **Hallucination Audit** banner expands: **Groundedness: 96%**, **Risk: 4% (Low)**, displaying the number of verified claims.
- **Talking Points**:
  > *"Notice the epistemic transparency. The model doesn't just answer; it shows its reasoning path. Our Open Knowledge Filtering engine stripped redundant chunks and verified that both metrics—420 ppm and 1.1 degrees Celsius—exist explicitly in the source document. The hallucination auditor verified all extracted claims."*

---

### Step 4: The Core Innovation — Strict Refusal on Out-of-Document Questions (1.5 Minutes)
- **Action**: Ask a question whose answer is **NOT** in the uploaded document:
  > *"What is the estimated human population of Mars in the year 2050?"*
- **Observation**:
  - The system immediately evaluates the query.
  - The retrieval gate measures cosine similarity below the 0.10 threshold.
  - The model responds with an immediate, unambiguous refusal:
    > *"I cannot find this information in your uploaded documents. None of the uploaded documents contain facts regarding Mars colonization or future population estimates."*
  - Hallucination score: **0%**.
- **Talking Points**:
  > *"This is the central achievement of DocChat. If you paste this exact prompt into standard ChatGPT with file uploads, it will guess or synthesize from Wikipedia and sci-fi articles. DocChat enforces a hard mathematical retrieval gate and a strictly bounded system prompt. If the fact does not exist in your vault, DocChat refuses rather than fabricates."*

---

### Step 5: Inline Hallucination Visualizer & One-Click Follow-Ups (1 Minute)
- **Action**: Point out the interactive pill buttons generated at the bottom of the conversation:
  > *Click: "What mitigation strategies are recommended in the text?"*
- **Observation**:
  - The follow-up query is automatically submitted without typing.
  - Point out supporting excerpts and the Markdown export button in the sidebar.
- **Concluding Statement**:
  > *"In summary, DocChat turns LLMs from creative storytellers into trustworthy, auditable research instruments. Thank you, and I look forward to your questions."*

---

## 3. Viva Defense & Examiner Q&A Cheat Sheet

### Q1: Why did you build an Open Knowledge Filtering (OKF) engine instead of passing top-k chunks directly to the LLM?
> **Answer:** *"Standard vector search retrieves chunks by semantic similarity, which often pulls adjacent, redundant paragraphs from multi-page documents. This wastes context window tokens and can introduce conflicting statements from draft revisions. Our OKF engine applies token-level Jaccard deduplication at a 0.82 threshold, filters noise, checks for numerical contradictions across sources, and tags each chunk with clean provenance before the LLM generates a token."*

### Q2: How does your two-layer hallucination detector work without introducing massive latency?
> **Answer:** *"Layer 1 uses our local SentenceTransformer embedder to compute normalized dot-product cosine similarity between the query and retrieved chunks in under 15 milliseconds. Layer 2 runs an optimized single-pass structured JSON audit on the Groq LPU to extract and verify claims against the context. If that pass encounters edge-case ambiguity, it falls back to parallel multi-threaded claim checks via ThreadPoolExecutor. This keeps total audit time under 1.5 seconds while delivering verbatim text span highlights."*

### Q3: What is the purpose of Phase 3 (LoRA fine-tuning) if you already have prompt engineering?
> **Answer:** *"Prompt engineering works well, but general-purpose LLMs still have a residual tendency to answer out-of-context queries when prompted persuasively. Phase 3 fine-tunes Llama-3.2-3B using QLoRA 4-bit adapters on 420 curated pairs with a 33.3% refusal ratio. This bakes the refusal constraint directly into the model's self-attention weights, ensuring robust refusal even against adversarial jailbreaks."*

### Q4: Why did you migrate from Streamlit to Next.js and FastAPI?
> **Answer:** *"Streamlit is an excellent rapid prototyping tool, but its execution model reruns the entire Python script upon every user action. This makes fine-grained DOM updates—like highlighting exact hallucinated words in an answer bubble or keeping an active input queue during SSE streaming—nearly impossible. By decoupling the architecture into a FastAPI backend and a Next.js 16 App Router frontend, we achieved true client-side persistence, sub-second transitions, and enterprise-grade UI aesthetics."*

### Q5: How is user data protected against cross-tenant leakage?
> **Answer:** *"Every ChromaDB vector chunk stores a `user_id` in its metadata dictionary. All database queries enforce a hard `where={'user_id': user_id}` filter. Furthermore, user passwords are encrypted using PBKDF2-HMAC-SHA256 with per-user 32-byte salts, stored in a WAL-mode SQLite database, and conversation logs are isolated in individual tenant directory hashes."*
