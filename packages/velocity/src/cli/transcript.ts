import { openSync, readSync, fstatSync, closeSync } from 'node:fs';

// How many bytes from the end of the transcript to read when scanning for
// recent events. 128 KB comfortably covers several assistant messages plus
// the latest user message in a typical session.
const TAIL_BYTES = 128 * 1024;

// Hard cap on how much of a user message we embed in task descriptions —
// long pastes should not fill a SQLite row (or derail similarity matching).
const USER_MESSAGE_MAX_CHARS = 500;

// Bumped whenever we adjust the set of keys / paths we know how to read from.
// Used in the "unrecognized format" diagnostic so users can report a format
// drift together with the version of velocity they were running.
export const TRANSCRIPT_DETECTION_VERSION = 2;

// If the parser sees JSON lines but no key we recognise, emit ONE warning
// per process and then disable further transcript reads. Prevents a wall
// of stderr noise from a single schema drift.
let formatDisabled = false;
let formatWarned = false;

export function resetTranscriptFormatState(): void {
  formatDisabled = false;
  formatWarned = false;
}

export interface TranscriptSummary {
  model_id: string | null;
  context_tokens: number | null; // best-effort: input + cache_read + cache_creation
  last_user_message: string | null;
}

function readTail(path: string): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    if (size === 0) return null;
    const length = Math.min(TAIL_BYTES, size);
    const start = size - length;
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, start);
    return buf.toString('utf-8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}

function parseLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null; // truncated first line after the tail cut
  }
}

function extractUserText(obj: Record<string, unknown>): string | null {
  // Try several known locations so we survive small format drifts:
  //   - { message: { content: "..." } }   (Anthropic SDK, modern)
  //   - { message: { content: [blocks] } } (Anthropic SDK, tool-use form)
  //   - { content: "..." }                 (flat form used by some wrappers)
  //   - { text: "..." }                    (ancient / debug)
  const candidates: unknown[] = [
    (obj.message as Record<string, unknown> | undefined)?.content,
    obj.content,
    obj.text,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
    if (Array.isArray(c)) {
      for (const block of c) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;
        if (b.type === 'text' && typeof b.text === 'string') return b.text;
      }
    }
  }
  return null;
}

function extractAssistantModelAndUsage(obj: Record<string, unknown>): {
  model: string | null;
  usage: Record<string, unknown> | null;
} {
  // Known places for `model`:
  //   - obj.message.model   (current)
  //   - obj.model           (flattened)
  //   - obj.assistant?.model
  const msg = obj.message as Record<string, unknown> | undefined;
  const asst = obj.assistant as Record<string, unknown> | undefined;
  const model =
    (msg && typeof msg.model === 'string' ? msg.model : null) ??
    (typeof obj.model === 'string' ? obj.model : null) ??
    (asst && typeof asst.model === 'string' ? asst.model : null);

  // Known places for `usage`:
  //   - obj.message.usage
  //   - obj.usage
  const usage =
    (msg && typeof msg.usage === 'object' && msg.usage ? msg.usage as Record<string, unknown> : null) ??
    (typeof obj.usage === 'object' && obj.usage ? obj.usage as Record<string, unknown> : null);

  return { model, usage };
}

function warnUnrecognizedFormat(reason: string): void {
  if (formatWarned) return;
  formatWarned = true;
  formatDisabled = true;
  process.stderr.write(
    `velocity-mcp: transcript format unrecognized (${reason}, detector v${TRANSCRIPT_DETECTION_VERSION}) — model/context extraction disabled for this process. Please file an issue.\n`,
  );
}

/**
 * Trim and sanitize a user message so it's safe to embed in a task
 * description: strip leading/trailing whitespace, collapse runs of
 * whitespace, and cap at USER_MESSAGE_MAX_CHARS.
 */
export function sanitizeUserMessage(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  // Discard leading slash-commands like "/undo" or "/clear" — those are
  // client directives, not task intent.
  if (s.startsWith('/')) {
    const space = s.indexOf(' ');
    if (space === -1) return '';
    s = s.slice(space + 1).trim();
  }
  if (s.length > USER_MESSAGE_MAX_CHARS) {
    s = s.slice(0, USER_MESSAGE_MAX_CHARS - 1).trim() + '…';
  }
  return s;
}

/**
 * Read the tail of a Claude Code JSONL session transcript and extract the
 * most recent assistant message's model/usage and the most recent user
 * message. Never throws: any I/O or parse failure returns nulls.
 */
export function readTranscriptSummary(path: string | undefined): TranscriptSummary {
  const empty: TranscriptSummary = { model_id: null, context_tokens: null, last_user_message: null };
  if (!path) return empty;
  if (formatDisabled) return empty;

  const text = readTail(path);
  if (!text) return empty;

  const lines = text.split('\n');
  let model: string | null = null;
  let ctx: number | null = null;
  let userMessage: string | null = null;

  let sawParseableLines = false;
  let sawKnownType = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    const obj = parseLine(lines[i]);
    if (!obj) continue;
    sawParseableLines = true;
    const type = typeof obj.type === 'string' ? obj.type : null;

    if (type === 'assistant') {
      sawKnownType = true;
      if (model == null && ctx == null) {
        const { model: m, usage } = extractAssistantModelAndUsage(obj);
        let c: number | null = null;
        if (usage) {
          const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
          const cacheRead = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
          const cacheCreate = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
          const sum = input + cacheRead + cacheCreate;
          if (sum > 0) c = sum;
        }
        if (m != null || c != null) {
          model = m;
          ctx = c;
        }
      }
    }

    if (type === 'user') {
      sawKnownType = true;
      if (userMessage == null) {
        const text = extractUserText(obj);
        if (text) {
          const sanitized = sanitizeUserMessage(text);
          if (sanitized) userMessage = sanitized;
        }
      }
    }

    if (model != null && userMessage != null) break;
  }

  // We found JSON we could parse but nothing with a recognised type — the
  // transcript format has probably drifted. Warn once and disable further
  // reads for the rest of this process.
  if (sawParseableLines && !sawKnownType) {
    warnUnrecognizedFormat('no assistant/user records found');
  }

  return { model_id: model, context_tokens: ctx, last_user_message: userMessage };
}
