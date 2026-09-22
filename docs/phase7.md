# Phase 7 — Report and Demo Preparation

**Last Updated:** September 2026

This chapter documents the deliverables for Phase 7: project report, architecture diagram, demo script, and pre-demo checklist.

---

## T7.1 — Project Report

**Status:** ✅ Done

**File:** `docs/REPORT.md`

**Structure (14 chapters):**
1. Title Page
2. Abstract (250 words)
3. Introduction & Problem Statement
4. Literature Review (6 key papers with citations)
5. Objectives & Scope (in-scope and out-of-scope clearly delineated)
6. System Architecture (with ASCII diagram)
7. RAG Pipeline Methodology (ingestion, retrieval, agentic pipeline, generation)
8. Fine-tuning Methodology (model, dataset, LoRA config — prepared but not executed)
9. Hallucination Detection (LLM judge, claim extraction, scoring)
10. Results & Testing (66 questions, 5 documents, key metrics)
11. Known Limitations (7 categories with severity)
12. Future Work (7 items)
13. Conclusion
14. References (12 citations)

**Key metrics documented:**
- In-document accuracy: 93% (40/43)
- Not-in-document refusal: 0% → 0% initial (critical finding), fix committed
- Edge case handling: 75% (3/4)
- Hallucination flags: 21% (9/43)
- Average response time: ~800-2500ms (agentic mode)

---

## T7.2 — Architecture Diagram

**Status:** 🟡 Partial (ASCII diagram in REPORT.md)

**Current:** ASCII diagram embedded in `docs/REPORT.md` (Section 6).

**Future work:** Convert to visual diagram using draw.io (app.diagrams.net). Export as `docs/architecture_diagram.png`.

**Components to include in the visual diagram:**
- Streamlit UI (upload, chat, sources, hallucination panel)
- File Processor → Text Chunker → Embedder → ChromaDB
- Agentic Pipeline: Router → Chunk Grader → Query Rewriter → Generator
- Hallucination Detection: Claim Extract → LLM Judge → Risk Assessor
- Both model paths: Groq API (primary) and Fine-tuned (Phase 3, planned)

---

## T7.3 — Demo Script (5-7 minutes)

**Status:** ✅ Done (script prepared)

### Setup (do this BEFORE the demo starts)

```bash
# Verify everything is ready
cd C:/Users/yasht/OneDrive/Desktop/coding/rag
git log --1   # should show latest commit
ls tests/test_docs/   # should show 5 test documents
pip freeze | grep -E "streamlit|chromadb|groq|sentence-transformers"
```

Start the app:
```bash
streamlit run app.py
```

Have test questions ready in `tests/test_docs/test_questions.txt`.

### Demo Flow

#### Step 1: Show the empty sidebar (30s)
- Sidebar shows "No documents uploaded yet"
- Welcome message in chat: "Upload a document to get started"
- Point out the mode toggle: **Simple** / **Thinking**

#### Step 2: Upload two documents (60s)
- Click "Browse files" in sidebar
- Upload `space_missions.txt` — observe "Processed X chunks"
- Upload `climate_change.txt` — observe "Both files now searchable"
- Note: sidebar now lists both files with delete buttons

#### Step 3: In-document question — Green alert (60s)
- Ask: *"What was the highest CO2 emission level in 2023?"*
- **Expected behavior:**
  - Answer cites the document with specific figures.
  - Source excerpts shown below answer.
  - Hallucination panel shows LOW risk (green) — e.g., "5/5 claims verified, Risk: 0%"
- **Script:** "This is a green alert — the system found the information in the document and answered accurately."

#### Step 4: Not-in-document question — Refusal (30s)
- Ask: *"What is the population of Mars?"*
- **Expected behavior:** Refusal message — "I do not have sufficient information in the provided documents to answer this accurately."
- **Script:** "The system refuses to answer because Mars population is not in either document. This is the critical difference from a vanilla LLM."

#### Step 5: Thinking mode vs Simple mode comparison (90s)
- Toggle to **Thinking mode** (sidebar)
- Ask: *"Who were the crew members of Apollo 11?"*
- **Expected behavior:**
  - Answer includes crew names with source citations.
  - Hallucination panel shows LOW risk.
  - In the app's thinking log, show: router classified as "retrieve", chunk grader filtered to relevant chunks, retrieval successful.
- **Script:** "In Thinking mode, the system goes through a full agentic pipeline — routing, chunk grading, query rewriting if needed — before generating the answer. This adds a few seconds but significantly reduces hallucinations."

#### Step 6: Hallucination detection demo — High risk (optional, 60s)
- Ask a question designed to produce a hallucinated answer (e.g., ask about something that's partially related to the docs but not actually in them)
- **Expected behavior:** Answer with hallucinated content, Hallucination panel shows HIGH risk (red)
- **Script:** "Even if the model tries to fabricate, the hallucination detector flags it. The red alert warns the user to verify the answer."

### Backup Plan
- Screenshots of each demo step saved in `docs/demo_screenshots/`.
- If live demo fails, switch to screenshots.
- If Groq API is down, show the Phase 6 test results instead (automated testing proves the system works).

---

## T7.4 — Pre-Demo Checklist

**Status:** 🟡 Partial (checklist prepared, not yet executed)

### Day Before Demo
- [ ] Internet connection stable and tested
- [ ] Groq API key valid (test with `curl` or a quick Python script)
- [ ] `streamlit run app.py` starts cleanly without errors
- [ ] Upload `space_missions.txt` → confirm "Processed X chunks"
- [ ] Upload `climate_change.txt` → confirm second file appears in sidebar
- [ ] Ask all 6 demo questions and confirm expected results
- [ ] Test both Simple and Thinking modes
- [ ] Verify hallucination panel appears and updates correctly
- [ ] Verify source citations render correctly
- [ ] Test file deletion (sidebar delete buttons)
- [ ] Test "Clear All Documents" button
- [ ] Backend tests pass: `python tests/scripts/run_tests.py`
- [ ] `requirements.txt` is up to date: `pip freeze > requirements.txt`
- [ ] GitHub repo updated: `git push origin main`
- [ ] Demo screenshots saved to `docs/demo_screenshots/`
- [ ] Presentation slides display correctly on demo screen
- [ ] Rehearse full demo — target 6-7 minutes

### Demo Day
- [ ] Close all unnecessary apps (free memory, reduce background noise)
- [ ] Set browser to fullscreen before starting demo
- [ ] Have terminal open with git log visible (to show recent commits)
- [ ] Have `docs/REPORT.md` ready in case audience wants to see report structure
- [ ] Full rehearsal timed: target 6-7 minutes

---

## Completed Items Summary

| Task | Status | Output |
|------|--------|--------|
| T7.1 — Project Report | ✅ Done | `docs/REPORT.md` |
| T7.2 — Architecture Diagram | 🟡 Partial | ASCII diagram in REPORT.md |
| T7.3 — Presentation Slides | 🟡 Partial | Report serves as source material |
| T7.4 — Demo Script | ✅ Done | This section (`docs/phase7.md`) |
| T7.5 — Pre-Demo Checklist | ✅ Done | Checklist above |
