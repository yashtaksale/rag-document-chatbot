"""Retrieval gate — decides whether retrieved chunks are relevant enough to answer."""

from backend.config import SIMILARITY_THRESHOLD


def passes_gate(results: dict, threshold: float = SIMILARITY_THRESHOLD) -> tuple[bool, float]:
    """Check if the best retrieved chunk clears the similarity threshold.

    ChromaDB returns L2 distances. For *normalised* embeddings (e.g.
    ``all-MiniLM-L6-v2``) the conversion to cosine similarity is::

        cosine_similarity = 1 - (L2_distance ** 2) / 2

    Args:
        results:   Raw ChromaDB ``query`` result dict (must include "distances").
        threshold: Minimum cosine similarity required to pass the gate.

    Returns:
        ``(passed, best_score)`` where *passed* is ``True`` when the
        highest-scoring chunk meets the threshold, and *best_score* is that
        chunk's cosine similarity (0.0 when no chunks were retrieved).
    """
    distances = results.get("distances", [[]])
    if not distances or not distances[0]:
        return False, 0.0

    min_distance = min(distances[0])
    # ChromaDB returns squared L2 distance (D = ||u - v||^2).
    # For normalized unit embeddings: D = 2 - 2*cos(theta) => cos(theta) = 1.0 - D / 2.0
    cosine_sim = 1.0 - (min_distance / 2.0)
    cosine_sim = max(0.0, min(1.0, cosine_sim))  # clamp between 0.0 and 1.0

    return cosine_sim >= threshold, cosine_sim
