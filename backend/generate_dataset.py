"""
Phase 3 - Synthetic training data generation.
Reads documents, generates grounded + refusal Q&A pairs using Groq.
Outputs JSONL with instruction/input/output for fine-tuning.
"""

import json
import os
import sys
import time
import logging
from pathlib import Path

import dotenv
from groq import Groq

dotenv.load_dotenv()

logger = logging.getLogger("docchat.training")
logging.basicConfig(level=logging.INFO)

OUTPUT_PATH = Path("data/training_data/dataset.jsonl")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY)
MODEL = "openai/gpt-oss-20b"

DELAY = 1.2  # Groq free-tier friendly


def chunk_text(text, chunk_size=400):
    """Simple word-based chunker (no LangChain dependency)."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        if len(chunk) > 50:
            chunks.append(chunk)
    return chunks


def generate_grounded_qa(chunk: str):
    """Generate 2 grounded questions + answers."""
    prompt = (
        "You are generating training data for a document-grounded chatbot.\n"
        "Given this excerpt, generate exactly 2 questions that can be answered "
        "using ONLY information in this excerpt. For each, provide the answer.\n\n"
        f"Excerpt:\n\"\"\"\n{chunk[:1500]}\n\"\"\"\n\n"
        "Output as JSON:\n"
        '{"examples": [\n'
        '  {"question": "...", "answer": "..."},\n'
        '  {"question": "...", "answer": "..."}\n'
        ']}\n'
    )

    try:
        res = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.5,
            timeout=30,
        )
        data = json.loads(res.choices[0].message.content)
        return data.get("examples", [])
    except Exception as exc:
        logger.warning("Generation failed: %s", exc)
        return []


def generate_unanswerable_qa(chunk: str):
    """Generate 1 unanswerable question + refusal."""
    prompt = (
        "You are generating training data for a document-grounded chatbot.\n"
        "Given this excerpt, generate 1 question that is NOT answerable from "
        "this excerpt. The correct response should be a polite refusal indicating "
        "the information is not available.\n\n"
        f"Excerpt:\n\"\"\"\n{chunk[:1500]}\n\"\"\"\n\n"
        "Output as JSON:\n"
        '{"question": "...", "refusal": "..."}\n'
        "Make the refusal start with 'I do not have' or similar.\n"
    )

    try:
        res = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.7,
            timeout=30,
        )
        data = json.loads(res.choices[0].message.content)
        return data.get("question"), data.get("refusal")
    except Exception as exc:
        logger.warning("Unanswerable generation failed: %s", exc)
        return None, None


def process_document(filepath: Path, max_chunks=20):
    """Process one document into multiple Q&A pairs."""
    text = filepath.read_text(encoding="utf-8", errors="ignore")
    chunks = chunk_text(text)
    chunks = chunks[:max_chunks]  # Cap per file

    examples = []
    source_name = filepath.name

    for i, chunk in enumerate(chunks):
        logger.info("  [%s] chunk %d/%d", source_name, i + 1, len(chunks))

        # 2 grounded
        grounded = generate_grounded_qa(chunk)
        for ex in grounded:
            q = ex.get("question")
            a = ex.get("answer")
            if q and a:
                examples.append({
                    "instruction": (
                        "Answer the question using only the provided context. "
                        "If the context does not contain the answer, say so."
                    ),
                    "input": f"Context:\n{chunk[:1000]}\n\nQuestion: {q}",
                    "output": a,
                })
        time.sleep(DELAY)

        # 1 unanswerable
        q, refusal = generate_unanswerable_qa(chunk)
        if q and refusal:
            examples.append({
                "instruction": (
                    "Answer the question using only the provided context. "
                    "If the context does not contain the answer, say so."
                ),
                "input": f"Context:\n{chunk[:1000]}\n\nQuestion: {q}",
                "output": refusal,
            })
        time.sleep(DELAY)

    return examples


def save_dataset(examples):
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex) + "\n")
    logger.info("Saved %d examples to %s", len(examples), OUTPUT_PATH)


def main():
    """Process all documents in tests/test_docs/ (or specified dir)."""
    docs_dir = Path("tests/test_docs")  # Use existing test docs

    if not docs_dir.exists():
        # Fallback to data dir
        docs_dir = Path("data/sample_docs")
        if not docs_dir.exists():
            docs_dir.mkdir(parents=True)
            print(f"Created {docs_dir}. Add documents there and rerun.")
            return

    files = list(docs_dir.glob("*.txt")) + list(docs_dir.glob("*.md"))
    if not files:
        logger.warning("No text files in %s", docs_dir)
        return

    all_examples = []

    for f in files:
        logger.info("Processing %s...", f.name)
        ex = process_document(f)
        logger.info("  -> %d examples", len(ex))
        all_examples.extend(ex)

    save_dataset(all_examples)
    print(f"\nGenerated {len(all_examples)} examples in {OUTPUT_PATH}")
    print("Next steps:")
    print("  1. Upload to Colab")
    print("  2. Run notebooks/phase3_finetuning.ipynb")


if __name__ == "__main__":
    main()
