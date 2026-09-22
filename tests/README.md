# Phase 6 Test Suite

Automated evaluation of the DocChat RAG pipeline against prepared test documents.

## Structure

```
tests/
├── README.md                    # This file
├── test_docs/                   # Test documents and ground truth
│   ├── climate_change.txt       # In-domain facts about climate
│   ├── space_missions.txt       # In-domain facts about space
│   ├── python_programming.txt   # In-domain facts about Python
│   ├── mediterranean_diet.txt   # In-domain facts about food
│   ├── countries.csv            # Structured CSV data
│   └── test_questions.txt       # Ground truth questions
├── scripts/
│   └── run_tests.py             # Main test runner
└── results/                     # Auto-saved test outputs (timestamped JSON)
```

## Running

```bash
python tests/scripts/run_tests.py
```

The runner will:
1. Ingest test documents into a clean ChromaDB collection
2. Run each ground truth question through the agentic pipeline
3. Check for answer quality (in-doc answers, refusal for not-in-doc)
4. Profile response times
5. Save a JSON report to `tests/results/`

## Ground Truth Format

Test questions in `test_questions.txt` are categorized:

- `[in_doc]` - Question whose answer is in the documents
- `[not_in_doc]` - Question whose answer is NOT in the documents (should refuse)
- `[edge_case]` - Tricky question (greetings, off-topic, simple math)
- `[cross_doc]` - Question requiring reasoning across documents

`DOCUMENT:` headers group questions by the file they relate to.

## What It Measures

| Metric | Target |
|--------|--------|
| In-doc accuracy (correct answer given) | >85% |
| Not-in-doc refusal rate | >90% |
| Edge case handling (graceful response) | 100% |
| Average response time | <3s |
| Hallucination detection flagging | <15% flagged |
