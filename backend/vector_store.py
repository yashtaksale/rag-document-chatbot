import chromadb
import logging
from sentence_transformers import SentenceTransformer

from backend.config import (
    CHROMA_DB_PATH,
    CHROMA_COLLECTION_NAME,
    EMBEDDER_NAME,
)

logger = logging.getLogger(__name__)

EMBEDDER = SentenceTransformer(EMBEDDER_NAME)


def get_collection(path: str = CHROMA_DB_PATH):
    """Open (or create) the persistent ChromaDB collection."""
    client = chromadb.PersistentClient(path=path)
    return client.get_or_create_collection(CHROMA_COLLECTION_NAME)


def add_chunks(collection, chunks: list[dict], user_id: int) -> None:
    if not chunks:
        return

    texts = [chunk["text"] for chunk in chunks]
    embeddings = EMBEDDER.encode(texts).tolist()

    ids = [f"u{user_id}_{chunk['source']}_c{chunk['chunk_id']}" for chunk in chunks]
    metadatas = [
        {
            "source": chunk["source"],
            "chunk_id": chunk["chunk_id"],
            "user_id": user_id,
        }
        for chunk in chunks
    ]

    collection.add(
        documents=texts,
        embeddings=embeddings,
        ids=ids,
        metadatas=metadatas,
    )
    logger.info("Added %d chunks for user %d", len(chunks), user_id)


def query_collection(collection, question: str, user_id: int, top_k: int = 5):
    question_embedding = EMBEDDER.encode([question]).tolist()
    return collection.query(
        query_embeddings=question_embedding,
        n_results=top_k,
        where={"user_id": user_id},
        include=["documents", "metadatas", "distances"],
    )


def delete_document_chunks(collection, filename: str, user_id: int) -> bool:
    """Deletes all chunks for a specific document belonging to a user."""
    try:
        data = collection.get(
            where={"user_id": user_id},
            include=["metadatas"],
        )
        ids_to_delete = [
            data["ids"][i]
            for i, meta in enumerate(data.get("metadatas", []))
            if meta and meta.get("source") == filename
        ]
        if ids_to_delete:
            collection.delete(ids=ids_to_delete)
        logger.info("Deleted %d chunks for user %d, file %s", len(ids_to_delete), user_id, filename)
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
    """Returns a sorted list of unique source filenames for a user."""
    try:
        data = collection.get(where={"user_id": user_id}, include=["metadatas"])
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
