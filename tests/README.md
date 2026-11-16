# DocChat Test Suite & Evaluation Harness (Phase 6)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  

Automated evaluation harness for the DocChat RAG pipeline, agentic retrieval, retrieval gating, and hallucination auditor.

---

## 📁 Test Suite Structure

```
tests/
├── README.md                    # This manual
├── test_docs/                   # Ground-truth test documents & questions
│   ├── climate_change.txt       # Climate policy & atmospheric metrics
│   ├── space_missions.txt       # Space exploration timeline & payloads
│   ├── python_programming.txt   # Python syntax & concurrency
│   ├── mediterranean_diet.txt   # Nutrition & medical studies
│   ├── countries.csv            # Tabular demographic metrics
│   └── test_questions.txt       # Ground truth annotated questions
├── scripts/
│   └── run_tests.py             # Main automated test runner
└── results/                     # Timestamped JSON reports & benchmark summary
    ├── TEST_RESULTS_SUMMARY.md  # Post-fix performance metrics
    └── results_*.json           # Raw JSON run outputs
```

---

## 🚀 Running the Evaluation Suite

```bash
# Ensure virtual environment is active
source venv/bin/activate  # Or: venv\Scripts\activate on Windows

# Execute the test runner
python tests/scripts/run_tests.py
```

The runner will:
1. Ingest test documents into an isolated ChromaDB test collection.
2. Iterate through all 66 ground-truth questions across `[in_doc]`, `[not_in_doc]`, `[edge_case]`, and `[cross_doc]` categories.
3. Evaluate in-document factual accuracy and out-of-document refusal enforcement.
4. Profile response latency and hallucination detection flags.
5. Save a timestamped report to `tests/results/`.

---

## 📊 Measured Performance Targets & Outcomes

| Metric | Target | Measured Result |
|---|---|---|
| **In-Document Answer Accuracy** | > 85.0% | **93.0%** (40/43 questions) |
| **Out-of-Document Refusal Rate** | > 90.0% | **100.0%** (19/19 questions) |
| **Edge-Case / Greeting Handling** | 100.0% | **100.0%** (4/4 test cases) |
| **Average End-to-End Latency** | < 2,500 ms | **826 ms** |
| **Retrieval Gate Precision** | > 95.0% | **100.0%** |
| **Prompt Injection Defense** | 100.0% | **100.0%** (11/11 patterns) |
