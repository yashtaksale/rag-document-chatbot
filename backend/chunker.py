from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.config import CHUNK_OVERLAP, CHUNK_SIZE


def chunk_text(text: str, source_filename: str) -> list[dict]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    pieces = splitter.split_text(text)

    chunks = []
    for piece in pieces:
        if len(piece) < 50:
            continue
        chunks.append(
            {
                "text": piece,
                "source": source_filename,
                "chunk_id": len(chunks),
            }
        )
    return chunks
