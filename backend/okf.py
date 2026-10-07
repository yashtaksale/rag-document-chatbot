"""Open Knowledge Filtering & Fusion (OKF) Engine.

Provides multi-source document chunk filtering, semantic deduplication,
cross-source consensus scoring, conflict detection, and dynamic context fusion
for document-grounded RAG pipelines.
"""

import logging
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


def _compute_jaccard_similarity(text1: str, text2: str) -> float:
    """Compute token-level Jaccard similarity between two passages."""
    tokens1 = set(re.findall(r"\w+", text1.lower()))
    tokens2 = set(re.findall(r"\w+", text2.lower()))
    if not tokens1 or not tokens2:
        return 0.0
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)
    return len(intersection) / len(union)


def filter_noise(chunks: List[str], min_length: int = 40) -> List[str]:
    """Filter out noisy, corrupted, or trivial text fragments."""
    clean_chunks = []
    for c in chunks:
        c_str = c.strip()
        if len(c_str) < min_length:
            continue
        # Check character repetition (e.g. '.............' or '-------')
        non_punct = re.sub(r"[^\w\s]", "", c_str)
        if len(non_punct) < len(c_str) * 0.4:
            continue
        clean_chunks.append(c_str)
    return clean_chunks


def deduplicate_chunks(chunks: List[str], metadatas: Optional[List[Dict[str, Any]]] = None, sim_threshold: float = 0.82) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Deduplicate semantically redundant chunks across multi-page or multi-doc extractions."""
    retained_chunks = []
    retained_meta = []

    for i, chunk in enumerate(chunks):
        meta = metadatas[i] if metadatas and i < len(metadatas) else {}
        is_duplicate = False
        for kept in retained_chunks:
            if _compute_jaccard_similarity(chunk, kept) >= sim_threshold:
                is_duplicate = True
                break
        if not is_duplicate:
            retained_chunks.append(chunk)
            retained_meta.append(meta)

    return retained_chunks, retained_meta


def detect_cross_source_conflicts(chunks: List[str], metadatas: List[Dict[str, Any]]) -> List[str]:
    """Detect potential numerical or factual divergence across disparate source documents."""
    if len(chunks) < 2:
        return []

    # Map numbers and key entities per source
    source_facts: Dict[str, set] = {}
    conflicts = []

    for i, c in enumerate(chunks):
        source = metadatas[i].get("source", f"Document_{i}") if i < len(metadatas) else f"Document_{i}"
        numbers = set(re.findall(r"\b\d+(?:\.\d+)?%?\b", c))
        if source not in source_facts:
            source_facts[source] = set()
        source_facts[source].update(numbers)

    # Cross-compare different sources
    sources = list(source_facts.keys())
    if len(sources) >= 2:
        for s1_idx in range(len(sources)):
            for s2_idx in range(s1_idx + 1, len(sources)):
                s1 = sources[s1_idx]
                s2 = sources[s2_idx]
                diff1 = source_facts[s1] - source_facts[s2]
                diff2 = source_facts[s2] - source_facts[s1]
                if diff1 and diff2 and len(diff1.intersection(diff2)) == 0:
                    conflicts.append(f"Potential variance in numerical metrics between `{s1}` and `{s2}`.")

    return conflicts[:3]


def fuse_and_filter_knowledge(
    query: str,
    retrieved_documents: List[str],
    retrieved_metadatas: Optional[List[Dict[str, Any]]] = None,
    max_context_chars: int = 3500,
) -> Dict[str, Any]:
    """Execute full OKF (Open Knowledge Filtering & Fusion) pipeline.

    1. Noise elimination & artifact cleaning
    2. Multi-source semantic deduplication
    3. Source diversity & consensus scoring
    4. Cross-source conflict detection
    5. Fused synthesized context assembly with provenance tagging
    """
    total_raw = len(retrieved_documents)
    if not retrieved_documents:
        return {
            "fused_context": "",
            "fusion_score": 0.0,
            "raw_count": 0,
            "retained_count": 0,
            "source_diversity": 0.0,
            "consensus_score": 0.0,
            "conflicts": [],
            "source_contributions": {},
        }

    # Step 1: Noise filtering
    valid_docs = []
    valid_meta = []
    for idx, doc in enumerate(retrieved_documents):
        meta = retrieved_metadatas[idx] if retrieved_metadatas and idx < len(retrieved_metadatas) else {}
        if len(doc.strip()) >= 30:
            valid_docs.append(doc.strip())
            valid_meta.append(meta)

    # Step 2: Semantic Deduplication
    deduped_docs, deduped_meta = deduplicate_chunks(valid_docs, valid_meta)

    # Step 3: Source metrics
    sources = [m.get("source", "Unknown") for m in deduped_meta]
    source_counts = Counter(sources)
    unique_sources = len(source_counts)
    source_diversity = min(1.0, unique_sources / max(1, len(deduped_docs))) if deduped_docs else 0.0

    # Step 4: Consensus & Conflict analysis
    conflicts = detect_cross_source_conflicts(deduped_docs, deduped_meta)
    consensus_score = max(0.4, 1.0 - (0.2 * len(conflicts)))

    # Step 5: Context Assembly
    fused_blocks = []
    current_len = 0

    for i, doc in enumerate(deduped_docs):
        src_name = deduped_meta[i].get("source", "Doc") if i < len(deduped_meta) else "Doc"
        block = f"[Source: {src_name}]\n{doc}"
        if current_len + len(block) > max_context_chars and fused_blocks:
            break
        fused_blocks.append(block)
        current_len += len(block)

    fused_context = "\n\n---\n\n".join(fused_blocks)

    # Compute overall OKF Fusion Score (0 - 100)
    # Balanced composite of retention quality (30%), source diversity (30%), consensus (40%)
    retention_ratio = len(deduped_docs) / max(1, total_raw)
    fusion_score = round(
        (0.30 * retention_ratio + 0.30 * source_diversity + 0.40 * consensus_score) * 100.0,
        1,
    )

    return {
        "fused_context": fused_context,
        "fused_documents": deduped_docs,
        "fused_metadatas": deduped_meta,
        "fusion_score": min(100.0, max(0.0, fusion_score)),
        "raw_count": total_raw,
        "retained_count": len(deduped_docs),
        "source_diversity": round(source_diversity * 100.0, 1),
        "consensus_score": round(consensus_score * 100.0, 1),
        "conflicts": conflicts,
        "source_contributions": dict(source_counts),
    }
