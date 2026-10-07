// =============================================================================
// API Route — Share Snapshot (GET/POST /api/share)
// =============================================================================

import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// In-memory / server cache for shared snapshots
const snapshotCache = new Map<string, unknown>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, model, messages } = body;

    const id = uuidv4().slice(0, 12);
    const snapshot = {
      id,
      title: title || 'Shared Conversation',
      model: model || 'qwen/qwen3.8-27b',
      messages,
      createdAt: new Date().toISOString(),
    };

    snapshotCache.set(id, snapshot);

    return new Response(JSON.stringify({ id, snapshot }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create share';
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id || !snapshotCache.has(id)) {
    return new Response(JSON.stringify({ error: 'Snapshot not found' }), { status: 404 });
  }

  return new Response(JSON.stringify(snapshotCache.get(id)), {
    headers: { 'Content-Type': 'application/json' },
  });
}
