"""DocChat — FastAPI Backend Server for Claude/ChatGPT Web Application.

Exposes REST & SSE streaming endpoints for ChromaDB vector vault,
document ingestion (PDF/DOCX/TXT), agentic RAG retrieval,
groundedness scoring, and claim-level hallucination audit.
"""

import asyncio
import io
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, AsyncGenerator, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import re
from backend.agent import (
    evaluate_hallucination,
    generate_followups,
    highlight_hallucinations,
    prepare_agentic_context,
    stream_response,
    _groq_call,
)
from backend.chunker import chunk_text
from backend.config import (
    CHROMA_COLLECTION_NAME,
    CHROMA_DB_PATH,
    EMBEDDER_NAME,
    MODEL_NAME,
    TEMPERATURE_ANSWER,
    TOP_K,
)
from backend.file_processor import extract_text
from backend.grounding import compute_grounding_score
from backend.retrieval_gate import passes_gate
from backend.vector_store import (
    add_chunks,
    clear_user_vault,
    delete_document_chunks,
    get_collection,
    get_user_documents,
    query_collection,
)

logger = logging.getLogger("docchat.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

app = FastAPI(
    title="DocChat API",
    description="Backend API for DocChat RAG & Document Intelligence",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent ChromaDB collection handle
_collection = None


def get_chroma_collection():
    global _collection
    if _collection is None:
        _collection = get_collection()
    return _collection


class ChatRequest(BaseModel):
    question: str
    user_id: int = 1
    mode: str = "Thinking"  # "Simple" | "Thinking"
    messages: Optional[List[dict]] = None


# ── System Health & Stats ────────────────────────────────────────────────────
@app.get("/api/health")
def health(user_id: int = Query(1)):
    try:
        coll = get_chroma_collection()
        docs = get_user_documents(coll, user_id)
        total_chunks = coll.count()
        return {
            "status": "healthy",
            "app": "DocChat",
            "model": MODEL_NAME,
            "embedder": EMBEDDER_NAME,
            "user_id": user_id,
            "user_document_count": len(docs),
            "user_documents": docs,
            "total_chunks_in_vault": total_chunks,
        }
    except Exception as exc:
        logger.error("Health check error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(exc)},
        )


# ── Document Management ─────────────────────────────────────────────────────
@app.get("/api/documents")
def list_documents(user_id: int = Query(1)):
    try:
        coll = get_chroma_collection()
        docs = get_user_documents(coll, user_id)
        return {"documents": docs, "count": len(docs), "user_id": user_id}
    except Exception as exc:
        logger.error("List documents error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    user_id: int = Query(1),
):
    try:
        coll = get_chroma_collection()
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # Wrap in BytesIO with .name for extract_text
        file_obj = io.BytesIO(content)
        file_obj.name = file.filename

        logger.info("Processing upload '%s' for user %d (%d bytes)", file.filename, user_id, len(content))
        text = extract_text(file_obj)
        if not text or not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract readable text from document.")

        chunks = chunk_text(text, file.filename)
        if not chunks:
            raise HTTPException(status_code=400, detail="Document text was too short to produce chunks.")

        add_chunks(coll, chunks, user_id=user_id)
        return {
            "success": True,
            "filename": file.filename,
            "chunk_count": len(chunks),
            "char_count": len(text),
            "message": f"Successfully indexed {file.filename} ({len(chunks)} chunks).",
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to process upload: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(exc)}")


@app.delete("/api/documents/{filename}")
def delete_document(filename: str, user_id: int = Query(1)):
    try:
        coll = get_chroma_collection()
        ok = delete_document_chunks(coll, filename, user_id)
        return {"success": ok, "deleted": filename, "user_id": user_id}
    except Exception as exc:
        logger.error("Delete document error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/documents/clear")
def clear_vault(user_id: int = Query(1)):
    try:
        coll = get_chroma_collection()
        clear_user_vault(coll, user_id)
        return {"success": True, "message": "Vault cleared.", "user_id": user_id}
    except Exception as exc:
        logger.error("Clear vault error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions?", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?(the\s+)?(above|prior|previous)", re.IGNORECASE),
    re.compile(r"you\s+are\s+(now|a|an)\s+", re.IGNORECASE),
    re.compile(r"system\s*(prompt|instruction|role)", re.IGNORECASE),
    re.compile(r"override\s+(your|all)\s+", re.IGNORECASE),
    re.compile(r"act\s+as\s+(a\s+)?(?:dan|jailbreak|unfiltered|evil)", re.IGNORECASE),
    re.compile(r"pretend\s+(you\s+)?(?:are|to\s+be)", re.IGNORECASE),
    re.compile(r"new\s+instruction[s]?\s*:", re.IGNORECASE),
    re.compile(r"\[INST\]|\[/INST\]|<<SYS>>|</SYS>", re.IGNORECASE),
    re.compile(r"<\|im_start\|>|<\|im_end\|>", re.IGNORECASE),
]


def check_prompt_injection(text: str) -> Optional[str]:
    for pattern in PROMPT_INJECTION_PATTERNS:
        if pattern.search(text):
            return "Your message contains instructions attempting to alter AI safety rules. These have been blocked."
    return None


# ── RAG Chat Streaming Endpoint ──────────────────────────────────────────────
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    question = request.question.strip()
    user_id = request.user_id
    mode = request.mode  # "Simple" or "Thinking"
    coll = get_chroma_collection()

    async def event_generator() -> AsyncGenerator[str, None]:
        # 0. Prompt Injection Guard
        injection_warning = check_prompt_injection(question)
        if injection_warning:
            logger.warning("Prompt injection blocked: %s", question[:100])
            yield f"data: {json.dumps({'type': 'token', 'delta': injection_warning})}\n\n"
            yield f"data: {json.dumps({'type': 'metadata', 'sources': [], 'quotes': [], 'groundedness_score': 0, 'hallucination_score': 100, 'eval_reason': 'Prompt injection detected.', 'followups': []})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # 1. Routing / Context Retrieval
        context = ""
        sources = []
        quotes = []
        raw_chunks = []

        if mode == "Thinking":
            # Emit thinking events
            yield f"data: {json.dumps({'type': 'thinking', 'delta': 'Evaluating query with DocChat agentic pipeline...\\n'})}\n\n"
            await asyncio.sleep(0.01)

            try:
                route, retrieved_docs, results, fused_context = prepare_agentic_context(coll, question, user_id)
                if route == "direct":
                    yield f"data: {json.dumps({'type': 'thinking', 'delta': 'Direct conversation detected (no document retrieval needed).\\n'})}\n\n"
                    context = ""
                elif route == "refusal":
                    yield f"data: {json.dumps({'type': 'thinking', 'delta': 'No sufficiently grounded documents matched query in your vault.\\n'})}\n\n"
                    context = ""
                else:
                    context = fused_context
                    raw_chunks = retrieved_docs
                    # Extract sources from metadatas
                    metas = results.get("metadatas", [[]])[0] if results and results.get("metadatas") else []
                    for m in metas:
                        if isinstance(m, dict) and "source" in m and m["source"] not in sources:
                            sources.append(m["source"])
                    quotes = [c[:240].strip() + ("..." if len(c) > 240 else "") for c in retrieved_docs[:3]]
                    yield f"data: {json.dumps({'type': 'thinking', 'delta': f'Retrieved and verified {len(retrieved_docs)} grounded chunks across {len(sources)} source(s).\\n'})}\n\n"
            except Exception as e:
                logger.error("Agentic context preparation failed: %s", e)
                yield f"data: {json.dumps({'type': 'thinking', 'delta': f'Note: Retrieval fallback active ({str(e)}).\\n'})}\n\n"
                context = ""
        else:
            # Simple Mode
            yield f"data: {json.dumps({'type': 'thinking', 'delta': 'Querying ChromaDB vector vault (Simple RAG)...\\n'})}\n\n"
            try:
                results = query_collection(coll, question, user_id=user_id, top_k=TOP_K)
                raw_docs = results.get("documents", [[]])[0] if results.get("documents") else []
                metas = results.get("metadatas", [[]])[0] if results.get("metadatas") else []
                passed, score = passes_gate(results)
                if passed and raw_docs:
                    raw_chunks = raw_docs
                    context = "\n\n---\n\n".join(raw_docs)
                    for m in metas:
                        if isinstance(m, dict) and "source" in m and m["source"] not in sources:
                            sources.append(m["source"])
                    quotes = [c[:240].strip() + ("..." if len(c) > 240 else "") for c in raw_docs[:3]]
                    yield f"data: {json.dumps({'type': 'thinking', 'delta': f'Grounded match passed gate (score: {score:.2f}).\\n'})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'thinking', 'delta': 'No document chunks passed similarity threshold in vault.\\n'})}\n\n"
                    context = ""
            except Exception as e:
                logger.error("Simple retrieval failed: %s", e)
                context = ""

        # 2. Build Prompt Messages
        system_prompt = (
            "You are DocChat, an expert document intelligence assistant that strictly answers based on uploaded documents.\n\n"
            "STRICT RULES:\n"
            "1. Answer using ONLY the facts and context provided in the document excerpts below.\n"
            "2. If the context does not contain the answer, state honestly: 'I cannot find this information in the uploaded documents.'\n"
            "3. Do not make assumptions or extrapolate beyond what is documented.\n"
            "4. Format your answer with clear markdown headings, concise bullet points, and high readability.\n\n"
        )
        if context:
            system_prompt += f"--- BEGIN UPLOADED DOCUMENT CONTEXT ---\n{context}\n--- END UPLOADED DOCUMENT CONTEXT ---\n"
        else:
            system_prompt += "No document context is currently available. Respond politely informing the user or answer general conversational greetings if applicable.\n"

        prompt_messages = [{"role": "system", "content": system_prompt}]
        if request.messages:
            # Append prior conversation context (limiting to recent)
            for m in request.messages[-6:]:
                if m.get("content") and m.get("role") in ("user", "assistant"):
                    prompt_messages.append({"role": m["role"], "content": m["content"]})
        else:
            prompt_messages.append({"role": "user", "content": question})

        # 3. Stream Response Tokens
        full_answer = ""
        try:
            for token in stream_response(prompt_messages, temperature=TEMPERATURE_ANSWER):
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'delta': token})}\n\n"
                await asyncio.sleep(0.005)
        except Exception as exc:
            logger.error("Streaming error: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
            return

        # 4. Hallucination Evaluation & Grounding Metrics
        grounding_score = 0.0
        hallucination_score = 0
        eval_reason = "No context to evaluate."
        hallucinated_spans = []
        unsupported_claims = []
        highlighted_answer = ""
        followups = []

        if context and full_answer:
            try:
                grounding_score = compute_grounding_score(question, raw_chunks)
            except Exception as e:
                logger.warning("Grounding score error: %s", e)

            try:
                audit = evaluate_hallucination(full_answer, context)
                hallucination_score = audit.get("hallucination_score", 0)
                eval_reason = audit.get("reasoning", "")
                hallucinated_spans = audit.get("hallucinated_spans", [])
                unsupported_claims = audit.get("unsupported_claims", [])
                highlighted_answer = audit.get("highlighted_answer", "")
            except Exception as e:
                logger.warning("Hallucination audit error: %s", e)

            try:
                followups = generate_followups(full_answer, context)
            except Exception as e:
                logger.warning("Followup generation error: %s", e)

        # 5. Emit Metadata Event
        metadata_payload = {
            "type": "metadata",
            "sources": sources,
            "quotes": quotes,
            "groundedness_score": round(100 - hallucination_score, 1) if context else 100,
            "hallucination_score": hallucination_score,
            "cosine_score": grounding_score,
            "eval_reason": eval_reason,
            "followups": followups,
            "rag_mode": mode,
            "vault_docs_used": len(sources),
            "hallucinated_spans": hallucinated_spans,
            "unsupported_claims": unsupported_claims,
            "highlighted_answer": highlighted_answer,
        }
        yield f"data: {json.dumps(metadata_payload)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
