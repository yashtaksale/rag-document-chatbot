// =============================================================================
// API Route — Document & Attachment Upload (POST /api/upload)
// Handles PDF text extraction, plain text/code files, and image attachments.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided in form data' }, { status: 400 });
    }

    const fileName = file.name || 'document';
    const fileSize = file.size;
    const fileType = file.type || 'application/octet-stream';
    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';

    const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit
    if (fileSize > MAX_SIZE) {
      return NextResponse.json(
        { error: `File "${fileName}" exceeds the 15MB maximum size limit.` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = '';
    let dataUrl: string | undefined = undefined;
    let pageCount: number | undefined = undefined;

    // 1. PDF Parsing
    if (fileType === 'application/pdf' || fileExt === 'pdf') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text?.trim() || '';
        pageCount = pdfData.numpages;
      } catch (pdfErr) {
        console.warn('pdf-parse failed, falling back to string extraction:', pdfErr);
        // Fallback: extract printable ASCII strings from buffer
        extractedText = buffer.toString('utf-8').replace(/[^\x20-\x7E\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    // 2. Images (Base64 for vision models)
    else if (fileType.startsWith('image/')) {
      const base64 = buffer.toString('base64');
      dataUrl = `data:${fileType};base64,${base64}`;
      extractedText = `[Image attached: ${fileName} (${Math.round(fileSize / 1024)} KB)]`;
    }
    // 3. Text, Markdown, Code, JSON, CSV, etc.
    else {
      try {
        extractedText = buffer.toString('utf-8');
      } catch (err) {
        console.warn('Failed utf-8 decoding:', err);
        extractedText = `[File attached: ${fileName}]`;
      }
    }

    const wordCount = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0;

    return NextResponse.json({
      id: uuidv4(),
      fileName,
      fileType,
      fileSize,
      extractedText,
      dataUrl,
      pageCount,
      wordCount,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Upload processing failed';
    console.error('Upload API error:', err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
