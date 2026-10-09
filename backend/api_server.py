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

import collections
import time
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
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
from backend.auth import (
    authenticate_user,
    create_user_session,
    get_all_users,
    get_user_by_id,
    get_user_from_session,
    register_user,
    revoke_user_session,
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

# ── Production-Grade CORS Configuration ──────────────────────────────────────
ALLOWED_ORIGINS_RAW = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://localhost:8000,http://localhost:8001"
)
ALLOWED_ORIGINS = [orig.strip() for orig in ALLOWED_ORIGINS_RAW.split(",") if orig.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PUT", "OPTIONS"],
    allow_headers=["*"],
)


# ── Sliding-Window Rate Limiting ─────────────────────────────────────────────
class SlidingWindowRateLimiter:
    """In-memory thread-safe sliding window rate limiter for DDoS & brute force defense."""
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.history: dict[str, collections.deque] = collections.defaultdict(collections.deque)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        dq = self.history[key]
        while dq and dq[0] <= now - self.window_seconds:
            dq.popleft()
        if len(dq) >= self.max_requests:
            return False
        dq.append(now)
        return True


auth_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=60.0)      # 10 auth attempts/min
chat_limiter = SlidingWindowRateLimiter(max_requests=60, window_seconds=60.0)      # 60 chat msgs/min
upload_limiter = SlidingWindowRateLimiter(max_requests=25, window_seconds=60.0)    # 25 file uploads/min


def get_client_ip(req: Request) -> str:
    """Extract real client IP considering reverse proxy headers."""
    forwarded = req.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return req.client.host if req.client else "unknown_ip"


# ── Authentication & Authorization Dependency (IDOR/BOLA Protection) ────────
security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    req: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    token: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
) -> dict:
    """Enforce session validation, extract authenticated user, or handle dev fallback."""
    session_token = None
    if auth and auth.credentials:
        session_token = auth.credentials.strip()
    elif token:
        session_token = token.strip()

    if session_token:
        user = get_user_from_session(session_token)
        if user:
            user_dict = dict(user)
            user_dict["isAuthenticated"] = True
            return user_dict
        raise HTTPException(
            status_code=401,
            detail="Session has expired or token is invalid. Please sign in again.",
        )

    # In production environments, require authentication
    is_prod = (
        os.getenv("ENVIRONMENT", "development").lower() == "production"
        or os.getenv("REQUIRE_AUTH", "false").lower() in ("true", "1", "yes")
    )
    if is_prod:
        raise HTTPException(status_code=401, detail="Authentication token required.")

    # Development / local fallback
    target_id = user_id if user_id is not None else 1
    existing = get_user_by_id(target_id)
    if existing:
        user_dict = dict(existing)
        user_dict["isAuthenticated"] = False
        return user_dict
    return {"id": target_id, "username": f"user_{target_id}", "email": f"user{target_id}@local.dev", "role": "user", "isAuthenticated": False}


def resolve_user_id(current_user: dict, requested_user_id: Optional[int]) -> int:
    """Enforce authenticated session ownership, while permitting dev/guest/admin requested_user_id."""
    if current_user.get("isAuthenticated") and current_user.get("role") != "admin":
        return current_user["id"]
    if requested_user_id is not None:
        return requested_user_id
    return current_user["id"]


# ── File Upload Security Validation ──────────────────────────────────────────
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx", ".csv", ".json", ".log"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB max file size


def sanitize_filename(raw_filename: str) -> str:
    """Sanitize filename to prevent directory traversal and injection attacks."""
    clean_name = os.path.basename(raw_filename)
    clean_name = re.sub(r"[^a-zA-Z0-9_\-\. ]", "_", clean_name).strip()
    return clean_name or "document.txt"


# Persistent ChromaDB collection handle
_collection = None


def get_chroma_collection():
    global _collection
    if _collection is None:
        _collection = get_collection()
    return _collection


class ChatRequest(BaseModel):
    question: str
    user_id: Optional[int] = None
    mode: str = "Thinking"  # "Simple" | "Thinking"
    messages: Optional[List[dict]] = None


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LogoutRequest(BaseModel):
    token: Optional[str] = None


# ── Authentication Endpoints ──────────────────────────────────────────────────
# ── Authentication Endpoints ──────────────────────────────────────────────────
@app.post("/api/auth/login")
def api_login(req_body: LoginRequest, req: Request):
    ip = get_client_ip(req)
    if not auth_limiter.is_allowed(ip):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait a minute.")

    success, msg, user = authenticate_user(req_body.username_or_email, req_body.password)
    if not success or not user:
        raise HTTPException(status_code=401, detail=msg)
    token = create_user_session(user["id"])
    return {
        "success": True,
        "message": msg,
        "token": token,
        "user": user,
    }


@app.post("/api/auth/register")
def api_register(req_body: RegisterRequest, req: Request):
    ip = get_client_ip(req)
    if not auth_limiter.is_allowed(ip):
        raise HTTPException(status_code=429, detail="Too many registration attempts. Please wait a minute.")

    success, msg, user = register_user(req_body.username, req_body.email, req_body.password)
    if not success or not user:
        raise HTTPException(status_code=400, detail=msg)
    token = create_user_session(user["id"])
    return {
        "success": True,
        "message": msg,
        "token": token,
        "user": user,
    }


@app.post("/api/auth/logout")
def api_logout(req_body: Optional[LogoutRequest] = None, token: Optional[str] = Query(None)):
    tok = (req_body.token if req_body else None) or token
    if tok:
        revoke_user_session(tok)
    return {"success": True, "message": "Signed out successfully."}


@app.get("/api/auth/me")
def api_me(current_user: dict = Depends(get_current_user)):
    return {"authenticated": True, "user": current_user}


@app.get("/api/auth/users")
def api_users(current_user: dict = Depends(get_current_user)):
    # Accessible to authenticated users for multi-account switching
    users = get_all_users()
    return {"users": users, "count": len(users)}


# ── System Health & Stats ────────────────────────────────────────────────────
@app.get("/api/health")
def health(
    current_user: dict = Depends(get_current_user),
    user_id: Optional[int] = Query(None),
):
    eff_id = resolve_user_id(current_user, user_id)
    try:
        coll = get_chroma_collection()
        docs = get_user_documents(coll, eff_id)
        total_chunks = coll.count()
        return {
            "status": "healthy",
            "app": "DocChat",
            "model": MODEL_NAME,
            "embedder": EMBEDDER_NAME,
            "user_id": eff_id,
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


# ── Document Management (Protected with User Isolation) ─────────────────────
@app.get("/api/documents")
def list_documents(
    current_user: dict = Depends(get_current_user),
    user_id: Optional[int] = Query(None),
):
    eff_id = resolve_user_id(current_user, user_id)
    try:
        coll = get_chroma_collection()
        docs = get_user_documents(coll, eff_id)
        return {"documents": docs, "count": len(docs), "user_id": eff_id}
    except Exception as exc:
        logger.error("List documents error for user %s: %s", eff_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/documents/upload")
async def upload_document(
    req: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    user_id: Optional[int] = Query(None),
):
    ip = get_client_ip(req)
    if not upload_limiter.is_allowed(ip):
        raise HTTPException(status_code=429, detail="Upload rate limit exceeded. Please wait a minute.")

    eff_id = resolve_user_id(current_user, user_id)
    raw_name = file.filename or "uploaded_file.txt"
    safe_name = sanitize_filename(raw_name)

    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '{ext}' not allowed. Permitted: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    try:
        coll = get_chroma_collection()
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File exceeds maximum allowed size ({MAX_UPLOAD_BYTES // (1024 * 1024)}MB).",
            )

        # Wrap in BytesIO with sanitized safe name
        file_obj = io.BytesIO(content)
        file_obj.name = safe_name

        logger.info("Processing upload '%s' for user %s (%d bytes)", safe_name, eff_id, len(content))
        text = extract_text(file_obj)
        if not text or not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract readable text from document.")

        chunks = chunk_text(text, safe_name)
        if not chunks:
            raise HTTPException(status_code=400, detail="Document text was too short to produce chunks.")

        add_chunks(coll, chunks, user_id=eff_id)
        return {
            "success": True,
            "filename": safe_name,
            "chunk_count": len(chunks),
            "char_count": len(text),
            "user_id": eff_id,
            "message": f"Successfully indexed {safe_name} ({len(chunks)} chunks).",
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to process upload for user %s: %s", eff_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(exc)}")


@app.delete("/api/documents/{filename}")
def delete_document(
    filename: str,
    current_user: dict = Depends(get_current_user),
    user_id: Optional[int] = Query(None),
):
    eff_id = resolve_user_id(current_user, user_id)
    safe_name = sanitize_filename(filename)
    try:
        coll = get_chroma_collection()
        ok = delete_document_chunks(coll, safe_name, eff_id)
        return {"success": ok, "deleted": safe_name, "user_id": eff_id}
    except Exception as exc:
        logger.error("Delete document error for user %s: %s", eff_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/documents/clear")
def clear_vault(
    current_user: dict = Depends(get_current_user),
    user_id: Optional[int] = Query(None),
):
    eff_id = resolve_user_id(current_user, user_id)
    try:
        coll = get_chroma_collection()
        clear_user_vault(coll, eff_id)
        return {"success": True, "message": "Vault cleared.", "user_id": eff_id}
    except Exception as exc:
        logger.error("Clear vault error for user %s: %s", eff_id, exc)
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


# ── RAG Chat Streaming Endpoint (Rate-limited & Authenticated) ───────────────
@app.post("/api/chat/stream")
async def chat_stream(
    request: ChatRequest,
    req: Request,
    current_user: dict = Depends(get_current_user),
):
    ip = get_client_ip(req)
    if not chat_limiter.is_allowed(ip):
        raise HTTPException(status_code=429, detail="Chat rate limit reached. Please wait a minute.")

    question = request.question.strip()
    eff_user_id = resolve_user_id(current_user, request.user_id)

    mode = request.mode  # "Simple" or "Thinking"
    coll = get_chroma_collection()

    # Vault Documents Check & Non-destructive Guest Fallback
    user_vault_docs = get_user_documents(coll, eff_user_id)
    if not user_vault_docs and eff_user_id in (0, 1):
        alt_id = 1 if eff_user_id == 0 else 0
        alt_docs = get_user_documents(coll, alt_id)
        if alt_docs:
            eff_user_id = alt_id
            user_vault_docs = alt_docs
            logger.info("Bridged active user %d to vault user %d with %d docs", eff_user_id, alt_id, len(alt_docs))

    async def event_generator() -> AsyncGenerator[str, None]:
        # 0. Prompt Injection Guard
        injection_warning = check_prompt_injection(question)
        if injection_warning:
            logger.warning("Prompt injection blocked: %s", question[:100])
            yield f"data: {json.dumps({'type': 'token', 'delta': injection_warning})}\n\n"
            yield f"data: {json.dumps({'type': 'metadata', 'sources': [], 'quotes': [], 'groundedness_score': 0, 'hallucination_score': 100, 'eval_reason': 'Prompt injection detected.', 'followups': []})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # 1. Vault Documents Validation
        if not user_vault_docs:
            yield f"data: {json.dumps({'type': 'thinking', 'delta': 'Checking document vault...\\n'})}\n\n"
            yield f"data: {json.dumps({'type': 'token', 'delta': '⚠️ **Your Document Vault is empty.**\\n\\nPlease upload a document (.pdf, .docx, or .txt) using the **Document Vault** sidebar before asking questions about it.'})}\n\n"
            yield f"data: {json.dumps({'type': 'metadata', 'sources': [], 'quotes': [], 'groundedness_score': 0, 'hallucination_score': 0, 'eval_reason': 'Vault is empty.', 'followups': []})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # 2. Routing / Context Retrieval
        context = ""
        sources = []
        quotes = []
        raw_chunks = []

        if mode == "Thinking":
            # Emit thinking events
            yield f"data: {json.dumps({'type': 'thinking', 'delta': 'Evaluating query with DocChat agentic pipeline...\\n'})}\n\n"
            await asyncio.sleep(0.01)

            try:
                route, retrieved_docs, results, fused_context = prepare_agentic_context(coll, question, eff_user_id)
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
            # Simple Mode — Direct similarity retrieval from ChromaDB
            yield f"data: {json.dumps({'type': 'thinking', 'delta': 'Querying ChromaDB vector vault (Simple RAG)...\\n'})}\n\n"
            try:
                results = query_collection(coll, question, user_id=eff_user_id, top_k=TOP_K)
                raw_docs = results.get("documents", [[]])[0] if results.get("documents") else []
                metas = results.get("metadatas", [[]])[0] if results.get("metadatas") else []
                passed, score = passes_gate(results)

                if (passed or score >= 0.08) and raw_docs:
                    raw_chunks = raw_docs
                    context = "\n\n---\n\n".join(raw_docs)
                    for m in metas:
                        if isinstance(m, dict) and "source" in m and m["source"] not in sources:
                            sources.append(m["source"])
                    quotes = [c[:240].strip() + ("..." if len(c) > 240 else "") for c in raw_docs[:3]]
                    yield f"data: {json.dumps({'type': 'thinking', 'delta': f'Grounded match passed gate (score: {score:.2f}) across {len(sources)} source(s).\\n'})}\n\n"
                elif raw_docs:
                    # Resilient fallback: top chunks from user's vault
                    raw_chunks = raw_docs[:2]
                    context = "\n\n---\n\n".join(raw_chunks)
                    for m in metas[:2]:
                        if isinstance(m, dict) and "source" in m and m["source"] not in sources:
                            sources.append(m["source"])
                    quotes = [c[:240].strip() + ("..." if len(c) > 240 else "") for c in raw_chunks]
                    yield f"data: {json.dumps({'type': 'thinking', 'delta': f'Using closest matching document excerpts from vault (score: {score:.2f}).\\n'})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'thinking', 'delta': 'No document chunks matched this question in your vault.\\n'})}\n\n"
                    context = ""
            except Exception as e:
                logger.error("Simple retrieval failed: %s", e)
                context = ""

        # 3. Build Prompt Messages with Strict Grounding Guard
        system_prompt = (
            "You are DocChat, an expert document intelligence assistant that strictly answers based on uploaded documents.\n\n"
            "STRICT RULES:\n"
            "1. Answer using ONLY the facts and context provided in the document excerpts below.\n"
            "2. If the document context does not contain the answer, state honestly: 'I cannot find this information in your uploaded documents.'\n"
            "3. Do not make assumptions, extrapolate, or bring in outside information beyond what is in your document vault.\n"
            "4. Format your answer with clear markdown headings, concise bullet points, and high readability.\n\n"
        )
        if context:
            system_prompt += f"--- BEGIN UPLOADED DOCUMENT CONTEXT ---\n{context}\n--- END UPLOADED DOCUMENT CONTEXT ---\n"
        else:
            system_prompt += (
                f"The user has uploaded documents ({', '.join(user_vault_docs)}), but none of them contain information answering this question.\n"
                "State clearly that the answer cannot be found in their uploaded documents, and suggest they check the relevant document or rephrase.\n"
                "DO NOT attempt to answer from outside knowledge."
            )

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
