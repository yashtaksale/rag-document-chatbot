// =============================================================================
// MarkdownRenderer — Renders Markdown, Custom Code Blocks with Copy, and LaTeX math
// =============================================================================

'use client';

import { useMemo } from 'react';
import { marked } from 'marked';
import katex from 'katex';

interface MarkdownRendererProps {
  content: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Pre-process math expressions before markdown parsing
  const processedMathContent = useMemo(() => {
    if (!content) return '';

    // Replace display math $$...$$
    let withMath = content.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      try {
        return `<div class="katex-display">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
      } catch {
        return `$$${math}$$`;
      }
    });

    // Replace inline math $...$ (avoiding dollar signs followed by numbers)
    withMath = withMath.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, math) => {
      if (/^\s*\d/.test(math)) return match;
      try {
        return `${prefix}<span class="katex-inline">${katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })}</span>`;
      } catch {
        return match;
      }
    });

    return withMath;
  }, [content]);

  // Convert to HTML using marked with custom code block renderer
  const rawHtml = useMemo(() => {
    try {
      const renderer = new marked.Renderer();

      renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
        const language = lang || 'code';
        return `
          <div class="code-block-wrapper" style="margin: 14px 0; border: 1px solid var(--code-border); border-radius: var(--radius-md); overflow: hidden; background: var(--code-bg);">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; background: var(--code-header-bg); border-bottom: 1px solid var(--code-border); font-size: 11.5px; color: var(--text-secondary); font-family: var(--font-mono);">
              <span style="font-weight: 600; text-transform: uppercase; color: var(--text-tertiary);">${language}</span>
              <button class="code-copy-btn" type="button" style="background: transparent; border: 1px solid var(--border-medium); color: var(--text-primary); border-radius: var(--radius-xs); padding: 2px 8px; cursor: pointer; font-size: 11px;">Copy</button>
            </div>
            <pre style="margin: 0; padding: 14px 18px; overflow-x: auto; font-family: var(--font-mono); font-size: 13.5px; line-height: 1.55; color: var(--code-text);"><code class="language-${language}">${escapeHtml(text)}</code></pre>
          </div>
        `;
      };

      return marked.parse(processedMathContent, { renderer, async: false }) as string;
    } catch {
      return content;
    }
  }, [processedMathContent, content]);

  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: rawHtml }}
      onClick={(e) => {
        // Delegate click for code copy buttons
        const target = e.target as HTMLElement;
        if (target.classList.contains('code-copy-btn')) {
          const wrapper = target.closest('.code-block-wrapper');
          const code = wrapper?.querySelector('pre code')?.textContent || '';
          navigator.clipboard.writeText(code).then(() => {
            const original = target.innerText;
            target.innerText = 'Copied!';
            target.style.color = 'var(--accent-primary)';
            setTimeout(() => {
              target.innerText = original;
              target.style.color = 'var(--text-primary)';
            }, 2000);
          });
        }
      }}
    />
  );
}
