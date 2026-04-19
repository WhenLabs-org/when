import { openSync, readSync, fstatSync, closeSync } from 'node:fs';

// How many bytes from the end of the transcript to read when scanning for
// the most recent assistant message. 128 KB comfortably covers several
// assistant messages plus any tool-use blocks in a typical session.
const TAIL_BYTES = 128 * 1024;

export interface TranscriptSummary {
  model_id: string | null;
  context_tokens: number | null; // best-effort: input + cache_read + cache_creation
}

/**
 * Read the tail of a Claude Code JSONL session transcript and extract the
 * most recent assistant message's model and token usage. Never throws: any
 * I/O or parse failure returns nulls.
 */
export function readTranscriptSummary(path: string | undefined): TranscriptSummary {
  const empty: TranscriptSummary = { model_id: null, context_tokens: null };
  if (!path) return empty;

  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    if (size === 0) return empty;
    const length = Math.min(TAIL_BYTES, size);
    const start = size - length;
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, start);
    const text = buf.toString('utf-8');

    // JSONL: scan lines in reverse so we find the *most recent* assistant message.
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // likely truncated first line after the tail cut
      }
      const type = typeof obj.type === 'string' ? obj.type : null;
      if (type !== 'assistant') continue;

      const message = obj.message as Record<string, unknown> | undefined;
      if (!message) continue;

      const model = typeof message.model === 'string' ? message.model : null;
      const usage = message.usage as Record<string, unknown> | undefined;

      let ctx: number | null = null;
      if (usage) {
        const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
        const cacheRead = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
        const cacheCreate = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
        const sum = input + cacheRead + cacheCreate;
        if (sum > 0) ctx = sum;
      }

      if (model != null || ctx != null) {
        return { model_id: model, context_tokens: ctx };
      }
    }
    return empty;
  } catch {
    return empty;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}
