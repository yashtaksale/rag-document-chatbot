# Limitations — DocChat
**Last Updated:** 2026-01-15

This document records known limitations of the DocChat system, grouped by component.
Each limitation includes: description, severity, and whether a fix is planned.

---

## 1. Document Processing

### 1.1 Scanned PDFs Not Supported
- **Severity:** Medium
- **Description:** PDFs that contain scanned images (no text layer) cannot be processed. `pypdf` extracts text from PDF text layers only. OCR is not implemented.
- **Impact:** Users uploading scanned documents get empty or near-empty responses.
- **Fix planned:** Add Tesseract OCR fallback or recommend users convert to text first.

### 1.2 PDF Table Extraction Order
- **Severity:** Low
- **Description:** `pypdf` extracts text in reading order, but complex multi-column or wide-table layouts may produce out-of-order text. This can cause garbled chunk content.
- **Impact:** Inaccurate answers for documents with complex layouts.
- **Fix planned:** Consider `pdfplumber` for better table support.

### 1.3 Non-English Documents (Untested)
- **Severity:** Medium
- **Description:** The embedding model (`all-MiniLM-L6-v2`) is English-trained. Non-English documents will produce poor retrieval quality. Groq models handle multiple languages, but retrieval is the bottleneck.
- **Impact:** Non-English document sets will have degraded accuracy.
- **Fix planned:** Switch to `paraphrase-multilingual-MiniLM-L12-v2` for multilingual support.

### 1.4 No DOCX Support in Production
- **Severity:** Low
- **Description:** The `python-docx` library is listed as a dependency but the current `extract_text()` function only handles `.txt`, `.csv`, `.md`, and `.pdf` files.
- **Fix planned:** Add `.docx` handler in `backend/file_processor.py`.

---

## 2. Retrieval Quality

### 2.1 Chunks May Miss Context at Boundaries
- **Severity:** Low
- **Description:** Recursive character splitting at 500 characters with 50-char overlap can split sentences across chunks, causing context loss at chunk boundaries.
- **Impact:** Answers may be slightly less precise for dense technical documents.
- **Fix planned:** None — acceptable trade-off for speed. Overlap of 50 chars mitigates most cases.

### 2.2 Retrieval Returns 0 Sources for Some Queries
- **Severity:** Medium
- **Description:** During testing, some queries returned 0 source chunks. This occurs when:
  - The chunk grader rejects all retrieved chunks (grading is strict).
  - The query rewrite also fails to find relevant chunks.
  - The cosine similarity threshold filters out all results.
- **Impact:** Questions that should be answerable return "insufficient information" responses.
- **Fix planned:** Tune `SIMILARITY_THRESHOLD` and grader strictness during Phase 4.4 calibration.

---

## 3. Hallucination Detection

### 3.1 Detection Relies on LLM Judgment
- **Severity:** Medium
- **Description:** The current hallucination detection uses an LLM (Groq) to verify claims against retrieved context. This means the "judge" can itself hallucinate or miss subtle unsupported claims.
- **Impact:** Hallucination score is an estimate, not a ground truth.
- **Fix planned:** None — this is a fundamental limitation of LLM-based verification. The approach provides useful signal but is not infallible.

### 3.2 Detection Adds Latency
- **Severity:** Low
- **Description:** Each answer triggers additional Groq API calls for claim extraction and verification. This adds ~1-3 seconds to response time.
- **Impact:** Slower responses, especially for complex questions.
- **Fix planned:** Parallelize detection calls (currently sequential).

### 3.3 Threshold Not Yet Calibrated
- **Severity:** Medium
- **Description:** The hallucination risk threshold (when to show HIGH/MEDIUM/LOW) has not been calibrated against a labeled test set. Current behavior shows a percentage score without categorical risk labels.
- **Impact:** Users cannot interpret risk levels intuitively.
- **Fix planned:** Complete Phase 4.4 calibration.

---

## 4. LLM Backend

### 4.1 API Dependency
- **Severity:** High
- **Description:** The system requires a working internet connection and valid Groq API key. Without it, the chatbot cannot function.
- **Impact:** No offline mode.
- **Fix planned:** Phase 3 fine-tuned model can run locally (though slowly without GPU).

### 4.2 Rate Limiting
- **Severity:** Low
- **Description:** Groq's free tier limits requests per minute. Agentic mode (routing + grading + rewriting + generation) makes multiple API calls per question. Heavy usage may hit rate limits.
- **Impact:** Brief unavailability during peak usage.
- **Fix planned:** Implement exponential backoff and request queuing.

### 4.3 Model Not Fine-Tuned
- **Severity:** Medium
- **Description:** The system uses a general-purpose LLM (`openai/gpt-oss-20b` via Groq). It has not been fine-tuned on the refusal behavior needed for hallucination resistance.
- **Impact:** Higher hallucination rate than a fine-tuned model would achieve.
- **Fix planned:** Phase 3 LoRA fine-tuning on Colab.

---

## 5. Vector Database

### 5.1 Single Collection Per User
- **Severity:** Low
- **Description:** ChromaDB uses a single collection per user. There is no document-level isolation beyond metadata filtering.
- **Impact:** Deleting one document requires filtering by metadata.
- **Fix planned:** None — current approach works correctly.

### 5.2 No Incremental Indexing Optimization
- **Severity:** Low
- **Description:** When a user uploads a new file, all chunks are re-embedded and added. There is no incremental deduplication for files with minor edits.
- **Impact:** Slightly more storage usage.
- **Fix planned:** None — acceptable for current scale.

---

## 6. User Interface

### 6.1 No Persistent User Sessions
- **Severity:** Low
- **Description:** Conversations are stored in local JSON files. There is no user authentication or multi-device sync.
- **Impact:** Users cannot access conversations from different devices.
- **Fix planned:** None — out of scope for current project scope.

### 6.2 Response Time Variation
- **Severity:** Low
- **Description:** Response times vary based on:
  - Groq API latency (typically 200-800ms for generation)
  - Agentic pipeline depth (routing + grading = 2-4 extra API calls)
  - Network conditions
- **Measured performance (Phase 6):** Avg ~800-2500ms for agentic mode.
- **Fix planned:** Caching frequent queries; fine-tuned model for local inference.

---

## 7. Testing Coverage

### 7.1 Limited Test Document Diversity
- **Severity:** Low
- **Description:** Test documents cover 5 domains (climate, space, programming, food, countries). Edge cases for medical, legal, and financial documents are not tested.
- **Impact:** Unknown accuracy on specialized domains.
- **Fix planned:** Expand test suite.

### 7.2 No Multi-User Testing
- **Severity:** Low
- **Description:** All testing was done with a single test user (user_id=999). Multi-user isolation, concurrent access, and data leakage between users are not tested.
- **Fix planned:** Add multi-user test cases.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| High | 1 | API dependency (no offline mode) |
| Medium | 5 | Scanned PDFs, non-english, retrieval 0 sources, LLM-based detection, threshold not calibrated, no fine-tuning |
| Low | 7 | Table extraction, chunk boundaries, detection latency, single collection, no incremental indexing, no persistent sessions, response time variation, limited test diversity |

**Overall assessment:** The system works reliably for its intended use case (English text documents, online, single user). The biggest gaps are: offline capability, fine-tuned model, and calibrated hallucination thresholds — all addressed in future phases.
