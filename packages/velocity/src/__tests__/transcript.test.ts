import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTranscriptSummary } from '../cli/transcript.js';

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-transcript-'));
  const path = join(dir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('readTranscriptSummary', () => {
  it('returns nulls for undefined path', () => {
    expect(readTranscriptSummary(undefined)).toEqual({ model_id: null, context_tokens: null });
  });

  it('returns nulls for a missing file', () => {
    expect(readTranscriptSummary('/does/not/exist.jsonl')).toEqual({ model_id: null, context_tokens: null });
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
    expect(readTranscriptSummary(path)).toEqual({ model_id: null, context_tokens: null });
  });

  it('leaves context_tokens null when usage fields are all zero or missing', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-opus-4-7' },
    });
    const path = tmpFile('session.jsonl', line);
    expect(readTranscriptSummary(path)).toEqual({ model_id: 'claude-opus-4-7', context_tokens: null });
  });
});
