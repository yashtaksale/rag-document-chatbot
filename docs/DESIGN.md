# Design Document — DocChat (v2.0)
**Project:** DocChat — Hallucination-Resistant RAG Document Chatbot  
**Version:** 2.0.0  
**Last Updated:** October 2026  

This document specifies the visual design system, typography, color architecture, UI component hierarchy, and interaction design of the DocChat v2.0 web application.

---

## 1. Design Philosophy

DocChat is built with a **Claude/ChatGPT-grade user experience** optimized for high-focus document intelligence and academic transparency:

1. **Content-First Canvas**: The conversation thread and document insights dominate the screen. Structural chrome (sidebars, dialogs) recedes into the background until invoked.
2. **Epistemic Transparency**: Every answer communicates its grounding pedigree. Hallucination risk scores, cited quotes, and unsupported spans are surfaced cleanly without causing cognitive overload.
3. **Fluid Micro-Interactions**: Real-time Server-Sent Events (SSE) stream tokens and reasoning thoughts seamlessly, accompanied by smooth pulse animations and responsive hover feedback.
4. **Adaptive Theming**: Native support for Dark, Light, and System color schemes with WCAG AAA compliant contrast ratios.

---

## 2. Color System & Theme Tokens

The design system is implemented using CSS custom properties in `src/app/globals.css` and Tailwind CSS v4:

### 2.1 Dark Theme (Default)
| Token | Variable | Hex / Value | Purpose |
|---|---|---|---|
| **Background Primary** | `--bg-primary` | `#0f1117` | Canvas background |
| **Background Secondary** | `--bg-secondary` | `#161922` | Sidebar and modal background |
| **Background Card / Bubble**| `--bg-card` | `#1e2230` | Assistant bubble, card containers |
| **Border Color** | `--border-color` | `rgba(255, 255, 255, 0.08)` | Dividers, card boundaries |
| **Border Active** | `--border-active` | `rgba(255, 255, 255, 0.20)` | Focused inputs, hovered cards |
| **Text Primary** | `--text-primary` | `#f3f4f6` | Headings, user/assistant text |
| **Text Secondary** | `--text-secondary`| `#9ca3af` | Timestamps, metadata, captions |
| **Accent Primary** | `--accent-primary`| `#6366f1` (Indigo 500) | Primary buttons, active tabs |
| **Accent Hover** | `--accent-hover` | `#4f46e5` (Indigo 600) | Interactive button hover |

### 2.2 Light Theme
| Token | Variable | Hex / Value | Purpose |
|---|---|---|---|
| **Background Primary** | `--bg-primary` | `#f8fafc` (Slate 50) | Canvas background |
| **Background Secondary** | `--bg-secondary` | `#ffffff` | Sidebar, modals |
| **Background Card / Bubble**| `--bg-card` | `#f1f5f9` (Slate 100) | Assistant bubble, surface cards |
| **Border Color** | `--border-color` | `rgba(0, 0, 0, 0.08)` | Dividers, boundaries |
| **Border Active** | `--border-active` | `rgba(0, 0, 0, 0.20)` | Focused state borders |
| **Text Primary** | `--text-primary` | `#0f172a` (Slate 900) | Headings, main text |
| **Text Secondary** | `--text-secondary`| `#64748b` (Slate 500) | Metadata, secondary captions |
| **Accent Primary** | `--accent-primary`| `#4f46e5` (Indigo 600) | Primary actions |

### 2.3 Semantic Status & Hallucination Colors
| State | Semantic Meaning | Background Badge | Text / Accent |
|---|---|---|---|
| **Grounded (Low Risk)** | Groundedness $\ge 85\%$ | `rgba(34, 197, 94, 0.12)` | `#16a34a` (Green) |
| **Medium Risk** | Groundedness $50\% - 84\%$ | `rgba(234, 179, 8, 0.12)` | `#ca8a04` (Amber) |
| **High Risk (Hallucination)** | Groundedness $< 50\%$ | `rgba(239, 68, 68, 0.12)` | `#dc2626` (Red) |
| **Hallucinated Span Tag** | Verbatim text in answer | `rgba(239, 68, 68, 0.18)` | `#ef4444` underline/strike |

---

## 3. Typography & Math Formatting

- **Font Family**: System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`).
- **Monospace Stack**: JetBrains Mono, Fira Code, Menlo, monospace for source code snippets and JSON representations.
- **Math Typesetting**: [KaTeX](https://katex.org/) engine renders LaTeX equations:
  - Inline formulas: `$E = mc^2$`
  - Block equations: `$$\text{Cosine}(A, B) = \frac{A \cdot B}{\|A\| \|B\|}$$`
- **Markdown**: Formatted via `Marked` with custom syntax highlighting for code blocks and GFM tables.

---

## 4. Layout & Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DocChat Web Application                               │
├───────────────────┬─────────────────────────────────────────────────────────────┤
│  SIDEBAR (260px)  │  MAIN CHAT AREA (Fluid Width)                               │
│                   │                                                             │
│  [+ New Chat]     │  [Header: Model Selector · Mode (Simple/Thinking) · Auth]   │
│                   ├─────────────────────────────────────────────────────────────┤
│  📁 Document Vault│  CONVERSATION STREAM                                        │
│  - 3 docs indexed │                                                             │
│  - [Open Vault]   │  User Bubble:                                               │
│                   │  "What are the carbon reduction goals for 2030?"            │
│  💬 History       │                                                             │
│  - Today          │  Assistant Bubble:                                          │
│    · Climate 2030 │  ┌─ 🧠 Thinking Process (Collapsed / Expanded) ──────────┐  │
│    · Python QA    │  │ - Routed to ChromaDB vector search                   │  │
│  - Previous 7 Days│  │ - Verified 4 chunks via parallel LLM grader          │  │
│    · Space Docs   │  │ - Deduplicated with OKF engine (Fusion score: 92%)   │  │
│                   │  └───────────────────────────────────────────────────────┘  │
│  ⚙️ Settings      │  "The 2030 targets require a 45% reduction below 2010..."   │
│  👤 User Profile  │                                                             │
│                   │  ┌─ 🛡️ Hallucination Audit ──────────────────────────────┐  │
│                   │  │ Groundedness: 95% | Risk: 5% (Low) | 4 Claims Checked │  │
│                   │  └───────────────────────────────────────────────────────┘  │
│                   │  Sources: [climate_change.txt] · [View Excerpts]            │
│                   │  Follow-ups: [Which sectors lead?] [What about 2050?]       │
│                   ├─────────────────────────────────────────────────────────────┤
│                   │  INPUT COMPOSER                                             │
│                   │  ┌───────────────────────────────────────────────────────┐  │
│                   │  │ Ask anything about your uploaded documents...         │  │
│                   │  │ [Attach File]                    [RAG: Thinking] [⬆]  │  │
│                   │  └───────────────────────────────────────────────────────┘  │
└───────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 5. Specialized Component Specifications

### 5.1 Document Vault Modal (`DocumentVaultModal.tsx`)
- **Drag-and-Drop Dropzone**: Supports `.pdf`, `.docx`, `.txt`, `.csv`, `.md` up to 25 MB with instantaneous MIME-type validation.
- **Upload Progress Bar**: Visual progress states (`Uploading & parsing` $\to$ `Extracting text & generating vector embeddings` $\to$ `Indexing complete!`).
- **File Grid**: Displays filename, chunk count, upload timestamp, and quick-delete icon per document.
- **Vault Clearing**: Confirmation modal protects against accidental bulk deletion.

### 5.2 Real-time Thinking Process Accordion
- Shows live backend progression:
  1. Prompt injection safety validation.
  2. Query routing (`retrieve` vs `direct`).
  3. ChromaDB vector query and chunk similarity score.
  4. Parallel chunk relevance grading.
  5. OKF deduplication and cross-source fusion.
- Collapses automatically once final answer tokens begin streaming.

### 5.3 Inline Hallucination Visualizer
- If the two-layer auditor identifies unsupported claims:
  - The hallucination audit banner alerts the user with warning styling.
  - The answer text highlights the exact problematic phrase with an interactive tooltip displaying: *"Unsupported by reference document context"*.

### 5.4 Contextual Follow-Up Chips
- 3 contextual questions generated dynamically post-generation.
- Styled as pill buttons (`rounded-full`, subtle border hover) that submit the follow-up query with a single click.
