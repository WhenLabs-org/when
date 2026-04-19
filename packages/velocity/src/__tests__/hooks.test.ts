import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  inferCategoryFromPath,
  shouldReuseTask,
  handlePreToolUse,
  handlePostToolUse,
  handleStop,
  reapOrphanTasks,
  getSessionState,
  MERGE_WINDOW_MS,
  ORPHAN_AGE_MS,
} from '../cli/hooks.js';
import { installHooks, uninstallHooks, HOOK_MARKER } from '../cli/hooks-settings.js';
import { setDefaultEmbedder, type Embedder } from '../matching/embedding.js';

// Tests must not load the real 25 MB transformer model. Route the embedding
// path to a stub that always fails — tryEmbed() will catch and return null,
// exercising the Jaccard fallback throughout the hooks layer.
const failingEmbedder: Embedder = {
  modelName: 'test-stub',
  async embed() { throw new Error('embedder disabled in tests'); },
};

let db: Database.Database;
let queries: TaskQueries;
let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'velocity-hooks-'));
  db = initDb(join(tmp, 'test.db'));
  queries = new TaskQueries(db);
  setDefaultEmbedder(failingEmbedder);
});

afterEach(() => {
  setDefaultEmbedder(null);
  db.close();
});

describe('inferCategoryFromPath', () => {
  it.each([
    ['src/foo/bar.test.ts', 'test'],
    ['src/foo/bar.spec.tsx', 'test'],
    ['__tests__/whatever.ts', 'test'],
    ['pkg/tests/unit.py', 'test'],
    ['README.md', 'docs'],
    ['docs/intro.mdx', 'docs'],
    ['CHANGELOG', 'docs'],
    ['package.json', 'config'],
    ['tsconfig.json', 'config'],
    ['.eslintrc', 'config'],
    ['Dockerfile', 'config'],
    ['config.yaml', 'config'],
    ['src/index.ts', 'implement'],
    [undefined, 'implement'],
  ])('%s -> %s', (input, expected) => {
    expect(inferCategoryFromPath(input as string | undefined)).toBe(expected);
  });
});

describe('shouldReuseTask', () => {
  it('true when last activity is within merge window', () => {
    const now = new Date('2026-01-01T00:00:30Z');
    const state = {
      task_id: 't1',
      last_activity_at: '2026-01-01T00:00:00Z',
      tool_call_count: 0,
      first_edit_offset_seconds: null,
      tools_used: [],
    };
    expect(shouldReuseTask(state, now)).toBe(true);
  });
  it('false when last activity is past merge window', () => {
    const now = new Date(new Date('2026-01-01T00:00:00Z').getTime() + MERGE_WINDOW_MS + 1000);
    const state = {
      task_id: 't1',
      last_activity_at: '2026-01-01T00:00:00Z',
      tool_call_count: 0,
      first_edit_offset_seconds: null,
      tools_used: [],
    };
    expect(shouldReuseTask(state, now)).toBe(false);
  });
  it('false when no state', () => {
    expect(shouldReuseTask(null, new Date())).toBe(false);
  });
});

describe('handlePreToolUse', () => {
  it('starts a new auto task for an Edit on session with no state', () => {
    const r = handlePreToolUse(
      {
        session_id: 's1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: 'src/foo.ts' },
      },
      { queries },
    );
    expect(r?.task_id).toBeTruthy();
    const row = queries.getTask(r!.task_id)!;
    expect(row.category).toBe('implement');
    expect(JSON.parse(row.tags)).toContain('auto');
    expect(row.ended_at).toBeNull();
    const state = getSessionState(queries, 's1')!;
    expect(state.task_id).toBe(r!.task_id);
  });

  it('reuses the active task when a second edit arrives within the merge window', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const r1 = handlePreToolUse(
      {
        session_id: 's1', tool_name: 'Edit',
        tool_input: { file_path: 'src/a.ts' },
      },
      { queries, now: () => t0 },
    );
    const r2 = handlePreToolUse(
      {
        session_id: 's1', tool_name: 'Write',
        tool_input: { file_path: 'src/b.ts' },
      },
      { queries, now: () => new Date(t0.getTime() + 30_000) },
    );
    expect(r2?.task_id).toBe(r1?.task_id);
  });

  it('starts a new task when activity gap exceeds merge window', async () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const r1 = handlePreToolUse(
      { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } },
      { queries, now: () => t0 },
    );
    // End the first task to simulate a stop between bursts.
    await handleStop({ session_id: 's1' }, { queries, now: () => new Date(t0.getTime() + 1000) });
    const r2 = handlePreToolUse(
      { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'src/b.ts' } },
      { queries, now: () => new Date(t0.getTime() + MERGE_WINDOW_MS + 10_000) },
    );
    expect(r2?.task_id).not.toBe(r1?.task_id);
  });

  it('ignores non-edit tools', () => {
    const r = handlePreToolUse(
      { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls' } },
      { queries },
    );
    expect(r).toBeNull();
    expect(getSessionState(queries, 's1')).toBeNull();
  });

  it('categorizes a test file as test', () => {
    const r = handlePreToolUse(
      { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'src/foo.test.ts' } },
      { queries },
    );
    const row = queries.getTask(r!.task_id)!;
    expect(row.category).toBe('test');
  });
});

describe('handlePostToolUse', () => {
  it('increments tool_call_count and appends tools_used', () => {
    const r = handlePreToolUse(
      { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'a.ts' } },
      { queries },
    );
    handlePostToolUse({ session_id: 's1', tool_name: 'Edit' }, { queries });
    handlePostToolUse({ session_id: 's1', tool_name: 'Bash' }, { queries });
    const state = getSessionState(queries, 's1')!;
    expect(state.tool_call_count).toBe(2);
    expect(state.tools_used).toEqual(expect.arrayContaining(['Edit', 'Bash']));
    const row = queries.getTask(r!.task_id)!;
    expect(row.tool_call_count).toBe(2);
  });

  it('records tests_passed_first_try=1 on a successful test Bash call', () => {
    const r = handlePreToolUse(
      { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'a.ts' } },
      { queries },
    );
    handlePostToolUse(
      {
        session_id: 's1', tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { exit_code: 0 },
      },
      { queries },
    );
    const row = queries.getTask(r!.task_id)!;
    expect(row.tests_passed_first_try).toBe(1);
  });

  it('records tests_passed_first_try=0 on a failing test run and does not overwrite on retry', () => {
    const r = handlePreToolUse(
      { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'a.ts' } },
      { queries },
    );
    handlePostToolUse(
      {
        session_id: 's1', tool_name: 'Bash',
        tool_input: { command: 'vitest' },
        tool_response: { exit_code: 1 },
      },
      { queries },
    );
    handlePostToolUse(
      {
        session_id: 's1', tool_name: 'Bash',
        tool_input: { command: 'vitest' },
        tool_response: { exit_code: 0 },
      },
      { queries },
    );
    const row = queries.getTask(r!.task_id)!;
    expect(row.tests_passed_first_try).toBe(0);
  });

  it('ignores post-tool events without an active session', () => {
    handlePostToolUse({ session_id: 's9', tool_name: 'Edit' }, { queries });
    // no crash; no state created
    expect(getSessionState(queries, 's9')).toBeNull();
  });
});

describe('handlePreToolUse transcript auto-fill', () => {
  it('writes model_id and context_tokens from transcript when available', () => {
    const txPath = join(tmp, 'session.jsonl');
    writeFileSync(
      txPath,
      JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-opus-4-7',
          usage: { input_tokens: 100, cache_read_input_tokens: 500 },
        },
      }) + '\n',
    );
    const r = handlePreToolUse(
      {
        session_id: 's1',
        tool_name: 'Edit',
        tool_input: { file_path: 'src/a.ts' },
        transcript_path: txPath,
      },
      { queries },
    );
    const row = queries.getTask(r!.task_id)!;
    expect(row.model_id).toBe('claude-opus-4-7');
    expect(row.context_tokens).toBe(600);
  });

  it('does not overwrite model_id with null when transcript is missing', () => {
    const r = handlePreToolUse(
      {
        session_id: 's1', tool_name: 'Edit',
        tool_input: { file_path: 'src/a.ts' },
        transcript_path: join(tmp, 'nope.jsonl'),
      },
      { queries },
    );
    const row = queries.getTask(r!.task_id)!;
    expect(row.model_id).toBeNull();
  });
});

describe('handleStop', () => {
  it('ends the active auto task and clears state', async () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const r = handlePreToolUse(
      { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: 'a.ts' } },
      { queries, now: () => t0 },
    );
    const stopped = await handleStop({ session_id: 's1' }, { queries, now: () => new Date(t0.getTime() + 120_000) });
    expect(stopped.ended).toBe(r!.task_id);
    const row = queries.getTask(r!.task_id)!;
    expect(row.ended_at).not.toBeNull();
    expect(row.status).toBe('completed');
    expect(row.duration_seconds).toBeCloseTo(120, 0);
    expect(getSessionState(queries, 's1')).toBeNull();
  });

  it('is a no-op when there is no active state', async () => {
    const r = await handleStop({ session_id: 'nobody' }, { queries });
    expect(r.ended).toBeNull();
  });
});

describe('reapOrphanTasks', () => {
  it('marks only old un-ended tasks as abandoned', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    // Orphan: started >4h ago
    queries.insertTask('old', 'implement', [], 'old', null,
      new Date(now.getTime() - ORPHAN_AGE_MS - 1000).toISOString(), null);
    // Fresh: started 1h ago, still running
    queries.insertTask('fresh', 'implement', [], 'fresh', null,
      new Date(now.getTime() - 60 * 60 * 1000).toISOString(), null);
    // Already ended: should be untouched
    queries.insertTask('done', 'implement', [], 'done', null,
      new Date(now.getTime() - ORPHAN_AGE_MS - 5000).toISOString(), null);
    queries.endTask('done', new Date(now.getTime() - ORPHAN_AGE_MS).toISOString(), 10, 'completed', null, null);

    const reaped = reapOrphanTasks(queries, now);
    expect(reaped).toBe(1);
    expect(queries.getTask('old')!.status).toBe('abandoned');
    expect(queries.getTask('fresh')!.status).toBeNull();
    expect(queries.getTask('done')!.status).toBe('completed');
  });
});

describe('hooks-settings', () => {
  it('install writes all four events and uninstall removes them', () => {
    const settingsPath = join(tmp, 'settings.json');
    installHooks(settingsPath);
    const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(written.hooks.PreToolUse).toBeDefined();
    expect(written.hooks.PostToolUse).toBeDefined();
    expect(written.hooks.Stop).toBeDefined();
    expect(written.hooks.SessionStart).toBeDefined();
    // Matchers present
    expect(written.hooks.PreToolUse[0].matcher).toMatch(/Edit/);
    // Marker present on every entry we own
    for (const ev of Object.keys(written.hooks)) {
      for (const block of written.hooks[ev]) {
        for (const h of block.hooks) {
          expect(h[HOOK_MARKER]).toBe(true);
          expect(h.command).toContain('velocity-mcp hook');
        }
      }
    }
    uninstallHooks(settingsPath);
    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.hooks).toBeUndefined();
  });

  it('preserves unrelated user hooks on install and uninstall', () => {
    const settingsPath = join(tmp, 'settings.json');
    const userBefore = {
      theme: 'dark',
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'echo hi' }],
          },
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(userBefore, null, 2));
    installHooks(settingsPath);
    const afterInstall = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(afterInstall.theme).toBe('dark');
    expect(afterInstall.hooks.PreToolUse.find((m: { matcher?: string }) => m.matcher === 'Bash')).toBeDefined();

    uninstallHooks(settingsPath);
    const afterUninstall = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(afterUninstall.theme).toBe('dark');
    expect(afterUninstall.hooks.PreToolUse.find((m: { matcher?: string }) => m.matcher === 'Bash')).toBeDefined();
  });

  it('install is idempotent — running twice does not duplicate entries', () => {
    const settingsPath = join(tmp, 'settings.json');
    installHooks(settingsPath);
    installHooks(settingsPath);
    const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const pre = written.hooks.PreToolUse.flatMap((m: { hooks: unknown[] }) => m.hooks);
    expect(pre).toHaveLength(1);
  });

  it('uninstall handles a missing settings file gracefully', () => {
    const settingsPath = join(tmp, 'nope.json');
    expect(() => uninstallHooks(settingsPath)).not.toThrow();
    expect(existsSync(settingsPath)).toBe(false);
  });
});
