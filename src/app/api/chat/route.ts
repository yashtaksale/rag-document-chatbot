// =============================================================================
// API Route — Chat Streaming (POST /api/chat)
// Handles Groq / OpenAI compatible SSE streaming with reasoning, tools,
// and automatic multi-model failover for rate limits (429) and missing models (404).
// =============================================================================

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const API_KEY = process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '';
const API_BASE = process.env.LLM_API_BASE || 'https://api.groq.com/openai/v1';

const VALID_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'allam-2-7b',
  'openai/gpt-oss-20b',
  'claude-3-7-sonnet',
  'gpt-4o',
  'deepseek-r1',
];

const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

function resolveModel(requestedModel?: string): string {
  if (!requestedModel) return DEFAULT_MODEL;
  if (['claude-3-7-sonnet', 'gpt-4o', 'deepseek-r1'].includes(requestedModel)) {
    // Map to highest-performing available reasoning model on Groq
    return 'qwen/qwen3.8-27b';
  }
  if (VALID_MODELS.includes(requestedModel)) return requestedModel;
  return DEFAULT_MODEL;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      model: rawModel,
      temperature = 0.7,
      systemPrompt,
      customInstructions,
      projectInstructions,
      injectedMemories = [],
      toolsEnabled = [],
      extendedThinking: rawExtendedThinking = false,
    } = body;

    const requestedModel = resolveModel(rawModel);
    const extendedThinking = rawExtendedThinking || rawModel === 'deepseek-r1' || rawModel === 'claude-3-7-sonnet';

    // ── 0. Route through DocChat Python RAG Backend if Available ─────────────
    const ragMode = body.ragMode || 'Thinking';
    const userId = body.userId !== undefined && body.userId !== null ? Number(body.userId) : 1;
    const useDocChat = body.useDocChat !== false;

    if (useDocChat) {
      const lastUserMsg = [...(messages || [])].reverse().find((m: any) => m.role === 'user');
      const question = lastUserMsg?.content || '';

      try {
        const backendEndpoint = process.env.DOCCHAT_BACKEND_URL || 'http://127.0.0.1:8001/api/chat/stream';
        const backendHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        const authHeader = req.headers.get('authorization');
        if (authHeader) {
          backendHeaders['Authorization'] = authHeader;
        }

        const docchatRes = await fetch(backendEndpoint, {
          method: 'POST',
          headers: backendHeaders,
          body: JSON.stringify({
            question,
            user_id: isNaN(userId) ? 1 : userId,
            mode: ragMode,
            messages: messages?.map((m: any) => ({ role: m.role, content: m.content })),
          }),
        });

        if (!docchatRes.ok) {
          const errData = await docchatRes.json().catch(() => ({ detail: `Backend returned HTTP ${docchatRes.status}` }));
          console.error('DocChat backend error:', docchatRes.status, errData);
          return new Response(
            JSON.stringify({ error: errData.detail || `DocChat backend error (${docchatRes.status})` }),
            { status: docchatRes.status, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (docchatRes.body) {
          const reader = docchatRes.body.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();

          const stream = new ReadableStream({
            async start(controller) {
              let buffer = '';
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;
                    const rawData = trimmed.slice(6);
                    if (rawData === '[DONE]') {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                      continue;
                    }
                    try {
                      const payload = JSON.parse(rawData);
                      if (payload.type === 'thinking') {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'reasoning', reasoning: payload.delta })}\n\n`)
                        );
                      } else if (payload.type === 'token') {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'content', content: payload.delta })}\n\n`)
                        );
                      } else if (payload.type === 'metadata') {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'docchat_metadata', ...payload })}\n\n`)
                        );
                      } else if (payload.type === 'error') {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: payload.error })}\n\n`)
                        );
                      }
                    } catch {
                      // passthrough
                    }
                  }
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                controller.close();
              } catch (err: any) {
                controller.error(err);
              }
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          });
        }
      } catch (backendErr: any) {
        console.error('DocChat backend unreachable on port 8001:', backendErr);
        return new Response(
          JSON.stringify({ error: `DocChat backend service is unreachable (${backendErr.message}). Please ensure Python backend is running.` }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LLM_API_KEY or GROQ_API_KEY not configured on server' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Build System Message ───────────────────────────────────────────────────
    const systemParts: string[] = [];

    // Persona flavor based on selected model
    if (rawModel === 'claude-3-7-sonnet') {
      systemParts.push(
        'You are Claude, a helpful, thoughtful, and highly capable AI assistant developed by Anthropic. ' +
        'Respond with warmth, nuance, and precision. When creating documents, diagrams, or code, create clean standalone artifacts.'
      );
    } else if (rawModel === 'deepseek-r1') {
      systemParts.push(
        'You are DeepSeek-R1, an expert reasoning AI model. Provide thorough, mathematically sound, and rigorously reasoned responses.'
      );
    } else if (rawModel === 'gpt-4o') {
      systemParts.push(
        'You are GPT-4o, a highly capable multimodal AI model. Provide clear, structured, and comprehensive answers.'
      );
    }

    if (systemPrompt) {
      systemParts.push(systemPrompt);
    }

    if (projectInstructions) {
      systemParts.push(`\n## Project Context & Instructions:\n${projectInstructions}`);
    }

    if (customInstructions) {
      systemParts.push(`\n## User Custom Instructions:\n${customInstructions}`);
    }

    if (injectedMemories && injectedMemories.length > 0) {
      systemParts.push(
        `\n## Durable User Memories (Known facts):\n${injectedMemories.map((m: string) => `- ${m}`).join('\n')}`
      );
    }

    if (toolsEnabled && toolsEnabled.length > 0) {
      systemParts.push(
        `\n## Available Tools: ${toolsEnabled.join(', ')}\n` +
        `If relevant, you may invoke:\n` +
        `- [TOOL:web_search query="search terms"]\n` +
        `- [TOOL:code_execution language="javascript"]\ncode here\n[/TOOL]\n` +
        `- [TOOL:file_creation name="filename.ext"]\nfile content here\n[/TOOL]`
      );
    }

    if (extendedThinking) {
      systemParts.push(
        `\n## Extended Thinking Enabled:\n` +
        `Please think deeply step-by-step before answering. Enclose your inner chain-of-thought in <thinking>...</thinking> tags at the very beginning of your response. Then provide your direct answer outside the thinking tags.`
      );
    }

    const formattedMessages: { role: string; content: string }[] = [];

    if (systemParts.length > 0) {
      formattedMessages.push({
        role: 'system',
        content: systemParts.join('\n\n'),
      });
    }

    for (const msg of messages) {
      if (msg.role !== 'system') {
        formattedMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    const makeLlmCall = async (targetModel: string) => {
      return fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DocChat/1.0',
        },
        body: JSON.stringify({
          model: targetModel,
          messages: formattedMessages,
          temperature,
          stream: true,
        }),
      });
    };

    // ── Resilient Fallback Chain for Rate Limits (429) & Model Errors (404) ───
    // Prioritize healthy models with active quotas (qwen3.8-27b, gpt-oss-120b, allam-2-7b)
    const healthyPriority = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'allam-2-7b'];
    
    // If the requested model is not exhausted, try it first; otherwise use healthyPriority
    const primary = requestedModel === 'openai/gpt-oss-20b' ? 'qwen/qwen3.8-27b' : requestedModel;
    const fallbackChain = [
      primary,
      ...healthyPriority,
      'openai/gpt-oss-20b',
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    let llmResponse: Response | null = null;
    let lastErrorDetails = '';

    for (let i = 0; i < fallbackChain.length; i++) {
      const modelCandidate = fallbackChain[i];
      try {
        const resp = await makeLlmCall(modelCandidate);
        if (resp.ok) {
          llmResponse = resp;
          break;
        }

        // If rate limited (429) or model not found (404), record and try next model
        if (resp.status === 429 || resp.status === 404) {
          lastErrorDetails = await resp.text();
          console.warn(`Model ${modelCandidate} returned ${resp.status}, attempting fallback to next model in chain...`);
          
          // If 429, wait briefly (1-1.5s) to allow token bucket to replenish before next attempt
          if (resp.status === 429 && i < fallbackChain.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          continue;
        }

        // Fatal client error (e.g. 401 unauth)
        llmResponse = resp;
        break;
      } catch (e) {
        lastErrorDetails = e instanceof Error ? e.message : 'Fetch failed';
      }
    }

    if (!llmResponse || !llmResponse.ok) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit reached on Groq API. Please wait a few seconds before trying again.',
          details: lastErrorDetails,
          retryAfter: 3,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Forward SSE events and handle <thinking> extraction
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = llmResponse?.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let insideThinking = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              const data = trimmed.slice(6);
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode(`data: {"type":"done"}\n\n`));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // Support native delta.reasoning from DeepSeek/Groq reasoning models
                if (delta?.reasoning) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'reasoning', reasoning: delta.reasoning })}\n\n`)
                  );
                }

                if (delta?.content) {
                  let text = delta.content;

                  // Handle <thinking> entry
                  if (!insideThinking && text.includes('<thinking>')) {
                    insideThinking = true;
                    const parts = text.split('<thinking>');
                    if (parts[0]) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'content', content: parts[0] })}\n\n`)
                      );
                    }
                    text = parts.slice(1).join('<thinking>');
                  }

                  if (insideThinking) {
                    if (text.includes('</thinking>')) {
                      const [thinkPart, contentPart] = text.split('</thinking>');
                      if (thinkPart) {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'reasoning', reasoning: thinkPart })}\n\n`)
                        );
                      }
                      insideThinking = false;
                      if (contentPart) {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'content', content: contentPart })}\n\n`)
                        );
                      }
                    } else if (text) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'reasoning', reasoning: text })}\n\n`)
                      );
                    }
                  } else if (text) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'content', content: text })}\n\n`)
                    );
                  }
                }

                if (parsed.usage) {
                  const event = JSON.stringify({
                    type: 'usage',
                    usage: {
                      promptTokens: parsed.usage.prompt_tokens,
                      completionTokens: parsed.usage.completion_tokens,
                      totalTokens: parsed.usage.total_tokens,
                    },
                  });
                  controller.enqueue(encoder.encode(`data: ${event}\n\n`));
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error';
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
