"""Sentence-level grounding score — cosine similarity between the question and retrieved chunks."""

import numpy as np

from backend.vector_store import EMBEDDER


def compute_grounding_score(question: str, chunks: list[str]) -> float:
    """Return the average cosine similarity between *question* and each chunk.

    Uses the same ``SentenceTransformer`` embedder as the retrieval pipeline
    so the embedding space is consistent.  Because ``all-MiniLM-L6-v2``
    produces **normalised** vectors, cosine similarity reduces to the dot
    product of the two embedding matrices.

    Args:
        question: The user's original question.
        chunks:   Retrieved document chunks (already retrieved, before grading).

    Returns:
        Float in [0, 100] representing the average cosine similarity as a
        percentage.  Returns 0.0 when *chunks* is empty.
    """
    if not chunks:
        return 0.0

    q_emb = EMBEDDER.encode([question], normalize_embeddings=True)[0]  # (384,)
    c_embs = EMBEDDER.encode(chunks, normalize_embeddings=True)  # (N, 384)

    # cosine similarity = dot product of normalised vectors
    similarities = c_embs @ q_emb  # (N,)
    avg_sim = float(np.mean(similarities))
    pct = round(max(0.0, avg_sim) * 100, 1)
    return pct
