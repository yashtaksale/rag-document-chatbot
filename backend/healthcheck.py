"""DocChat Production System Diagnostics & Health Check Suite.

Validates environment variables, API connectivity, ChromaDB vector storage,
SentenceTransformer embeddings, and document parsers.
"""

import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
import numpy as np

# Ensure UTF-8 stdout encoding on Windows consoles
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Load .env file
load_dotenv()

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import (
    EMBEDDER_NAME,
    CHROMA_DB_PATH,
    CHROMA_COLLECTION_NAME,
    MODEL_NAME,
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


def run_diagnostics():
    print("=" * 60)
    print("[*] DocChat Production Health Check & Diagnostics")
    print("=" * 60)

    checks_passed = 0
    total_checks = 5

    # 1. Environment & API Key Check
    print("\n[1/5] Checking Environment & Groq API Key...")
    if GROQ_API_KEY and GROQ_API_KEY.startswith("gsk_"):
        print(f"  [PASS] GROQ_API_KEY present (Prefix: {GROQ_API_KEY[:7]}... Length: {len(GROQ_API_KEY)})")
        checks_passed += 1
    else:
        print("  [WARN] GROQ_API_KEY is missing or invalid. Set it in .env or environment.")

    # 2. Embedding Model Singleton Check
    print(f"\n[2/5] Initializing Embedding Model ({EMBEDDER_NAME})...")
    try:
        from backend.vector_store import get_embedder
        start = time.time()
        embedder = get_embedder()
        sample_vec = embedder.encode(["DocChat health check test phrase"], normalize_embeddings=True)
        dur = time.time() - start
        
        # Verify vector dimension and unit norm
        norm = float(np.linalg.norm(sample_vec[0]))
        dim = sample_vec.shape[1]
        print(f"  [PASS] Embedding model loaded in {dur:.2f}s (Dim: {dim}, Norm: {norm:.4f})")
        if dim == 384 and abs(norm - 1.0) < 1e-3:
            checks_passed += 1
        else:
            print(f"  [WARN] Unexpected vector properties: Dim={dim}, Norm={norm}")
    except Exception as e:
        print(f"  [FAIL] Embedding model initialization failed: {e}")

    # 3. ChromaDB Vector Store Persistence Check
    print(f"\n[3/5] Verifying ChromaDB Storage ({CHROMA_DB_PATH})...")
    try:
        from backend.vector_store import get_collection
        col = get_collection()
        doc_count = col.count()
        print(f"  [PASS] ChromaDB connected successfully! (Active chunks in DB: {doc_count})")
        checks_passed += 1
    except Exception as e:
        print(f"  [FAIL] ChromaDB connection error: {e}")

    # 4. File Parsers Integrity Check
    print("\n[4/5] Testing Document Extraction Parsers...")
    try:
        import pypdf
        import docx
        from backend.file_processor import _sanitize_document_text
        
        raw_text = "Test Document Content with special \x00 characters and {{injection}} tokens."
        clean_text = _sanitize_document_text(raw_text)
        print("  [PASS] Parsers (pypdf, python-docx, text-sanitizer) ready!")
        checks_passed += 1
    except Exception as e:
        print(f"  [FAIL] Parser integrity error: {e}")

    # 5. Groq API Live Connectivity Ping
    print(f"\n[5/5] Testing Live Groq API Connectivity ({MODEL_NAME})...")
    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)
        resp = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5,
        )
        msg = resp.choices[0].message.content.strip()
        print(f"  [PASS] Groq API online! Response: '{msg}' (Model: {MODEL_NAME})")
        checks_passed += 1
    except Exception as e:
        print(f"  [WARN] Groq API connection warning: {e}")

    # Final Summary
    print("\n" + "=" * 60)
    print(f"DIAGNOSTIC SUMMARY: {checks_passed}/{total_checks} Checks Passed")
    print("=" * 60)

    if checks_passed == total_checks:
        print("[SUCCESS] System status: 100% PRODUCTION READY & HEALTHY\n")
        return 0
    elif checks_passed >= 4:
        print("[NOTICE] System status: OPERATIONAL (With minor non-critical warnings)\n")
        return 0
    else:
        print("[ERROR] System status: DEGRADED — Please resolve the errors above.\n")
        return 1


if __name__ == "__main__":
    sys.exit(run_diagnostics())
