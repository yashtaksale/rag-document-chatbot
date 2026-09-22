# Phase 6 Test Results Summary
**Date:** 2026-01-15  
**Runner:** `tests/scripts/run_tests.py`  
**Test data:** `tests/test_docs/` (5 documents, 66 ground-truth questions)

## Headline Numbers

| Metric | Result | Target | Pass? |
|--------|--------|--------|-------|
| In-doc accuracy | 93.0% (40/43) | >85% | YES |
| Not-in-doc refusal | 0.0% (0/19) | >90% | NO |
| Edge case handling | 75.0% (3/4) | 100% | PARTIAL |
| Hallucination flag rate | 20.9% (9/43) | <15% | OVER |

**Overall verdict:** Mixed — retrieval and grounding work well, but the refusal mechanism is broken.

## What worked

1. **In-doc answer quality is strong (93%).** When the answer is in the source documents, the system finds it and synthesizes a correct response. Most retrieval cases get accurate answers within 400-800ms.

2. **Retrieval is precise.** When chunks are relevant, they generally contain the exact answer. The chunk grading prompt correctly identifies relevant content.

3. **Sources and hallucinations** are surfaced via the UI, and `evaluate_hallucination()` provides meaningful signal for downstream verification.

## What's broken

1. **Refusal rate is 0%.** When asked about topics NOT in any document, the system does not refuse — it generates a confident answer using Groq's training data. Examples:
   - Q: "What is the chemical formula for CFCs?" (not in any doc) → A: Full explanation with formulas (invented from training)
   - Q: "What is the average lifespan in Greece?" (not in any doc) → A: Detailed statistics from training data
   - Q: "When was the Kyoto Protocol signed?" → A: 1997 (from training)

   **Root cause:** The answer-generation  did not strictly forbid using training knowledge. The grading default-on-error (keeping chunks instead of dropping them) compounded the problem.

2. **Edge case "2+2" was answered correctly,** but an off-topic question like "What does a dog say?" got a long training-data answer instead of recognizing it as irrelevant.

3. **Hallucination flag rate (21%) is higher than target.** This will improve once refusals work — fewer fabricated answers → fewer flag-worthy responses.

## Fixes applied (after this run)

1. ** rewritten** in `app.py` and `tests/scripts/run_tests.py` to be explicit: "If the answer is NOT in the CONTEXT, respond with the exact refusal sentence."

2. **Chunk grading default flipped** to `False` (reject on error) instead of `True` (keep). This prevents noise from passing into the answer stage.

3. **Direct (no-context) path** in test runner now uses the strict refusal prompt, so questions the router labels as "no retrieval needed" still get refused if they relate to documents the user uploaded.

## Re-run expected outcomes

With these fixes:
- **Not-in-doc refusal:** Expected 70-90% (better than 0%, but won't be 100% because Groq's `gpt-oss-20b` will sometimes ignore the instruction).
- **In-doc accuracy:** Should stay at ~90%+ (the strict prompt is unlikely to hurt grounded answers).
- **Hallucination flag rate:** Should drop below 15% (fewer fabricated answers = fewer flags).

## Recommended next steps

1. **Re-run the test suite** to confirm the fixes improved refusal rate.
2. **Phase 3 fine-tuning** is the deeper fix — a LoRA-tuned model trained on refusal examples will refuse much more reliably than prompt engineering.
3. **For the demo:** Use document-specific questions. Avoid asking about topics that aren't in any uploaded doc, because the system may still answer (even after the fix).
