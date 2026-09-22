# Design Document — DocChat
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot
**Last Updated:** September 2025

This document describes the visual design, interaction design, color system, typography, component structure, and design decisions of the DocChat application.

---

## 1. Design Philosophy

DocChat is a **productivity tool, not a social app**. Its design priorities are:

1. **Content-first** — The chat messages and document content should dominate the screen. UI chrome should be minimal.
2. **Trust through transparency** — Hallucination detection results are prominent but not alarming. Source citations are always visible.
3. **Speed** — Fast loading, fast responses, no unnecessary transitions.
4. **Professional tone** — This is a project for a panel demo. It should look polished and credible.

---

## 2. Color System

### 2.1 Light Theme (Default)
DocChat uses a **light theme** configured in `.streamlit/config.toml`:

| Role | Color | Hex |
|---|---|---|
| Base (background) | White | `#ffffff` |
| Primary text | Near-black | `#0a0a0a` |
| Secondary text | Gray | `#6b7280` |
| Accent / Primary color | Dark | `#0a0a0a` |
| Sidebar background | Off-white | `#fafafa` |

### 2.2 Semantic Colors (Hallucination Risk)
These are used in the hallucination analysis panel (not yet implemented as LOW/MEDIUM/HIGH categories but designed for them):

| Risk Level | Color | Background | Text |
|---|---|---|---|
| LOW | Green | `#dcfce7` | `#166534` |
| MEDIUM | Yellow | `#fef9c3` | `#854d0e` |
| HIGH | Red | `#fee2e2` | `#991b1b` |

### 2.3 Progress Bar Colors
- Hallucination score progress bar: Streamlit's default blue (`#0a0a0a` in this config).
- The bar represents `hallucination_score / 100.0`. Higher percentage = more red (in the user's mental model), but visually it uses the Streamlit default.

### 2.4 Source Citation Color
- Source filenames rendered as inline code (backtick formatting).
- Default markdown code background: light gray.

---

## 3. Typography

### 3.1 Font Family
- **Primary font:** `sans serif` (Streamlit default sans-serif font stack).
- Configured in `.streamlit/config.toml`: `font = "sans serif"`.
- This maps to system sans-serif fonts on each platform (Segoe UI on Windows, SF Pro on macOS, Roboto on Linux).

### 3.2 Font Sizes
| Element | Size | Weight |
|---|---|---|
| App title ("DocChat") | 1.6rem (~25.6px) | 700 (bold) |
| Subtitle ("Chat with your documents") | 0.85rem (~13.6px) | 400 (normal) |
| Sidebar headers | Streamlit default (1rem, 600) | 600 (semibold) |
| Sidebar subheaders | Streamlit default (0.875rem) | 600 (semibold) |
| Chat messages | Streamlit default (1rem) | 400 (normal) |
| Source captions | Streamlit caption size (0.875rem) | 400 (normal) |
| Follow-up buttons | Streamlit button text | 400 (normal) |

### 3.3 Text Colors
| Element | Color | Hex |
|---|---|---|
| App title | Near-black | `#0a0a0a` |
| Subtitle | Medium gray | `#6b7280` |
| Body text (inherited from Streamlit) | Dark | `#0a0a0a` |
| Secondary/inactive text | Gray | `#6b7280` |

---

## 4. Layout

### 4.1 Page Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│  DocChat                                     Chat with your documents │  ← Title + Subtitle
├──────────┬──────────────────────────────────────────────────────────┤
│          │                                                          │
│ Sidebar  │  Main Chat Area                                          │
│ (300px)  │                                                          │
│          │  [Chat bubbles — user on right, assistant on left]       │
│          │                                                          │
│          │  [Sources under each assistant message]                  │
│          │  [Supporting Excerpts expander]                          │
│          │  [Hallucination Analysis expander]                       │
│          │  [Suggested Follow-up buttons]                           │
│          │                                                          │
│          │  ┌──────────────────────────┐                            │
│          │  │  Chat input (full width) │                            │
│          │  └──────────────────────────┘                            │
└──────────┴──────────────────────────────────────────────────────────┘
```

### 4.2 Sidebar Layout (Top to Bottom)
```
┌──────────────────────┐
│ ⚙️ Settings          │  ← st.header
│ ┌──────────────────┐ │
│ │ Simple | Thinking│ │  ← st.segmented_control
│ └──────────────────┘ │
│ ─────────────────── │  ← st.divider
│ 📁 Document Vault   │  ← st.header
│ ┌──────┬──────────┐ │
│ │NewChat│ Export  │ │  ← 2-column layout
│ └──────┴──────────┘ │
│ Upload PDF/DOCX/TXT  │  ← st.file_uploader
│ ─────────────────── │
│ Processing: file.pdf │  ← spinner + success message (conditional)
│ ✅ Indexed: a.pdf    │
│ ✅ Indexed: b.pdf    │
│ ─────────────────── │
│ Indexed Files        │  ← st.subheader (conditional)
│ 📄 a.pdf         🗑️ │  ← per-file: caption + delete button
│ 📄 b.pdf         🗑️ │
│ ─────────────────── │
│ [Clear All Docs]     │  ← st.button (conditional)
│ ─────────────────── │
│ 💬 Previous chats    │  ← st.subheader (conditional)
│ [Chat title]   (pri)│  ← conversation buttons
│ [Chat title]   (ter)│
└──────────────────────┘
```

### 4.3 Chat Area Layout
```
  DocChat                                     ← Title (1.6rem, bold)
  Chat with your documents                    ← Subtitle (0.85rem, gray)
  
  ┌─────────────────────────────────────────┐
  │ User: "What is RAG?"                     │  ← st.chat_message("user")
  └─────────────────────────────────────────┘
  
  ┌─────────────────────────────────────────┐
  │ Assistant:                               │  ← st.chat_message("assistant")
  │ "RAG stands for Retrieval-Augmented..." │
  │ Sources: `research.pdf`, `notes.txt`     │  ← st.caption
  │ ┌─────────────────────────────────────┐ │
  │ │ Supporting Excerpts                 │ │  ← st.expander
  │ │ "RAG combines retrieval with..."   │ │
  │ └─────────────────────────────────────┘ │
  │ ┌─────────────────────────────────────┐ │
  │ │ Hallucination Analysis              │ │  ← st.expander (last message only)
  │ │ Risk: 0% | Grounded: 100%           │ │
  │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (bar)    │ │
  │ │ 5/5 claims verified.                │ │
  │ └─────────────────────────────────────┘ │
  │ Suggested Follow-ups:                    │
  │ [What are embeddings?] [Why chunking?]   │  ← buttons in columns
  └─────────────────────────────────────────┘

  ┌──────────────────────────────────────────┐
  │ Ask a question about your documents...   │  ← st.chat_input
  └──────────────────────────────────────────┘
```

### 4.4 Responsive Behavior
- **Desktop:** Full layout as shown above. Sidebar and main chat area.
- **Tablet:** Same layout, sidebar collapses into hamburger menu.
- **Mobile:** 
  - The custom CSS hides the Streamlit header: `.stApp > header { display: none; }`.
  - Streamlit handles the responsive sidebar automatically (hamburger menu).
  - Chat messages take full width.

---

## 5. Component Specifications

### 5.1 Chat Message Component
**Type:** Streamlit `st.chat_message`
**Variants:** `"user"` and `"assistant"`
**User message content:** Plain text via `st.markdown()`.
**Assistant message content (compound):**

1. Answer text: `st.markdown(msg["content"])`
2. Sources (if any): `st.caption(f"**Sources:** {', '.join(sources)}")`
3. Supporting excerpts (if any): expandable `st.expander("Supporting Excerpts")` with up to 2 quotes.
4. Hallucination analysis (if evaluated): expandable `st.expander("Hallucination Analysis")` with score + progress bar.
5. Follow-ups (if any, last message only): `st.markdown("**Suggested Follow-ups:**")` + column buttons.

### 5.2 File Uploader Component
**Type:** Streamlit `st.file_uploader`
**Accept types:** `["pdf", "docx", "txt"]`
**Multiple files:** Yes (`accept_multiple_files=True`)
**Label:** "Upload reference documents"
**Behavior:**
- After upload, each new file is processed individually.
- Already-processed files are skipped (tracked in `st.session_state.processed_files`).
- Processing shows a spinner with filename.
- Success shows "Indexed: {filename} ({N} chunks)".
- Failure shows "Failed {filename}: {error_message}".

### 5.3 Document List Component
**Type:** Custom (subheader + per-item row)
**Header:** "Indexed Files"
**Items:**
- Each file: `st.caption(f"📎 {filename}")` + `st.button("🗑️", key=f"del_{filename}")`.
- Delete button triggers `delete_document_chunks()` + rerun.
- "Clear All Documents" button: `st.button("Clear All Documents", type="secondary")`.

### 5.4 Conversation History Component
**Type:** Custom (subheader + buttons)
**Header:** "Previous chats"
**Visibility:** Only shown when `load_all(USER_ID)` returns non-empty results.
**Items:** `st.button(conversation["title"], key=..., type="primary" or "tertiary")`.
- Active conversation = `type="primary"` (highlighted).
- Others = `type="tertiary"` (subtle).
- Click triggers `open_conversation(conversation_id)`.

### 5.5 Hallucination Analysis Panel
**Type:** `st.expander("Hallucination Analysis", expanded=False)`
**Contents:**
```
**Hallucination Risk:** {h_score}% | **Grounded:** {g_score}%

{reasoning text}

[Progress bar: value = h_score / 100.0]
```
- Only shown for the **last** assistant message (conditional: `idx == len(messages) - 1`).
- Not shown for refusal responses.

### 5.6 Follow-Up Buttons
**Type:** `st.columns(N)` + `st.button(text, key=f"fup_{i}")`
**N:** Number of follow-up questions (max 3).
**Behavior:** Clicking sets `st.session_state.pending_prompt = question_text`. The pending prompt is picked up by the input handler on the next rerun.

### 5.7 Export Button
**Type:** `st.download_button`
**Availability:** Only when `st.session_state.messages` is non-empty.
**File name:** `chat_export.md`
**MIME type:** `text/markdown`
**Content:** Generated by `export_chat_as_markdown()`:
```markdown
# DocChat Conversation Export

### User
What is RAG?

### DocChat Assistant
RAG stands for...

**Sources:** `research.pdf`, `notes.txt`

**Hallucination Risk:** 0%
**Critique:** 5/5 claims verified.

---

[repeats for each message]
```

### 5.8 New Chat Button
**Type:** `st.button("New Chat", icon=":material/edit_square:")`
**Behavior:**
1. If current conversation is dirty (has unsaved changes), persist it first.
2. Reset `current_conversation_id` to `None`.
3. Clear `st.session_state.messages`.
4. Clear `st.session_state.pending_prompt`.
5. Mark clean.

---

## 6. Interaction Design

### 6.1 User Onboarding (First-Time User)
1. User runs `streamlit run app.py`.
2. Browser opens to a clean chat interface with title "DocChat" and subtitle "Chat with your documents".
3. Sidebar shows settings (RAG mode = Simple) and "Upload reference documents" uploader.
4. User sees: "👆 Upload documents in the sidebar first." (shown 
5. User uploads a PDF → spinner → "Indexed: file.pdf (N chunks)".
6. User asks a question → streaming answer appears → sources shown → hallucination analysis expandable.
7. Follow-up buttons appear below the last answer.

### 6.2 Conversation Lifecycle
```
Session Start
    │
    ├── load_collection() → cached ChromaDB
    ├── processed_files ← existing documents from ChromaDB
    ├── previous ← load_all(USER_ID) → sidebar shows history
    │
    ├── User asks question → answer displayed → conversation dirty
    ├── User asks another → appended → conversation dirty
    │
    ├── User clicks "New Chat"
    │   ├── persist_current_conversation() (if dirty)
    │   └── Clear messages, reset conversation ID
    │
    ├── User clicks a previous conversation
    │   ├── persist_current_conversation() (if dirty)
    │   └── Load that conversation's messages
    │
Session End
    └── persist_current_conversation() (if dirty, via dirty check after every response)
```

### 6.3 Thinking Mode Experience
1. User toggles RAG Mode to "Thinking".
2. Sends a question.
3. Sees: "Agent reasoning and validating context..." (spinner).
4. Behind the scenes: router → retrieval → chunk grading (parallel) → optional rewrite → context assembly.
5. Answer streams in (same as Simple mode).
6. Hallucination analysis appears.

### 6.4 Error States

| Error | User Sees | Logs |
|---|---|---|
|  detected | Warning: "Your message appears to contain instructions..." | `logger.warning(" blocked: ...")` |
| No files uploaded | `st.warning("Please upload at least one document...")` | None |
| Scanned PDF | `st.error(f"Failed {filename}: No text found...")` | `logger.error("Failed to process ...")` |
| Groq API failure | `st.error("Something went wrong...")` | `logger.error("Query pipeline failed: ...")` |
| Hallucination eval failure | Nothing visible (answer still displayed) | `logger.error("Hallucination eval failed: ...")` |
| Follow-up generation failure | No follow-up buttons appear | `logger.error("Follow-up generation failed: ...")` |
| Conversation persistence failure | `st.error("Failed to save conversation...")` | `logger.error("Failed to persist conversation: ...")` |
| Rate limit exceeded | `RuntimeError` bubbles up (currently not caught) | `_check_rate_limit()` raises |

---

## 7. State Management

### 7.1 Streamlit Session State
Streamlit reruns the entire script on every user interaction. All state that must persist across reruns lives in `st.session_state`:

| Key | Type | Default | Purpose |
|---|---|---|---|
| `messages` | `list[dict]` | `[]` | Chat message history. Each dict has `role`, `content`, and optional `sources`, `quotes`, `hallucination_score`, `eval_reason`, `followups`. |
| `processed_files` | `set[str]` | Set from existing ChromaDB docs | Filenames currently in the vector store. |
| `current_conversation_id` | `str \| None` | `None` | UUID of the active conversation. |
| `pending_prompt` | `str \| None` | `None` | Follow-up question to auto-submit. |
| `_conversation_dirty` | `bool` | `False` | Whether the current conversation has unsaved changes. |

### 7.2 Cached Resources
| Cache | Key | Purpose |
|---|---|---|
| `@st.cache_resource load_collection()` | (no key — singleton) | ChromaDB collection loaded once, reused across all reruns. Never reloaded unless the app restarts. |

### 7.3 Module-Level State
| Variable | Module | Purpose |
|---|---|---|
| `EMBEDDER` | `backend/vector_store.py` | SentenceTransformer singleton. Loaded once at import. |
| `client` | `backend/agent.py` | Groq API client. Created once at import. |
| `_query_log` | `backend/agent.py` | In-memory rate limiter timestamps. |

---

## 8. Animation and Transitions

### 8.1 Streaming Answer
- Answers are streamed token-by-token using Groq's streaming API.
- `st.write_stream()` renders tokens as they arrive, creating a typing animation.
- This is the primary "animation" in the app and creates a sense of real-time response.

### 8.2 Spinner States
| When | Spinner Message |
|---|---|
| Processing a document | "Processing {filename}..." |
| Thinking mode query | "Agent reasoning and validating context..." |
| Simple mode query | "Searching documents..." |

### 8.3 No Other Animations
- No page transitions.
- No loading skeletons.
- No progress bars except the hallucination risk bar.
- No hover effects or micro-interactions on buttons (Streamlit handles these natively).

---

## 9. Accessibility Considerations

### 9.1 Current State
- Streamlit handles basic accessibility (keyboard navigation, screen reader labels on native widgets).
- Custom markdown content (chat messages, expanders) inherits Streamlit's accessibility.

### 9.2 Limitations
- Custom CSS hides the Streamlit header (`display: none`). This removes the accessible app title from the DOM.
- Icon-only buttons (delete file: 🗑️) rely on the `help` parameter for screen reader text.
- Color alone does not convey risk status (text labels are always present alongside the progress bar).

---

## 10. Dark Mode Support
- The app is configured for **light theme only** in `.streamlit/config.toml`.
- If the user's browser is in dark mode, Streamlit may override or ignore the config.
- Dark mode was not designed for — the color contrast ratios are optimized for light backgrounds only.

---

## 11. Branding

### 11.1 App Name
- **"DocChat"** — simple, descriptive, memorable.
- Displayed as the main title and in the browser tab.

### 11.2 Tagline
- **"Chat with your documents"** — displayed as subtitle below the title.

### 11.3 Iconography
- Upload area: implicit (file uploader widget).
- New Chat: `:material/edit_square:` (Material Icons).
- Delete file: 🗑️ (emoji).
- Indexed file: 📎 (emoji).
- Follow-up: No specific icon, just text buttons.

---

## 12. Streamlit Configuration

### 12.1 `.streamlit/config.toml`
```toml
[theme]
base = "light"
primaryColor = "#0a0a0a"
backgroundColor = "#ffffff"
secondaryBackgroundColor = "#fafafa"
textColor = "#0a0a0a"
font = "sans serif"

[server]
headless = true
runOnSave = false
fileWatcherType = "auto"
```

**Configuration meaning:**
- `headless = true`: App runs without opening a browser automatically (useful for deployment).
- `runOnSave = false`: App does not rerun when source files change (standard Streamlit behavior for production; in development, manual rerun is triggered by user interaction).
- `fileWatcherType = "auto"`: Streamlit chooses the best file watcher for the platform.

---

## 13. Design Decisions and Trade-offs

### 13.1 Why Light Theme?
- The panel demo environment is likely a projector or standard monitor. Light themes have better contrast on projectors.
- Dark mode would require additional color calculations and testing.

### 13.2 Why No Model Selector in UI Yet?
- The fine-tuned model (Phase 3) is not built yet. Adding a placeholder selector that doesn't work would be confusing.
- The "Simple / Thinking" segmented control gives users meaningful choice with both modes fully functional.

### 13.3 Why Expandable Hallucination Analysis?
- The hallucination panel is technical (percentages, reasoning text). Showing it by default would clutter the chat for casual users.
- The expander pattern is a common UX pattern for "detailed technical info, hide by default".
- The progress bar inside the expander makes the risk immediately visible when the user expands it.

### 13.4 Why JSON Instead of SQLite for Conversations?
- Zero dependencies (no need for another library).
- Human-readable for debugging.
- Atomic writes are simple with `os.replace()`.
- SQLite would be overkill for a single user with a few conversations.

### 13.5 Why Atomic Writes?
- If the app crashes during a `json.dump()`, the `.tmp` file is left behind but the original file is intact.
- `os.replace()` is atomic on all modern OSes — there is no intermediate state where the file is partially written.

### 13.6 Why Claim-Level Instead of Sentence-Level Evaluation?
- Claims are more granular than sentences — a long sentence may contain multiple claims.
- Claim-level evaluation gives a more nuanced hallucination score.
- The trade-off is more LLM API calls (one per claim vs. one per sentence).
- Parallel execution with `ThreadPoolExecutor` mitigates the latency.
