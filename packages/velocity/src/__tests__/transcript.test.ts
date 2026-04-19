import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readTranscriptSummary,
  resetTranscriptFormatState,
  sanitizeUserMessage,
  TRANSCRIPT_DETECTION_VERSION,
} from '../cli/transcript.js';
import { beforeEach } from 'vitest';

beforeEach(() => resetTranscriptFormatState());

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-transcript-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('readTranscriptSummary', () => {
  it('returns nulls for undefined path', () => {
    expect(readTranscriptSummary(undefined)).toEqual({ model_id: null, context_tokens: null, last_user_message: null });
  });

  it('returns nulls for a missing file', () => {
    expect(readTranscriptSummary('/does/not/exist.jsonl')).toEqual({ model_id: null, context_tokens: null, last_user_message: null });
  });

  it('extracts model and summed context tokens from the last assistant line', () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { content: 'hi' } }),
      JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5 },
        },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-opus-4-7',
          usage: { input_tokens: 20, cache_read_input_tokens: 200, cache_creation_input_tokens: 15 },
        },
      }),
    ];
    const path = tmpFile('session.jsonl', lines.join('\n') + '\n');
    const out = readTranscriptSummary(path);
    expect(out.model_id).toBe('claude-opus-4-7');
    expect(out.context_tokens).toBe(235);
  });

  it('skips unparseable lines and still finds a valid assistant record', () => {
    const lines = [
      '{ not json',
      JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-opus-4-7', usage: { input_tokens: 42 } },
      }),
      '{{ also not json',
    ];
    const path = tmpFile('session.jsonl', lines.join('\n'));
    const out = readTranscriptSummary(path);
    expect(out.model_id).toBe('claude-opus-4-7');
    expect(out.context_tokens).toBe(42);
  });

  it('returns nulls when no assistant message is present', () => {
    const lines = [JSON.stringify({ type: 'user', message: {} })];
    const path = tmpFile('session.jsonl', lines.join('\n'));
    const out = readTranscriptSummary(path);
    expect(out.model_id).toBeNull();
    expect(out.context_tokens).toBeNull();
  });

  it('leaves context_tokens null when usage fields are all zero or missing', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-opus-4-7' },
    });
    const path = tmpFile('session.jsonl', line);
    const out = readTranscriptSummary(path);
    expect(out.model_id).toBe('claude-opus-4-7');
    expect(out.context_tokens).toBeNull();
  });

  it('extracts the most recent user message when content is a plain string', () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { content: 'fix the login bug' } }),
      JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-7' } }),
    ];
    const path = tmpFile('session.jsonl', lines.join('\n') + '\n');
    const out = readTranscriptSummary(path);
    expect(out.last_user_message).toBe('fix the login bug');
    expect(out.model_id).toBe('claude-opus-4-7');
  });

  it('prefers the most recent user message when there are several', () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { content: 'old request' } }),
      JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-7' } }),
      JSON.stringify({ type: 'user', message: { content: 'the latest request' } }),
    ];
    const path = tmpFile('session.jsonl', lines.join('\n') + '\n');
    expect(readTranscriptSummary(path).last_user_message).toBe('the latest request');
  });

  it('extracts text from SDK-style array content', () => {
    const line = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'text', text: 'refactor the auth middleware' }] },
    });
    const path = tmpFile('session.jsonl', line + '\n');
    expect(readTranscriptSummary(path).last_user_message).toBe('refactor the auth middleware');
  });

  it('skips tool_result blocks and picks the text block', () => {
    const line = JSON.stringify({
      type: 'user',
      message: { content: [
        { type: 'tool_result', tool_use_id: 'x', content: 'should be skipped' },
        { type: 'text', text: 'add a dark mode toggle' },
      ] },
    });
    const path = tmpFile('session.jsonl', line + '\n');
    expect(readTranscriptSummary(path).last_user_message).toBe('add a dark mode toggle');
  });

  it('truncates very long user messages to 500 chars with an ellipsis', () => {
    const huge = 'a'.repeat(2000);
    const line = JSON.stringify({ type: 'user', message: { content: huge } });
    const path = tmpFile('session.jsonl', line + '\n');
    const out = readTranscriptSummary(path).last_user_message!;
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('format resilience', () => {
  it('extracts model from a flattened `model` key (not under message.model)', () => {
    const line = JSON.stringify({ type: 'assistant', model: 'claude-opus-5', usage: { input_tokens: 99 } });
    const path = tmpFile('session.jsonl', line + '\n');
    const out = readTranscriptSummary(path);
    expect(out.model_id).toBe('claude-opus-5');
    expect(out.context_tokens).toBe(99);
  });

  it('extracts user text from a flattened `content` key', () => {
    const line = JSON.stringify({ type: 'user', content: 'straight content' });
    const path = tmpFile('session.jsonl', line + '\n');
    expect(readTranscriptSummary(path).last_user_message).toBe('straight content');
  });

  it('emits a single stderr warning and disables further reads when no known type is found', () => {
    const lines = [
      JSON.stringify({ type: 'system', note: 'something' }),
      JSON.stringify({ type: 'tool_use', id: 'x' }),
    ];
    const path = tmpFile('session.jsonl', lines.join('\n') + '\n');
    const errs: string[] = [];
    const origWrite = process.stderr.write;
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (s: string) => { errs.push(s); return true; };
    try {
      readTranscriptSummary(path);
      // Second call should already be disabled — no second warning.
      readTranscriptSummary(path);
    } finally {
      (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    }
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain('transcript format unrecognized');
    expect(errs[0]).toContain(`v${TRANSCRIPT_DETECTION_VERSION}`);
  });

  it('does not warn when the file is simply empty or unreadable', () => {
    const errs: string[] = [];
    const origWrite = process.stderr.write;
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (s: string) => { errs.push(s); return true; };
    try {
      readTranscriptSummary('/nonexistent.jsonl');
      readTranscriptSummary(tmpFile('empty.jsonl', ''));
    } finally {
      (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    }
    expect(errs).toEqual([]);
  });
});

describe('sanitizeUserMessage', () => {
  it('collapses whitespace', () => {
    expect(sanitizeUserMessage('  hi   there\n\nfriend  ')).toBe('hi there friend');
  });
  it('strips a leading slash command and keeps the rest', () => {
    expect(sanitizeUserMessage('/mode fix the bug')).toBe('fix the bug');
  });
  it('returns empty for a bare slash command', () => {
    expect(sanitizeUserMessage('/clear')).toBe('');
  });
});
