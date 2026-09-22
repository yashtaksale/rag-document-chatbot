"""DocChat — RAG chatbot with Simple and Agentic (Thinking) modes."""

import logging
import re
from typing import Optional

import streamlit as st

from backend.agent import (
    evaluate_hallucination,
    generate_followups,
    prepare_agentic_context,
    stream_response,
)
from backend.chunker import chunk_text
from backend.config import (
    AGENTIC_CALL_THRESHOLD,
    API_TIMEOUT,
    MODEL_NAME,
    TEMPERATURE_ANSWER,
    TOP_K,
)
from backend.conversations import (
    build_conversation,
    get_conversation,
    load_all,
    upsert_conversation,
)
from backend.file_processor import extract_text
from backend.vector_store import (
    add_chunks,
    clear_user_vault,
    delete_document_chunks,
    get_collection,
    get_user_documents,
    query_collection,
)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.handlers.RotatingFileHandler(
            "docchat.log", maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
        ),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("docchat")

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(page_title="DocChat", layout="wide")

# ── Injected CSS (branding + hamburger fix for mobile) ───────────────────────
st.markdown(
    """
<style>
    .stApp > header { display: none; }
    .main-title {
        font-size: 1.6rem; font-weight: 700; color: #0a0a0a;
        margin-bottom: 0.1rem;
    }
    .main-subtitle {
        font-size: 0.85rem; color: #6b7280; margin-bottom: 1.2rem;
    }
</style>
""",
    unsafe_allow_html=True,
)

USER_ID = 1


# ──  prompt-injection sanitizer ─────────────────────────────────────────────
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


def _check_prompt_injection(text: str) -> str | None:
    """Return a warning message if injection is detected, else None."""
    for pattern in PROMPT_INJECTION_PATTERNS:
        if pattern.search(text):
            return "Your message appears to contain instructions attempting to alter the AI's behavior. These have been blocked for your safety."
    return None


# ── ChromaDB collection (cached) ─────────────────────────────────────────────
@st.cache_resource
def load_collection():
    return get_collection()


coll = load_collection()

# ── Session state initialization ─────────────────────────────────────────────
if "messages" not in st.session_state:
    st.session_state.messages = []
if "processed_files" not in st.session_state:
    st.session_state.processed_files = set(get_user_documents(coll, USER_ID))
if "current_conversation_id" not in st.session_state:
    st.session_state.current_conversation_id = None
if "pending_prompt" not in st.session_state:
    st.session_state.pending_prompt = None
if "_conversation_dirty" not in st.session_state:
    st.session_state._conversation_dirty = False


# ── Conversation helpers ──────────────────────────────────────────────────────
def _needs_persist() -> bool:
    return st.session_state._conversation_dirty


def _mark_dirty() -> None:
    st.session_state._conversation_dirty = True


def _mark_clean() -> None:
    st.session_state._conversation_dirty = False


def persist_current_conversation() -> None:
    if not st.session_state.messages:
        return
    try:
        conversation = build_conversation(
            st.session_state.current_conversation_id,
            st.session_state.messages,
        )
        upsert_conversation(USER_ID, conversation)
        st.session_state.current_conversation_id = conversation["id"]
        _mark_clean()
        logger.info("Conversation %s persisted", conversation["id"][:8])
    except Exception as exc:
        logger.error("Failed to persist conversation: %s", exc)
        st.error("Failed to save conversation. Your messages are still in this session.")


def start_new_conversation() -> None:
    if _needs_persist():
        persist_current_conversation()
    st.session_state.current_conversation_id = None
    st.session_state.messages = []
    st.session_state.pending_prompt = None
    _mark_clean()


def open_conversation(conversation_id: str) -> None:
    if conversation_id == st.session_state.current_conversation_id:
        return
    if _needs_persist():
        persist_current_conversation()
    try:
        conversation = get_conversation(USER_ID, conversation_id)
        if conversation is None:
            st.warning("Conversation not found or was deleted.")
            return
        st.session_state.current_conversation_id = conversation["id"]
        st.session_state.messages = conversation.get("messages", [])
        _mark_clean()
    except Exception as exc:
        logger.error("Failed to open conversation: %s", exc)
        st.error("Failed to load conversation.")


def export_chat_as_markdown() -> str:
    md = "# DocChat Conversation Export\n\n"
    for m in st.session_state.messages:
        role = "User" if m["role"] == "user" else "DocChat Assistant"
        md += f"### {role}\n{m['content']}\n\n"
        if m.get("sources"):
            md += f"**Sources:** {', '.join(m['sources'])}\n\n"
        if m.get("hallucination_score") is not None:
            md += f"- **Hallucination Risk:** {m['hallucination_score']}%\n"
            md += f"- **Critique:** {m.get('eval_reason', '')}\n\n"
        md += "---\n\n"
    return md


# ── Main Branding ─────────────────────────────────────────────────────────────
st.markdown(
    '<div class="main-title">DocChat</div>'
    '<div class="main-subtitle">Chat with your documents</div>',
    unsafe_allow_html=True,
)


# ── Left Sidebar ─────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Settings")

    rag_mode = st.segmented_control(
        "RAG Mode",
        options=["Simple", "Thinking"],
        default="Simple",
        label_visibility="collapsed",
        help="Simple: Fast, grounded retrieval with 100% grounded answers.\n"
             "Thinking: Agentic RAG with routing, chunk grading, and self-correction.",
    )

    st.divider()
    st.header("Document Vault")

    col_btn1, col_btn2 = st.columns(2)
    with col_btn1:
        st.button(
            "New Chat",
            icon=":material/edit_square:",
            use_container_width=True,
            type="primary",
            on_click=start_new_conversation,
        )
    with col_btn2:
        if st.session_state.messages:
            st.download_button(
                "Export",
                data=export_chat_as_markdown(),
                file_name="chat_export.md",
                mime="text/markdown",
                use_container_width=True,
            )

    uploaded_files = st.file_uploader(
        "Upload reference documents",
        type=["pdf", "docx", "txt"],
        accept_multiple_files=True,
    )

    if uploaded_files:
        for uf in uploaded_files:
            if uf.name not in st.session_state.processed_files:
                with st.spinner(f"Processing {uf.name}..."):
                    try:
                        text = extract_text(uf)
                        chunks = chunk_text(text, uf.name)
                        if chunks:
                            add_chunks(coll, chunks, user_id=USER_ID)
                        st.session_state.processed_files.add(uf.name)
                        st.success(f"Indexed: {uf.name} ({len(chunks)} chunks)")
                    except Exception as e:
                        logger.error("Failed to process %s: %s", uf.name, e)
                        st.error(f"Failed {uf.name}: {e}")

    # Indexed documents with per-file delete
    if st.session_state.processed_files:
        st.subheader("Indexed Files")
        for fname in sorted(list(st.session_state.processed_files)):
            fcol1, fcol2 = st.columns([4, 1])
            fcol1.caption(f"\U0001f4c4 {fname}")
            if fcol2.button("\U0001f5d1️", key=f"del_{fname}", help=f"Delete {fname}"):
                delete_document_chunks(coll, fname, USER_ID)
                st.session_state.processed_files.discard(fname)
                st.rerun()

        if st.button("Clear All Documents", type="secondary", use_container_width=True):
            clear_user_vault(coll, USER_ID)
            st.session_state.processed_files.clear()
            st.success("All documents removed from vector database.")
            st.rerun()

    # Previous conversations
    previous = load_all(USER_ID)
    if previous:
        st.divider()
        st.subheader("Previous chats")
        for conversation in previous:
            is_open = conversation["id"] == st.session_state.current_conversation_id
            st.button(
                conversation["title"],
                key=f"open_conv_{conversation['id']}",
                use_container_width=True,
                type="primary" if is_open else "tertiary",
                on_click=open_conversation,
                args=(conversation["id"],),
            )


# ── Render Chat History ──────────────────────────────────────────────────────
for idx, msg in enumerate(st.session_state.messages):
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg.get("sources"):
            st.caption(f"**Sources:** {', '.join(msg['sources'])}")
        if msg.get("quotes"):
            with st.expander("Supporting Excerpts"):
                for q in msg["quotes"]:
                    st.markdown(f"> *\"{q}\"*")
        if msg.get("hallucination_score") is not None:
            with st.expander("Hallucination Analysis", expanded=False):
                h_score = msg["hallucination_score"]
                g_score = 100 - h_score
                st.caption(
                    f"**Hallucination Risk:** {h_score}% | "
                    f"**Grounded:** {g_score}%\n\n{msg.get('eval_reason', '')}"
                )
                st.progress(h_score / 100.0)

        if idx == len(st.session_state.messages) - 1 and msg.get("followups"):
            st.markdown("**Suggested Follow-ups:**")
            fcols = st.columns(len(msg["followups"]))
            for f_idx, q_text in enumerate(msg["followups"]):
                if fcols[f_idx].button(q_text, key=f"fup_{f_idx}"):
                    st.session_state.pending_prompt = q_text

# ── Input Bar ────────────────────────────────────────────────────────────────
prompt = st.chat_input("Ask a question about your documents...")

active_prompt = prompt or st.session_state.pending_prompt

# ── Submission Handler ───────────────────────────────────────────────────────
if active_prompt:
    st.session_state.pending_prompt = None

    # Check for
    injection_warning = _check_prompt_injection(active_prompt)
    if injection_warning:
        st.warning(injection_warning)
        logger.warning(" blocked: %s", active_prompt[:100])

    else:
        if not st.session_state.processed_files:
            st.warning("Please upload at least one document first via the sidebar.")
        else:
            st.session_state.messages.append({"role": "user", "content": active_prompt})
            with st.chat_message("user"):
                st.markdown(active_prompt)

            answer = None
            sources = []
            quotes = []
            h_score = 0
            g_score = 0
            eval_reason = ""
            raw_context = ""
            results = None
            followups = []
            status = ""

            try:
                with st.chat_message("assistant"):
                    if rag_mode == "Thinking":
                        with st.spinner("Agent reasoning and validating context..."):
                            status, relevant_docs, results, raw_context = (
                                prepare_agentic_context(
                                    coll, active_prompt, user_id=USER_ID
                                )
                            )
                    else:
                        with st.spinner("Searching documents..."):
                            results = query_collection(
                                coll, active_prompt, user_id=USER_ID, top_k=TOP_K
                            )
                            raw_docs = (
                                results.get("documents", [[]])[0]
                                if results.get("documents")
                                else []
                            )
                            relevant_docs = raw_docs
                            raw_context = "\n\n---\n\n".join(raw_docs)
                            status = "retrieved" if raw_docs else "refusal"

                    if status == "refusal" or not raw_context.strip():
                        answer = (
                            "I do not have sufficient information in the provided "
                            "documents to answer this accurately."
                        )
                        st.markdown(answer)

                    else:
                        sys_inst = (
                            "Answer strictly using the provided context. Do not invent or extrapolate."
                            if rag_mode == "Thinking"
                            else "Answer using the context. Maintain a natural, helpful tone."
                        )
                        messages = [
                            {"role": "system", "content": sys_inst},
                            {
                                "role": "user",
                                "content": f"CONTEXT:\n{raw_context}\n\nQUESTION: {active_prompt}",
                            },
                        ]
                        answer = st.write_stream(
                            stream_response(messages, temperature=TEMPERATURE_ANSWER)
                        )

                    # Extract source filenames
                    if results and results.get("metadatas"):
                        for m in results["metadatas"][0]:
                            src = m.get("source")
                            if src and f"`{src}`" not in sources:
                                sources.append(f"`{src}`")

                    # Extract supporting quotes
                    quotes = [
                        c.strip().replace("\n", " ")[:160] + "..."
                        for c in relevant_docs[:2]
                        if len(c.strip()) > 40
                    ]

                    if sources:
                        st.caption(f"**Sources:** {', '.join(sources)}")
                    if quotes:
                        with st.expander("Supporting Excerpts"):
                            for q in quotes:
                                st.markdown(f"> *\"{q}\"*")

                    # Evaluate hallucination
                    if answer and raw_context.strip():
                        try:
                            eval_data = evaluate_hallucination(answer, raw_context)
                            h_score = eval_data["hallucination_score"]
                            g_score = eval_data["groundedness_score"]
                            eval_reason = eval_data["reasoning"]

                            with st.expander("Hallucination Analysis", expanded=False):
                                st.caption(
                                    f"**Hallucination Risk:** {h_score}% | "
                                    f"**Grounded:** {g_score}%\n\n{eval_reason}"
                                )
                                st.progress(h_score / 100.0)
                        except Exception as exc:
                            logger.error("Hallucination eval failed: %s", exc)

                    # Follow-up suggestions (only for retrieved answers)
                    if answer and status == "retrieved":
                        try:
                            followups = generate_followups(answer, raw_context)
                            if followups:
                                st.markdown("**Suggested Follow-ups:**")
                                fcols = st.columns(len(followups))
                                for f_idx, q_text in enumerate(followups):
                                    if fcols[f_idx].button(q_text, key=f"fup_{f_idx}"):
                                        st.session_state.pending_prompt = q_text
                        except Exception as exc:
                            logger.error("Follow-up generation failed: %s", exc)

            except Exception as exc:
                logger.error("Query pipeline failed: %s", exc, exc_info=True)
                st.error(
                    "Something went wrong processing your request. Please try again."
                )

            # Append assistant message to history
            if answer is not None:
                msg_entry = {
                    "role": "assistant",
                    "content": answer,
                    "sources": sources,
                    "quotes": quotes,
                }
                if raw_context.strip():
                    msg_entry["hallucination_score"] = h_score
                    msg_entry["eval_reason"] = eval_reason
                if followups:
                    msg_entry["followups"] = followups
                st.session_state.messages.append(msg_entry)
                _mark_dirty()

    if _needs_persist():
        persist_current_conversation()
