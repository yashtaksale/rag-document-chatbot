from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_text(text: str, source_filename: str) -> list[dict]:
    # Split the document into overlapping pieces so related sentences stay together
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    pieces = splitter.split_text(text)

    # Build a list of chunks with the original filename and a number for each piece
    chunks = []
    for piece in pieces:
        # Skip leftover pieces that are too short to be useful
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
