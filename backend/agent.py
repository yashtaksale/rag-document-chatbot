import json
import logging
import os
import re
import threading
import time
from collections import deque
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

logger = logging.getLogger("docchat.agent")

MAX_QUESTION_LENGTH = 4000

# ── Lazy-Initialized Groq Client (Zero Module-Level Leak Risk) ────────────────
_client_lock = threading.Lock()
_client_instance: Groq | None = None


def _get_groq_client() -> Groq:
    """Lazy initialize and return thread-safe singleton Groq client."""
    global _client_instance
    if _client_instance is None:
        with _client_lock:
            if _client_instance is None:
                api_key = os.getenv("GROQ_API_KEY")
                if not api_key:
                    raise ValueError("GROQ_API_KEY environment variable is not set or empty.")
                _client_instance = Groq(api_key=api_key)
    return _client_instance


# ── Resilient Bounded Rate Limiter (deque + monotonic time) ───────────────────
_query_log: deque[float] = deque(maxlen=MAX_QUERIES_PER_MINUTE * 2)
_query_lock = threading.Lock()


def _check_rate_limit() -> None:
    """Allow up to MAX_QUERIES_PER_MINUTE queries per minute using sliding-window monotonic timestamps."""
    now = time.monotonic()
    cutoff = now - 60.0
    with _query_lock:
        while _query_log and _query_log[0] <= cutoff:
            _query_log.popleft()
        if len(_query_log) >= MAX_QUERIES_PER_MINUTE:
            oldest = _query_log[0]
            wait_time = max(0.05, (oldest + 60.05) - now)
            if wait_time <= 3.0:
                time.sleep(wait_time)
                now = time.monotonic()
                cutoff = now - 60.0
                while _query_log and _query_log[0] <= cutoff:
                    _query_log.popleft()
            else:
                raise RuntimeError(
                    f"Rate limit exceeded: {MAX_QUERIES_PER_MINUTE} queries per minute allowed. "
                    "Please wait a moment before trying again."
                )
        _query_log.append(time.monotonic())


def _clean_json_loads(raw: str) -> dict:
    """Robustly parse JSON response from LLM, stripping markdown fences and handling multiple objects."""
    if not raw or not raw.strip():
        return {}
    clean = raw.strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```(?:json)?\s*", "", clean)
        clean = re.sub(r"\s*```$", "", clean)
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # Non-greedy extraction to find valid JSON blocks
        matches = re.findall(r"\{.*?\}", clean, re.DOTALL)
        for m in matches:
            try:
                return json.loads(m)
            except json.JSONDecodeError:
                continue
        # Fallback for nested JSON objects
        greedy_match = re.search(r"\{.*\}", clean, re.DOTALL)
        if greedy_match:
            try:
                return json.loads(greedy_match.group(0))
            except json.JSONDecodeError:
                pass
        raise


def _groq_call(**kwargs) -> dict:
    """Make a Groq API call with timeout, rate limiting, and 429 transient retry."""
    kwargs.setdefault("model", MODEL_NAME)
    kwargs.setdefault("timeout", API_TIMEOUT)
    _check_rate_limit()
    client = _get_groq_client()
    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(**kwargs)
            return response
        except Exception as exc:
            err_str = str(exc).lower()
            if ("rate limit" in err_str or "429" in err_str) and attempt < max_retries:
                logger.warning("Groq rate limit hit, backing off 2s (attempt %d/%d)", attempt + 1, max_retries)
                time.sleep(2.0)
                continue
            logger.error("Groq API call failed: %s", exc)
            raise


def _route_query(question: str) -> str:
    """Route input: only pure greetings go to direct, all questions go to retrieve."""
    greetings = {
        "hi", "hello", "hey", "greetings", "good morning", "good afternoon",
        "good evening", "how are you", "who are you", "what can you do",
        "thanks", "thank you", "bye", "goodbye"
    }
    q_norm = question.strip().lower().rstrip("!?. ")
    if q_norm in greetings:
        return "direct"

    prompt = (
        "You are a query router for a document retrieval assistant.\n"
        "If the user is asking any question, looking for information, or querying topics/entities, choose 'retrieve'.\n"
        "Only choose 'direct' if the user is strictly saying a greeting or social pleasantry.\n"
        'Respond ONLY with valid JSON: {"route": "retrieve" | "direct"}\n\n'
        f"Input: {question}"
    )
    try:
        res = _groq_call(
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=TEMPERATURE_ROUTING,
        )
        data = _clean_json_loads(res.choices[0].message.content)
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
            "Determine if the following document passage contains ANY information, facts, or context "
            "relevant or helpful to answering the question.\n"
            'Respond ONLY with valid JSON: {"relevant": true | false}\n\n'
            f"Question: {question}\nPassage: {chunk}"
        )
        try:
            res = _groq_call(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=TEMPERATURE_GRADING,
            )
            data = _clean_json_loads(res.choices[0].message.content)
            return chunk, data.get("relevant") is True
        except Exception as exc:
            logger.warning("Chunk grading failed for a chunk: %s", exc)
            return chunk, True  # On grader timeout/failure, preserve chunk for safety

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
    question = question[:MAX_QUESTION_LENGTH].strip()
    call_count = 0

    route = _route_query(question)
    call_count += 1
    if route == "direct":
        return "direct", [], {}, ""

    results = query_collection(collection, question, user_id=user_id, top_k=TOP_K)
    raw_docs = results.get("documents", [[]])[0] if results.get("documents") else []
    relevant_docs = _grade_chunks(question, raw_docs)
    call_count += 1

    if not relevant_docs and raw_docs:
        rewritten = _rewrite_query(question)
        results = query_collection(collection, rewritten, user_id=user_id, top_k=TOP_K)
        raw_docs = results.get("documents", [[]])[0] if results.get("documents") else []
        relevant_docs = _grade_chunks(rewritten, raw_docs)

    # Fallback to vector search raw_docs if grading was overly conservative but chunks exist
    if not relevant_docs and raw_docs:
        from backend.retrieval_gate import passes_gate
        passed, score = passes_gate(results)
        if passed:
            relevant_docs = raw_docs[:2]
            logger.info("Retrieved %d chunks via gate fallback (score: %.3f)", len(relevant_docs), score)

    if call_count > AGENTIC_CALL_THRESHOLD:
        logger.info(
            "Agentic pipeline used %d API calls for this query (threshold: %d)",
            call_count,
            AGENTIC_CALL_THRESHOLD,
        )

    if not relevant_docs:
        return "refusal", [], results, ""

    # Open Knowledge Filtering & Fusion (OKF) Layer
    from backend.okf import fuse_and_filter_knowledge
    metas = results.get("metadatas", [[]])[0] if results and results.get("metadatas") else []
    okf_result = fuse_and_filter_knowledge(question, relevant_docs, metas)
    context = okf_result.get("fused_context") or "\n\n---\n\n".join(relevant_docs)

    return "retrieved", okf_result.get("fused_documents", relevant_docs), results, context


def stream_response(messages: list[dict], temperature: float = TEMPERATURE_ANSWER) -> Generator[str, None, None]:
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
        data = _clean_json_loads(res.choices[0].message.content)
        return data.get("questions", [])[:3]
    except Exception as exc:
        logger.warning("Follow-up generation failed: %s", exc)
        return []


def highlight_hallucinations(answer: str, spans: list[str]) -> str:
    """Wraps hallucinated spans in the answer with warning highlight mark tags."""
    if not spans or not answer:
        return answer

    intervals = []
    lower_answer = answer.lower()
    for span in spans:
        span_str = span.strip()
        if not span_str or len(span_str) < 2:
            continue
        lower_span = span_str.lower()
        start = 0
        while True:
            idx = lower_answer.find(lower_span, start)
            if idx == -1:
                break
            intervals.append((idx, idx + len(span_str)))
            start = idx + 1

    if not intervals:
        return answer

    intervals.sort(key=lambda x: (x[0], -x[1]))
    merged = []
    for cur in intervals:
        if not merged:
            merged.append(cur)
        else:
            prev_start, prev_end = merged[-1]
            if cur[0] <= prev_end:
                merged[-1] = (prev_start, max(prev_end, cur[1]))
            else:
                merged.append(cur)

    result = []
    last_idx = 0
    for start, end in merged:
        result.append(answer[last_idx:start])
        marked_text = answer[start:end]
        result.append(
            f'<mark class="hallucination-highlight" title="Unsupported by document context">{marked_text}</mark>'
        )
        last_idx = end
    result.append(answer[last_idx:])
    return "".join(result)


def evaluate_hallucination(answer: str, context: str) -> dict:
    """Evaluate whether the answer is grounded in the context using claim-level verification and span extraction."""
    if not context.strip():
        highlighted = f'<mark class="hallucination-highlight" title="No reference context">{answer}</mark>' if answer.strip() else ""
        return {
            "groundedness_score": 0,
            "hallucination_score": 100,
            "reasoning": "No reference context provided.",
            "hallucinated_spans": [answer] if answer.strip() else [],
            "unsupported_claims": ["No reference context provided to verify claims."],
            "supported_claims": [],
            "highlighted_answer": highlighted,
        }

    audit_prompt = (
        "You are a strict hallucination verification auditor for a document retrieval system.\n"
        "Compare the provided ANSWER against the reference CONTEXT.\n\n"
        "TASK:\n"
        "1. Extract all factual claims made in the ANSWER.\n"
        "2. For each claim, check if it is directly supported by the CONTEXT.\n"
        "3. Identify all statements, numbers, names, or phrases in the ANSWER that are NOT supported by or contradict the CONTEXT (hallucinations).\n"
        "4. For each hallucinated/unsupported statement, identify the EXACT verbatim text phrase from the ANSWER so it can be highlighted.\n\n"
        "Respond ONLY with a valid JSON object in this exact schema:\n"
        "{\n"
        '  "groundedness_score": <integer 0 to 100>,\n'
        '  "hallucination_score": <integer 0 to 100>,\n'
        '  "reasoning": "<concise explanation of audit>",\n'
        '  "hallucinated_spans": ["exact verbatim phrase from answer"],\n'
        '  "unsupported_claims": ["description of unsupported claim"],\n'
        '  "supported_claims": ["description of supported claim"]\n'
        "}\n\n"
        f"CONTEXT:\n{context}\n\n"
        f"ANSWER:\n{answer}"
    )

    try:
        res = _groq_call(
            messages=[{"role": "user", "content": audit_prompt}],
            response_format={"type": "json_object"},
            temperature=TEMPERATURE_EVAL,
        )
        data = _clean_json_loads(res.choices[0].message.content)
        g_score = int(data.get("groundedness_score", 100))
        h_score = int(data.get("hallucination_score", 100 - g_score))
        reasoning = data.get("reasoning", "Audit complete.")
        hallucinated_spans = data.get("hallucinated_spans", [])
        if not isinstance(hallucinated_spans, list):
            hallucinated_spans = []
        unsupported_claims = data.get("unsupported_claims", [])
        if not isinstance(unsupported_claims, list):
            unsupported_claims = []
        supported_claims = data.get("supported_claims", [])
        if not isinstance(supported_claims, list):
            supported_claims = []

        g_score = max(0, min(100, g_score))
        h_score = max(0, min(100, h_score))
        highlighted = highlight_hallucinations(answer, hallucinated_spans)

        return {
            "groundedness_score": g_score,
            "hallucination_score": h_score,
            "reasoning": reasoning,
            "hallucinated_spans": hallucinated_spans,
            "unsupported_claims": unsupported_claims,
            "supported_claims": supported_claims,
            "highlighted_answer": highlighted,
        }
    except Exception as exc:
        logger.warning("Single-pass hallucination audit failed (%s), running fallback...", exc)

    # Fallback to claim-level loop
    claim_prompt = (
        "Extract every distinct factual claim from the following answer. "
        'Respond ONLY with a valid JSON object in this format: {"claims": ["claim 1", "claim 2"]}\n\n'
        f"ANSWER:\n{answer}"
    )
    try:
        res = _groq_call(
            messages=[{"role": "user", "content": claim_prompt}],
            response_format={"type": "json_object"},
            temperature=TEMPERATURE_EVAL,
        )
        claims_data = _clean_json_loads(res.choices[0].message.content)
        claims = claims_data.get("claims", [])
        if not isinstance(claims, list) or not claims:
            claims = [answer]
    except Exception:
        claims = [answer]

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
            data = _clean_json_loads(res.choices[0].message.content)
            return claim, data.get("supported") is True
        except Exception as err:
            logger.warning("Claim verification failed for '%s': %s", claim[:40], err)
            return claim, False

    supported_count = 0
    unsupported = []
    total = len(claims)
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_verify_claim, c): c for c in claims}
        for future in as_completed(futures):
            claim_text, is_supported = future.result()
            if is_supported:
                supported_count += 1
            else:
                unsupported.append(claim_text)

    if total == 0:
        return {
            "groundedness_score": 100,
            "hallucination_score": 0,
            "reasoning": "No verifiable factual claims detected in the response.",
            "hallucinated_spans": [],
            "unsupported_claims": [],
            "supported_claims": [],
            "highlighted_answer": answer,
        }

    g_score = round((supported_count / total) * 100)
    h_score = 100 - g_score
    highlighted = highlight_hallucinations(answer, unsupported)

    return {
        "groundedness_score": max(0, min(100, g_score)),
        "hallucination_score": max(0, min(100, h_score)),
        "reasoning": f"{supported_count}/{total} claims verified against source context.",
        "hallucinated_spans": unsupported,
        "unsupported_claims": unsupported,
        "supported_claims": [],
        "highlighted_answer": highlighted,
    }
