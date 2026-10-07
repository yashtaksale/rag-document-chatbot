import json
import logging
import os
import time
import uuid

from backend.config import API_TIMEOUT

logger = logging.getLogger(__name__)


def _get_path(user_id: int) -> str:
    """Return a per-user conversation file path."""
    # Use a nested directory structure to reduce predictability
    uid_str = str(user_id)
    folder = uid_str[-2:]  # last two digits as folder (e.g. user 1 -> "01")
    base = os.path.join("conversations", folder)
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, f"user_{uid_str}.json")


def load_all(user_id: int) -> list[dict]:
    path = _get_path(user_id)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return sorted(data, key=lambda x: x.get("updated_at", 0), reverse=True)
    except Exception as exc:
        logger.error("Failed to load conversations for user %d: %s", user_id, exc)
        return []


def save_all(user_id: int, conversations: list[dict]) -> None:
    """Atomically save conversations — write to .tmp then rename."""
    path = _get_path(user_id)
    tmp_path = path + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(conversations, f, indent=2)
        os.replace(tmp_path, path)
    except Exception as exc:
        logger.error("Failed to save conversations for user %d: %s", user_id, exc)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


MAX_MESSAGES_PER_CONV = 100
MAX_CONVERSATIONS_PER_USER = 100


def get_conversation(user_id: int, conversation_id: str) -> dict | None:
    convs = load_all(user_id)
    return next((c for c in convs if c["id"] == conversation_id), None)


def upsert_conversation(user_id: int, conv: dict) -> None:
    convs = load_all(user_id)
    now = time.time()
    conv["updated_at"] = now

    # Cap message history inside the conversation to prevent unbounded growth
    if "messages" in conv and isinstance(conv["messages"], list):
        if len(conv["messages"]) > MAX_MESSAGES_PER_CONV:
            conv["messages"] = conv["messages"][-MAX_MESSAGES_PER_CONV:]

    idx = next((i for i, c in enumerate(convs) if c["id"] == conv["id"]), None)
    if idx is not None:
        convs[idx] = conv
    else:
        convs.insert(0, conv)

    # Cap total stored conversations per user
    if len(convs) > MAX_CONVERSATIONS_PER_USER:
        convs = convs[:MAX_CONVERSATIONS_PER_USER]

    save_all(user_id, convs)


def delete_conversation(user_id: int, conversation_id: str) -> None:
    convs = [c for c in load_all(user_id) if c["id"] != conversation_id]
    save_all(user_id, convs)


def build_conversation(conv_id: str | None, messages: list[dict]) -> dict:
    title = "New Chat"
    for m in messages:
        if m.get("role") == "user":
            content = str(m.get("content", ""))
            title = content[:25] + ("..." if len(content) > 25 else "")
            break
    
    # Bound messages length
    trimmed_messages = messages[-MAX_MESSAGES_PER_CONV:] if len(messages) > MAX_MESSAGES_PER_CONV else messages

    return {
        "id": conv_id or str(uuid.uuid4()),
        "title": title,
        "messages": trimmed_messages,
        "is_archived": False,
        "updated_at": time.time(),
    }
