import re
from pathlib import Path
from docx import Document
from pypdf import PdfReader


def _sanitize_document_text(text: str) -> str:
    """Neutralize prompt injection control tokens, null bytes, and LLM delimiters in ingested documents."""
    if not text:
        return ""
    # Strip null bytes and non-printable control characters (except newline, tab, cr)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)
    # Strip dangerous LLM special control tokens (Llama, ChatML, Mistral, Qwen, DeepSeek, etc.)
    text = re.sub(r"\[/?INST\]|<<SYS>>|<</SYS>>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<\|(?:im_start|im_end|system|user|assistant|endoftext|fim_prefix|fim_suffix|fim_middle|startoftext|eot_id|start_header_id|end_header_id).*?\|>", " ", text, flags=re.IGNORECASE)
    # Strip generic double bracket/tag LLM tokens like <<...>> if they resemble system cues
    text = re.sub(r"<<(?:system|user|assistant|instruction|override)>>", " ", text, flags=re.IGNORECASE)
    return text


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

    # Read plain text files with robust multi-encoding fallback
    elif extension == ".txt":
        raw = file.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            try:
                text = raw.decode("latin-1")
            except UnicodeDecodeError:
                text = raw.decode("utf-8", errors="replace")

    # Stop if the file type is not one we support
    else:
        raise ValueError("Unsupported file type")

    # Stop if nothing readable came out (e.g. scanned image PDF)
    if not text or not text.strip():
        raise RuntimeError("No text found. This may be a scanned image PDF.")

    return _sanitize_document_text(text)
