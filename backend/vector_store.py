import chromadb
from sentence_transformers import SentenceTransformer

# Load the embedding model once so every call reuses the same weights
EMBEDDER = SentenceTransformer("all-MiniLM-L6-v2")


def get_collection(path: str = "./chroma_db"):
    # Open (or create) a folder on disk where Chroma stores vectors
    client = chromadb.PersistentClient(path=path)
    return client.get_or_create_collection("documents")


def add_chunks(collection, chunks: list[dict]) -> None:
    # Turn every chunk into a vector using the shared embedding model
    texts = [chunk["text"] for chunk in chunks]
    embeddings = EMBEDDER.encode(texts).tolist()

    # Give each chunk a stable id and keep its filename and position
    ids = [f"{chunk['source']}_c{chunk['chunk_id']}" for chunk in chunks]
    metadatas = [
        {"source": chunk["source"], "chunk_id": chunk["chunk_id"]}
        for chunk in chunks
    ]

    # Save the text, vectors, ids, and metadata into the collection
    collection.add(
        documents=texts,
        embeddings=embeddings,
        ids=ids,
        metadatas=metadatas,
    )


def query_collection(collection, question: str, top_k: int = 5):
    # Convert the user's question into a vector and find the closest chunks
    question_embedding = EMBEDDER.encode([question]).tolist()
    return collection.query(
        query_embeddings=question_embedding,
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )
