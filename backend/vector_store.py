import logging
import re
import threading
import chromadb

from backend.config import (
    CHROMA_DB_PATH,
    CHROMA_COLLECTION_NAME,
    EMBEDDER_NAME,
)

logger = logging.getLogger(__name__)

_embedder_instance = None
_embed_lock = threading.Lock()


def get_embedder():
    """Return the global SentenceTransformer embedder singleton with lazy initialization."""
    global _embedder_instance
    if _embedder_instance is None:
        with _embed_lock:
            if _embedder_instance is None:
                from sentence_transformers import SentenceTransformer
                _embedder_instance = SentenceTransformer(EMBEDDER_NAME)
    return _embedder_instance


class _LazyEmbedderProxy:
    """Lazy proxy so code that imports `from backend.vector_store import EMBEDDER` continues to work."""
    def encode(self, *args, **kwargs):
        return get_embedder().encode(*args, **kwargs)


EMBEDDER = _LazyEmbedderProxy()


def _sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent metadata filter injection and special character issues."""
    if not filename:
        return "unnamed_doc"
    # Keep only alphanumeric, hyphens, underscores, dots, and spaces
    clean = re.sub(r"[^\w\.\-\s]", "_", filename.strip())
    return clean[:200]


def encode_texts(texts: list[str], normalize_embeddings: bool = True):
    """Thread-safe batch embedding generation using SentenceTransformer singleton."""
    embedder = get_embedder()
    with _embed_lock:
        return embedder.encode(texts, normalize_embeddings=normalize_embeddings).tolist()


def get_collection(path: str = CHROMA_DB_PATH):
    """Open (or create) the persistent ChromaDB collection."""
    client = chromadb.PersistentClient(path=path)
    return client.get_or_create_collection(CHROMA_COLLECTION_NAME)


def add_chunks(collection, chunks: list[dict], user_id: int) -> None:
    """Add document chunks with normalized embeddings and robust validation."""
    if not chunks:
        return

    valid_chunks = [c for c in chunks if c.get("text") and c["text"].strip()]
    if not valid_chunks:
        logger.warning("No valid text in chunks for user %d", user_id)
        return

    texts = [chunk["text"] for chunk in valid_chunks]
    try:
        embeddings = encode_texts(texts, normalize_embeddings=True)
    except Exception as exc:
        logger.error("Failed to generate embeddings: %s", exc)
        raise RuntimeError(f"Embedding generation failed: {exc}") from exc

    ids = [f"u{user_id}_{_sanitize_filename(chunk['source'])}_{chunk['chunk_id']}" for chunk in valid_chunks]
    metadatas = [
        {
            "source": _sanitize_filename(chunk["source"]),
            "chunk_id": chunk["chunk_id"],
            "user_id": user_id,
        }
        for chunk in valid_chunks
    ]

    collection.add(
        documents=texts,
        embeddings=embeddings,
        ids=ids,
        metadatas=metadatas,
    )
    logger.info("Added %d chunks for user %d", len(valid_chunks), user_id)


def query_collection(collection, question: str, user_id: int, top_k: int = 5):
    """Query the collection with thread-safe normalized embeddings and error diagnostics."""
    if not question or not question.strip():
        return {"documents": [[]], "metadatas": [[]], "distances": [[]]}

    try:
        question_embedding = encode_texts([question], normalize_embeddings=True)
        return collection.query(
            query_embeddings=question_embedding,
            n_results=top_k,
            where={"user_id": user_id},
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:
        logger.error("Vector database query failed: %s", exc, exc_info=True)
        return {"documents": [[]], "metadatas": [[]], "distances": [[]], "error": str(exc)}


def delete_document_chunks(collection, filename: str, user_id: int) -> bool:
    """Deletes all chunks for a document belonging to a user with pagination fallback."""
    clean_name = _sanitize_filename(filename)
    try:
        # 1. Try compound metadata filter
        try:
            collection.delete(where={"$and": [{"user_id": user_id}, {"source": clean_name}]})
            logger.info("Deleted chunks via compound filter for user %d, file %s", user_id, clean_name)
            return True
        except Exception:
            pass

        # 2. Paginated deletion fallback
        page_size = 5000
        offset = 0
        total_deleted = 0
        while True:
            data = collection.get(
                where={"user_id": user_id},
                include=["metadatas"],
                limit=page_size,
                offset=offset,
            )
            if not data or not data.get("ids"):
                break

            ids_to_delete = [
                data["ids"][i]
                for i, meta in enumerate(data.get("metadatas", []))
                if meta and (meta.get("source") == clean_name or meta.get("source") == filename)
            ]

            if ids_to_delete:
                collection.delete(ids=ids_to_delete)
                total_deleted += len(ids_to_delete)

            if len(data["ids"]) < page_size:
                break
            offset += page_size

        logger.info("Deleted total %d chunks for user %d, file %s", total_deleted, user_id, clean_name)
        return True
    except Exception as exc:
        logger.error("Failed to delete chunks: %s", exc)
        return False


def clear_user_vault(collection, user_id: int) -> bool:
    """Deletes every chunk belonging to a user."""
    try:
        collection.delete(where={"user_id": user_id})
        logger.info("Cleared all chunks for user %d", user_id)
        return True
    except Exception as exc:
        logger.error("Failed to clear vault: %s", exc)
        return False


def get_user_documents(collection, user_id: int) -> list[str]:
    """Returns a sorted list of unique source filenames for a user without pagination truncation."""
    try:
        data = collection.get(where={"user_id": user_id}, include=["metadatas"], limit=100000)
        if not data or not data.get("metadatas"):
            return []
        sources = set()
        for meta in data["metadatas"]:
            if meta and "source" in meta:
                sources.add(meta["source"])
        return sorted(list(sources))
    except Exception as exc:
        logger.error("Failed to list documents: %s", exc)
        return []
