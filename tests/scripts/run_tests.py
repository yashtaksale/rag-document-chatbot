"""
Phase 6 Test Suite - Automated Evaluation
Tests RAG chatbot backend directly against prepared test documents.
Run: python tests/scripts/run_tests.py
"""

import os
import sys
import time
import json
import traceback
import importlib.util
from datetime import datetime, timezone
from pathlib import Path

# Force UTF-8 stdout/stderr so emoji/non-ASCII output doesn't crash on cp1252
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Setup paths so 'backend.*' imports work
# ---------------------------------------------------------------------------
BASE_DIR = Path.cwd()
sys.path.insert(0, str(BASE_DIR))

RESULTS_DIR = BASE_DIR / "tests" / "results"
RESULTS_DIR.mkdir(exist_ok=True)

TEST_DOCS_DIR = BASE_DIR / "tests" / "test_docs"

os.environ.setdefault("STREAMLIT_TELEMETRY_DISABLED", "1")
os.environ.setdefault("STREAMLIT_WATCHER_TYPE", "none")
os.environ.setdefault("STREAMLIT_SERVER_HEADLESS", "true")


def load_module(name, rel_path):
    """Import a module from a file path."""
    spec = importlib.util.spec_from_file_location(name, BASE_DIR / rel_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# Ingestion helpers
# ---------------------------------------------------------------------------
def ingest_documents(file_paths, user_id=999):
    """Ingest test documents into ChromaDB and return the collection."""
    chunker_mod = load_module("backend.chunker", "backend/chunker.py")
    vs_mod = load_module("backend.vector_store", "backend/vector_store.py")

    all_text = ""
    source_names = []
    for fp in file_paths:
        text = fp.read_text(encoding="utf-8")
        all_text += text + "\n\n"
        source_names.append(fp.name)

    # Create a combined test document
    chunks = chunker_mod.chunk_text(all_text, "test_suite_combined")

    from backend.config import CHROMA_DB_PATH, CHROMA_COLLECTION_NAME, EMBEDDER_NAME
    import chromadb

    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

    # Clear any previous test data for this user
    try:
        client.delete_collection(CHROMA_COLLECTION_NAME)
    except Exception:
        pass

    collection = client.get_or_create_collection(CHROMA_COLLECTION_NAME)

    # Store chunks via vector_store helper
    from sentence_transformers import SentenceTransformer
    embedder = SentenceTransformer(EMBEDDER_NAME)

    texts = [c["text"] for c in chunks]
    embeddings = embedder.encode(texts).tolist()
    ids = [f"u{user_id}_{c['source']}_c{c['chunk_id']}" for c in chunks]
    metadatas = [
        {"source": c["source"], "chunk_id": c["chunk_id"], "user_id": user_id}
        for c in chunks
    ]

    collection.add(documents=texts, embeddings=embeddings, ids=ids, metadatas=metadatas)
    print(f"  Ingested {len(chunks)} chunks into collection")
    return collection, chunks


# ---------------------------------------------------------------------------
# Query helper - calls agent pipeline directly
# ---------------------------------------------------------------------------
def query_system(collection, question, user_id=999):
    """Run the full agentic RAG pipeline on a question."""
    agent_mod = load_module("backend.agent", "backend/agent.py")
    vs_mod = load_module("backend.vector_store", "backend/vector_store.py")
    from backend.config import TOP_K

    start = time.perf_counter()

    # Prepare context using the agent pipeline
    status, relevant_docs, results, raw_context = agent_mod.prepare_agentic_context(
        collection, question, user_id
    )

    elapsed_ms = (time.perf_counter() - start) * 1000

    if status == "direct":
        # No context found — send with strict refusal
        messages = [
            {"role": "system", "content": "You are a strict document-grounded assistant. The user's question cannot be answered from any provided documents. Respond with exactly: 'I do not have sufficient information in the provided documents to answer this accurately.'"},
            {"role": "user", "content": question},
        ]
        answer = "".join(agent_mod.stream_response(messages))
    elif status == "refusal" or not raw_context.strip():
        answer = "I do not have sufficient information in the provided documents to answer this accurately."
    else:
        messages = [
            {"role": "system", "content": "You are a strict document-grounded assistant. Your ONLY source of information is the provided CONTEXT below. If the answer to the user's question is NOT present in the CONTEXT, respond with exactly: 'I do not have sufficient information in the provided documents to answer this accurately.' Do NOT use your training knowledge or any external information. Do NOT elaborate beyond what is in the CONTEXT."},
            {"role": "user", "content": f"CONTEXT:\n{raw_context}\n\nQUESTION: {question}"},
        ]
        answer = "".join(agent_mod.stream_response(messages))

    sources = [doc[:200] for doc in relevant_docs[:3]]
    return answer, sources, results, elapsed_ms


# ---------------------------------------------------------------------------
# Load test questions
# ---------------------------------------------------------------------------
def load_test_questions(path):
    cases = []
    current_doc = "unknown"
    current_category = None

    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("="):
                continue
            if line.startswith("[") and line.endswith("]"):
                current_category = line[1:-1]
                continue
            if line.startswith("DOCUMENT:"):
                current_doc = line.split(":", 1)[1].strip().lower().replace(".txt", "")
                continue
            if line:
                cases.append({
                    "doc": current_doc,
                    "category": current_category,
                    "question": line,
                })
    return cases


# ---------------------------------------------------------------------------
# Test runners
# ---------------------------------------------------------------------------
def run_accuracy_tests(collection, test_cases):
    in_doc_correct = 0
    in_doc_total = 0
    not_in_doc_correct = 0
    not_in_doc_total = 0
    results = []

    print("\n--- Accuracy Tests ---")
    for tc in test_cases:
        if tc["category"] not in ("in_doc", "not_in_doc", "cross_doc"):
            continue

        q = tc["question"]
        cat = tc["category"]
        print(f"\n[{cat.upper()}] Q: {q[:80]}...")

        try:
            answer, sources, _, elapsed = query_system(collection, q)
            print(f"  Answer ({elapsed:.0f}ms): {answer[:120]}...")
            print(f"  Sources: {len(sources)} retrieved")

            entry = {
                "doc": tc["doc"],
                "category": cat,
                "question": q,
                "answer": answer,
                "sources": sources,
                "elapsed_ms": round(elapsed, 1),
            }

            if cat in ("in_doc", "cross_doc"):
                in_doc_total += 1
                refusal_phrases = ["do not have", "insufficient", "cannot answer"]
                has_refusal = any(p in answer.lower() for p in refusal_phrases)
                passed = not has_refusal and len(answer) > 20
                if passed:
                    in_doc_correct += 1
                entry["passed"] = passed

            elif cat == "not_in_doc":
                not_in_doc_total += 1
                refusal_phrases = [
                    "do not have", "insufficient information", "cannot answer",
                    "not in the provided", "document", "provided documents",
                ]
                has_refusal = any(p in answer.lower() for p in refusal_phrases)
                if has_refusal:
                    not_in_doc_correct += 1
                entry["passed"] = has_refusal

            results.append(entry)

        except Exception as e:
            traceback.print_exc()
            results.append({
                "doc": tc["doc"],
                "category": cat,
                "question": q,
                "error": str(e),
                "passed": False,
            })

    stats = {
        "in_doc_correct": in_doc_correct,
        "in_doc_total": in_doc_total,
        "in_doc_rate": in_doc_correct / in_doc_total if in_doc_total else 0.0,
        "not_in_doc_correct": not_in_doc_correct,
        "not_in_doc_total": not_in_doc_total,
        "not_in_doc_rate": not_in_doc_correct / not_in_doc_total if not_in_doc_total else 0.0,
    }
    return results, stats


def run_edge_case_tests(collection, test_cases):
    results = []
    handled = 0
    total = 0

    print("\n--- Edge Case Tests ---")
    edge_cases = [tc for tc in test_cases if tc["category"] == "edge_case"]

    for tc in edge_cases:
        q = tc["question"]
        print(f"\n[EDGE] Q: {q}")
        total += 1

        try:
            answer, sources, _, elapsed = query_system(collection, q)
            print(f"  Answer ({elapsed:.0f}ms): {answer[:120]}...")

            handled_flag = len(answer) > 0 and "error" not in answer.lower()
            if handled_flag:
                handled += 1

            results.append({
                "question": q,
                "answer": answer,
                "handled": handled_flag,
                "elapsed_ms": round(elapsed, 1),
            })

        except Exception as e:
            traceback.print_exc()
            results.append({"question": q, "error": str(e), "handled": False})

    stats = {
        "handled": handled,
        "total": total,
        "rate": handled / total if total else 0.0,
    }
    return results, stats


def run_hallucination_check(collection, test_cases):
    print("\n--- Hallucination Check ---")
    hallucination_indicators = [
        "approximately", "about", "roughly", "around", "estimation",
        "suggests that", "is believed to", "may be", "might be",
        "could be", "possibly", "probably", "likely", "unclear",
    ]

    results = []
    detected = 0
    total = 0

    for tc in test_cases:
        if tc["category"] != "in_doc":
            continue

        q = tc["question"]
        print(f"\n[HALL] Q: {q[:80]}...")
        total += 1

        try:
            answer, sources, graded, elapsed = query_system(collection, q)

            has_markers = any(ind in answer.lower() for ind in hallucination_indicators)
            has_strong_support = any(
                r.get("retrieval_score", 0) > 0.5 for r in graded.get("graded", [])
            )

            flagged = has_markers and not has_strong_support
            if flagged:
                detected += 1

            print(f"  Flagged: {flagged}")
            results.append({
                "question": q,
                "answer_snippet": answer[:200],
                "flagged": flagged,
                "source_count": len(sources),
                "elapsed_ms": round(elapsed, 1),
            })

        except Exception as e:
            traceback.print_exc()
            results.append({"question": q, "error": str(e)})

    stats = {
        "detected": detected,
        "total": total,
        "rate": detected / total if total else 0.0,
    }
    return results, stats


def profile_performance(collection, test_cases, limit=10):
    print("\n--- Performance Profiling ---")
    times = []

    queries = [
        tc["question"] for tc in test_cases
        if tc["category"] in ("in_doc", "not_in_doc", "cross_doc")
    ][:limit]

    for q in queries:
        try:
            _, _, _, elapsed = query_system(collection, q)
            times.append(elapsed)
            print(f"  {elapsed:.0f}ms - {q[:60]}...")
        except Exception as e:
            print(f"  ERROR - {e}")

    stats = {
        "total": len(times),
        "avg_ms": sum(times) / len(times) if times else 0,
        "min_ms": min(times) if times else 0,
        "max_ms": max(times) if times else 0,
    }
    return stats


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
def save_results(results):
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = RESULTS_DIR / f"results_{ts}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to: {out}")
    return out


def print_summary(stats):
    print("\n" + "=" * 60)
    print("PHASE 6 TEST SUMMARY")
    print("=" * 60)

    acc = stats.get("accuracy", {})
    print(f"\nAccuracy:")
    print(f"  In-doc correct:       {acc.get('in_doc_correct', 0)}/{acc.get('in_doc_total', 0)} ({acc.get('in_doc_rate', 0):.1%})")
    print(f"  Not-in-doc correct:   {acc.get('not_in_doc_correct', 0)}/{acc.get('not_in_doc_total', 0)} ({acc.get('not_in_doc_rate', 0):.1%})")

    hall = stats.get("hallucination", {})
    print(f"\nHallucination:")
    print(f"  Detected:             {hall.get('detected', 0)}/{hall.get('total', 0)} ({hall.get('rate', 0):.1%})")

    edge = stats.get("edge_case", {})
    print(f"\nEdge Cases:")
    print(f"  Handled gracefully:   {edge.get('handled', 0)}/{edge.get('total', 0)} ({edge.get('rate', 0):.1%})")

    perf = stats.get("performance", {})
    print(f"\nPerformance:")
    print(f"  Avg: {perf.get('avg_ms', 0):.0f}ms | Min: {perf.get('min_ms', 0):.0f}ms | Max: {perf.get('max_ms', 0):.0f}ms ({perf.get('total', 0)} queries)")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("DocChat Phase 6 Test Suite")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    # Load test documents
    print("\n[1/5] Loading test documents...")
    test_files = sorted(
        p for p in TEST_DOCS_DIR.glob("*")
        if p.suffix in {".txt", ".csv", ".md"}
    )
    if not test_files:
        print(f"No test files found in {TEST_DOCS_DIR}")
        sys.exit(1)
    print(f"  Found {len(test_files)} files: {[f.name for f in test_files]}")

    # Ingest into vector store
    print("\n[2/5] Ingesting documents into vector store...")
    collection, all_chunks = ingest_documents(test_files)
    print(f"  Total chunks: {collection.count()}")

    # Load test questions
    print("\n[3/5] Loading test questions...")
    gt_path = TEST_DOCS_DIR / "test_questions.txt"
    test_cases = load_test_questions(gt_path)
    print(f"  Loaded {len(test_cases)} test cases")

    # Run tests
    print("\n[4/5] Running tests...")
    acc_results, acc_stats = run_accuracy_tests(collection, test_cases)
    edge_results, edge_stats = run_edge_case_tests(collection, test_cases)
    hall_results, hall_stats = run_hallucination_check(collection, test_cases)
    perf_stats = profile_performance(collection, test_cases, limit=10)

    # Compile results
    print("\n[5/5] Compiling results...")
    all_stats = {
        "accuracy": acc_stats,
        "hallucination": hall_stats,
        "edge_case": edge_stats,
        "performance": perf_stats,
    }
    final_results = {
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_test_cases": len(test_cases),
            "docs_tested": [f.name for f in test_files],
            "total_chunks": collection.count(),
        },
        "stats": all_stats,
        "accuracy_results": acc_results,
        "edge_case_results": edge_results,
        "hallucination_results": hall_results,
    }

    out = save_results(final_results)
    print_summary(all_stats)
    print(f"\nFull results saved: {out}")
    return final_results


if __name__ == "__main__":
    main()
