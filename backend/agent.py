import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Generator
from dotenv import load_dotenv
from groq import Groq

from backend.config import (
    AGENTIC_CALL_THRESHOLD,
    API_TIMEOUT,
    MAX_QUERIES_PER_MINUTE,
    MODEL_NAME,
    TEMPERATURE_ANSWER,
    TEMPERATURE_DIRECT,
    TEMPERATURE_EVAL,
    TEMPERATURE_FOLLOWUPS,
    TEMPERATURE_GRADING,
    TEMPERATURE_REWRITE,
    TEMPERATURE_ROUTING,
    TOP_K,
)
from backend.vector_store import query_collection

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

logger = logging.getLogger("docchat.agent")

# ── Simple per-session rate limiter (in-memory) ───────────────────────────────
_query_log: list[float] = []


def _check_rate_limit() -> None:
    """Allow up to MAX_QUERIES_PER_MINUTE queries per minute."""
    now = time.time()
    cutoff = now - 60
    global _query_log
    _query_log = [t for t in _query_log if t > cutoff]
    if len(_query_log) >= MAX_QUERIES_PER_MINUTE:
        raise RuntimeError(
            f"Rate limit exceeded: {MAX_QUERIES_PER_MINUTE} queries per minute allowed. "
            "Please wait a moment before trying again."
        )
    _query_log.append(now)


def _groq_call(**kwargs) -> dict:
    """Make a Groq API call with timeout and rate limiting."""
    kwargs.setdefault("model", MODEL_NAME)
    kwargs.setdefault("timeout", API_TIMEOUT)
    _check_rate_limit()
    try:
        response = client.chat.completions.create(**kwargs)
        return response
    except Exception as exc:
        logger.error("Groq API call failed: %s", exc)
        raise


def _route_query(question: str) -> str:
    prompt = (
        "You are an AI router. Determine if the user's input requires searching private documents "
        "or if it is general conversational chat/greeting.\n"
        'Respond ONLY with valid JSON: {"route": "retrieve" | "direct"}\n\n'
        f"Input: {question}"
    )
    try:
        res = _groq_call(
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=TEMPERATURE_ROUTING,
        )
        data = json.loads(res.choices[0].message.content)
        return data.get("route", "retrieve")
    except Exception as exc:
        logger.warning("Routing failed, defaulting to retrieve: %s", exc)
        return "retrieve"


def _grade_chunks(question: str, chunks: list[str]) -> list[str]:
    """Grade chunks for relevance using parallel API calls."""
    if not chunks:
        return []

    def _grade_single(chunk: str) -> tuple[str, bool]:
        prompt = (
            "Evaluate if the following excerpt contains facts useful to answer the question.\n"
            'Respond ONLY with valid JSON: {"relevant": true | false}\n\n'
            f"Question: {question}\nExcerpt: {chunk}"
        )
        try:
            res = _groq_call(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=TEMPERATURE_GRADING,
            )
            data = json.loads(res.choices[0].message.content)
            return chunk, data.get("relevant") is True
        except Exception as exc:
            logger.warning("Chunk grading failed for a chunk: %s", exc)
            return chunk, False  # reject on failure — don't feed noise to the model

    relevant = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_grade_single, c): c for c in chunks}
        for future in as_completed(futures):
            chunk, is_relevant = future.result()
            if is_relevant:
                relevant.append(chunk)
    return relevant


def _rewrite_query(question: str) -> str:
    prompt = (
        "Rewrite this user question into a dense, keyword-optimized semantic search query.\n"
        "Return ONLY the rewritten search string with no conversational filler.\n\n"
        f"User Query: {question}"
    )
    try:
        res = _groq_call(
            messages=[{"role": "user", "content": prompt}],
            temperature=TEMPERATURE_REWRITE,
        )
        return res.choices[0].message.content.strip()
    except Exception as exc:
        logger.warning("Query rewrite failed: %s", exc)
        return question


def prepare_agentic_context(collection, question: str, user_id: int):
    """Executes routing and context retrieval before answer streaming."""
    call_count = 0

    route = _route_query(question)
    call_count += 1
    if route == "direct":
        return "direct", [], {}, ""

    results = query_collection(collection, question, user_id=user_id, top_k=TOP_K)
    raw_docs = results.get("documents", [[]])[0] if results.get("documents") else []
    relevant_docs = _grade_chunks(question, raw_docs)
    call_count += 1  # routing + grading batch count as ~1 logical call

    if not relevant_docs:
        rewritten = _rewrite_query(question)
        results = query_collection(collection, rewritten, user_id=user_id, top_k=TOP_K)
        raw_docs = results.get("documents", [[]])[0] if results.get("documents") else []
        relevant_docs = _grade_chunks(rewritten, raw_docs)

    if call_count > AGENTIC_CALL_THRESHOLD:
        logger.info(
            "Agentic pipeline used %d API calls for this query (threshold: %d)",
            call_count,
            AGENTIC_CALL_THRESHOLD,
        )

    if not relevant_docs:
        return "refusal", [], results, ""

    context = "\n\n---\n\n".join(relevant_docs)
    return "retrieved", relevant_docs, results, context


def stream_response(messages: list[dict], temperature: float = TEMPERATURE_ANSWER) -> str:
    """Streams response chunks from Groq. Yields text deltas."""
    stream = _groq_call(
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


def generate_followups(answer: str, context: str) -> list[str]:
    """Generates 3 contextual follow-up questions."""
    if not context.strip():
        return []
    prompt = (
        "Based on the following answer and context, generate exactly 3 short follow-up questions "
        "the user might ask next.\n"
        'Respond ONLY with valid JSON in this format: {"questions": ["q1", "q2", "q3"]}\n\n'
        f"Context:\n{context[:1500]}\n\nAnswer:\n{answer}"
    )
    try:
        res = _groq_call(
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=TEMPERATURE_FOLLOWUPS,
        )
        data = json.loads(res.choices[0].message.content)
        return data.get("questions", [])[:3]
    except Exception as exc:
        logger.warning("Follow-up generation failed: %s", exc)
        return []


def evaluate_hallucination(answer: str, context: str) -> dict:
    """Evaluate whether the answer is grounded in the context using claim-level verification."""
    if not context.strip():
        return {
            "groundedness_score": 0,
            "hallucination_score": 100,
            "reasoning": "No reference context provided.",
        }

    # Extract individual claims from the answer first
    claim_prompt = (
        "Extract every distinct factual claim from the following answer. "
        "Return ONLY a JSON array of claim strings.\n\n"
        f"ANSWER:\n{answer}"
    )
    try:
        res = _groq_call(
            messages=[{"role": "user", "content": claim_prompt}],
            response_format={"type": "json_object"},
            temperature=TEMPERATURE_EVAL,
        )
        claims_data = json.loads(res.choices[0].message.content)
        claims = claims_data.get("claims", [])
        if not isinstance(claims, list) or not claims:
            # Fallback: treat the whole answer as one claim
            claims = [answer]
    except Exception:
        claims = [answer]

    # Verify each claim against context in parallel
    def _verify_claim(claim: str) -> tuple[str, bool]:
        verify_prompt = (
            'Does the following CLAIM have direct textual support in the CONTEXT? '
            'Respond ONLY with valid JSON: {"supported": true | false}\n\n'
            f"CONTEXT:\n{context}\n\nCLAIM:\n{claim}"
        )
        try:
            res = _groq_call(
                messages=[{"role": "user", "content": verify_prompt}],
                response_format={"type": "json_object"},
                temperature=TEMPERATURE_EVAL,
            )
            data = json.loads(res.choices[0].message.content)
            return claim, data.get("supported") is True
        except Exception:
            return claim, True  # default supported on error

    supported_count = 0
    total = len(claims)
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_verify_claim, c): c for c in claims}
        for future in as_completed(futures):
            _, is_supported = future.result()
            if is_supported:
                supported_count += 1

    if total == 0:
        total = 1
        supported_count = 1

    g_score = round((supported_count / total) * 100)
    h_score = 100 - g_score

    return {
        "groundedness_score": max(0, min(100, g_score)),
        "hallucination_score": max(0, min(100, h_score)),
        "reasoning": f"{supported_count}/{total} claims verified against source context.",
    }
