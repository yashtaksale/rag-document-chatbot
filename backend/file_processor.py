from pathlib import Path

from docx import Document
from pypdf import PdfReader


def extract_text(file) -> str:
    # Figure out the file type from its extension
    extension = Path(file.name).suffix.lower()
    file.seek(0)

    # Pull text out of PDF files, one page at a time
    if extension == ".pdf":
        reader = PdfReader(file)
        text = "".join(page.extract_text() or "" for page in reader.pages)

    # Pull text out of Word documents, one paragraph at a time
    elif extension == ".docx":
        document = Document(file)
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)

    # Read plain text files and decode them as UTF-8
    elif extension == ".txt":
        text = file.read().decode("utf-8")

    # Stop if the file type is not one we support
    else:
        raise ValueError("Unsupported file type")

    # Stop if nothing readable came out (e.g. scanned image PDF)
    if not text or not text.strip():
        raise RuntimeError("No text found. This may be a scanned image PDF.")

    return text
