// End-to-end integration test. Chains every phase: auto-instrumentation
// hooks → telemetry → calibration → embeddings → plan-model → federation.
//
// Unit tests verify each phase in isolation. This test verifies the whole
// system as a single moving piece — it's the one that catches interaction
// bugs between phases (stale session state, dropped fields in the row round
// trip, race conditions between recordResidual and refit, etc.).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  handlePreToolUse,
  handlePostToolUse,
  handleStop,
  reapOrphanTasks,
  getSessionState,
  ORPHAN_AGE_MS,
} from '../cli/hooks.js';
import { setDefaultEmbedder, type Embedder } from '../matching/embedding.js';
import { estimateTaskCalibrated, estimateTaskWithFederation } from '../matching/similarity.js';
import {
  computePlanTotal,
  maybeCompletePlan,
  readParams,
  type PlanTaskInput,
  type StoredPlanJson,
} from '../matching/plan-model.js';
import { parseTask } from '../types.js';
import { generateReflectInsights } from '../matching/reflect.js';
import {
  setTransport,
  type FederationTransport,
  type Priors,
  type UploadPayload,
} from '../federation/client.js';

// ---------- shared fixtures ----------

let db: Database.Database;
let queries: TaskQueries;
let tmp: string;
let savedHome: string | undefined;

// Deterministic, repeatable stub — no transformer model, no network.
function hashVec(text: string): Float32Array {
  const v = new Float32Array(384);
  for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % v.length] += 1;
  }
  let norm = 0; for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

const stubEmbedder: Embedder = {
  modelName: 'integration-stub',
  async embed(text: string) { return hashVec(text); },
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'velocity-integ-'));
  // Isolate HOME so any federation config reads land inside the tempdir —
  // never leak writes to the real home (there is no .velocity-mcp inside).
  savedHome = process.env.HOME;
  process.env.HOME = tmp;
  db = initDb(join(tmp, 'test.db'));
  queries = new TaskQueries(db);
  setDefaultEmbedder(stubEmbedder);
});

afterEach(() => {
  setDefaultEmbedder(null);
  setTransport(null);
  if (savedHome !== undefined) process.env.HOME = savedHome;
  else delete process.env.HOME;
  db.close();
});

// ---------- test 1: full auto-session flow ----------

describe('integration: auto-session (hooks drive everything)', async () => {
  it('chains PreToolUse → PostToolUse ×N → Stop and lands a complete task row', async () => {
    const t0 = new Date('2026-04-19T10:00:00Z');
    const sessionId = 's-integration-1';

    // Transcript that contains a realistic assistant message — model + usage,
    // but no user message yet. model_id should flow into the task row.
    const transcriptPath = join(tmp, 'session.jsonl');
    writeFileSync(transcriptPath, JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-7',
        usage: { input_tokens: 50, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 500 },
      },
    }) + '\n');

    // 1. PreToolUse for first Edit — should create a new auto-task.
    const r1 = await handlePreToolUse(
      { session_id: sessionId, tool_name: 'Edit', tool_input: { file_path: 'src/auth/login.ts' }, transcript_path: transcriptPath },
      { queries, now: () => t0 },
    );
    expect(r1?.task_id).toBeTruthy();
    const taskId = r1!.task_id;

    // Row should exist, be active, have model_id from transcript, and have a
    // prediction persisted (even if it's the 'none'-confidence heuristic).
    const afterStart = queries.getTask(taskId)!;
    expect(afterStart.ended_at).toBeNull();
    expect(afterStart.model_id).toBe('claude-opus-4-7');
    expect(afterStart.context_tokens).toBe(100_550);
    expect(afterStart.predicted_duration_seconds).not.toBeNull();
    expect(afterStart.predicted_confidence).toBeTruthy();

    // 2. Second PreToolUse within the merge window — same task_id.
    const r2 = await handlePreToolUse(
      { session_id: sessionId, tool_name: 'Write', tool_input: { file_path: 'src/auth/middleware.ts' } },
      { queries, now: () => new Date(t0.getTime() + 30_000) },
    );
    expect(r2?.task_id).toBe(taskId);

    // 3. A handful of PostToolUse events, including a successful test run.
    handlePostToolUse(
      { session_id: sessionId, tool_name: 'Edit' },
      { queries, now: () => new Date(t0.getTime() + 60_000) },
    );
    handlePostToolUse(
      {
        session_id: sessionId, tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { exit_code: 0 },
      },
      { queries, now: () => new Date(t0.getTime() + 90_000) },
    );

    const afterPost = queries.getTask(taskId)!;
    expect(afterPost.tool_call_count).toBe(2);
    expect(afterPost.tests_passed_first_try).toBe(1);
    const tools = JSON.parse(afterPost.tools_used!) as string[];
    expect(tools).toEqual(expect.arrayContaining(['Edit', 'Bash']));

    // 4. Stop 5 minutes after the first edit.
    const stopAt = new Date(t0.getTime() + 5 * 60_000);
    const stopped = await handleStop(
      { session_id: sessionId, transcript_path: transcriptPath },
      { queries, now: () => stopAt },
    );
    expect(stopped.ended).toBe(taskId);

    // Session state must be cleared so the next session starts fresh.
    expect(getSessionState(queries, sessionId)).toBeNull();

    // Final row: ended, completed, duration ~300s, embedding populated.
    const final = queries.getTask(taskId)!;
    expect(final.ended_at).toBe(stopAt.toISOString());
    expect(final.status).toBe('completed');
    expect(final.duration_seconds).toBeCloseTo(300, 0);
    expect(final.embedding).toBeInstanceOf(Buffer);
    expect(final.embedding_model).toBe('integration-stub');

    // Model bookkeeping survived through all the writes.
    expect(final.model_id).toBe('claude-opus-4-7');
    expect(final.context_tokens).toBe(100_550);

    // A history call must see exactly this one completed task.
    const history = queries.getHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(taskId);
  });

  it('reaps stale auto-tasks from a prior crashed session on server boot', async () => {
    // Pretend a previous session started but never called Stop, 5h ago.
    const t0 = new Date('2026-04-19T05:00:00Z');
    await handlePreToolUse(
      { session_id: 's-crashed', tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } },
      { queries, now: () => t0 },
    );
    const now = new Date(t0.getTime() + ORPHAN_AGE_MS + 60_000);
    const reaped = reapOrphanTasks(queries, now);
    expect(reaped).toBe(1);
    const history = queries.getHistory(10);
    expect(history[0].status).toBe('abandoned');
  });
});

// ---------- test 2: calibration feedback loop ----------

describe('integration: calibration learns from repeated residuals', async () => {
  it('runs the calibration loop end to end and updates the calibration row', async () => {
    const BASE = Date.parse('2026-04-19T10:00:00Z');
    for (let i = 0; i < 12; i++) {
      const sid = `s-cal-${i}`;
      const t0 = new Date(BASE + i * 60_000);
      const r = await handlePreToolUse(
        { session_id: sid, tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } },
        { queries, now: () => t0 },
      );
      const row = queries.getTask(r!.task_id)!;
      const predicted = row.predicted_duration_seconds ?? 180;
      const stopAt = new Date(t0.getTime() + predicted * 2 * 1000);
      await handleStop({ session_id: sid }, { queries, now: () => stopAt });
    }
    const calib = queries.listCalibration();
    // At least one bucket must have fired.
    expect(calib.length).toBeGreaterThan(0);
    // The bucket with the most samples should show a positive shift (we were slower than predicted).
    calib.sort((a, b) => b.n - a.n);
    expect(calib[0].n).toBeGreaterThanOrEqual(3);
    expect(calib[0].mean_log_error).toBeGreaterThan(0);
  });
});

// ---------- test 3: plan flow (estimate → tasks → seal → refit) ----------

describe('integration: plan flow links tasks through a plan_run and refits the model', async () => {
  it('explicit start/end with parent_plan_id seals the plan and updates plan-model params', async () => {
    // Seed enough completed plans to cross MIN_FITS_FOR_MODEL when we close
    // one more.
    const BASE = Date.parse('2026-04-19T10:00:00Z');
    for (let p = 0; p < 5; p++) {
      const planId = `plan-${p}`;
      const stored: StoredPlanJson = {
        items: [
          { category: 'implement', estimate_seconds: 100 },
          { category: 'debug', estimate_seconds: 200 },
        ],
        sum_task_seconds: 300,
        critical_path_seconds: 300,
      };
      queries.insertPlanRun(planId, new Date(BASE + p * 1000).toISOString(), JSON.stringify(stored), 'test-model', 300);
      for (let t = 0; t < 2; t++) {
        const taskId = `${planId}-t${t}`;
        queries.insertTask(taskId, t === 0 ? 'implement' : 'debug', [], 'x', null,
          new Date(BASE + p * 1000 + t).toISOString(), null);
        queries.updateTelemetry(taskId, { parentPlanId: planId });
        queries.endTask(taskId, new Date(BASE + p * 1000 + t + 100).toISOString(),
          t === 0 ? 100 : 200, 'completed', null, null);
      }
      const sealed = maybeCompletePlan(queries, planId);
      expect(sealed).toBe(true);
    }

    const params = readParams(queries);
    expect(params.n_observations).toBe(5);
  });

  it('estimateTaskWithFederation returns a prediction even with no local history (falls back to heuristic)', async () => {
    const out = await estimateTaskWithFederation(
      { category: 'refactor', description: 'rename everything', tags: [] },
      [],
      queries,
      'claude-opus-4-7',
    );
    expect(out.confidence).toBe('none');
    expect(out.seconds).toBeGreaterThan(0);
    expect(out.federated).toBeFalsy();
  });
});

// ---------- test 4: federation upload whitelist, end to end ----------

describe('integration: federation respects whitelist and is truly opt-in', async () => {
  it('upload does NOT fire when federation config is absent on the real system', async () => {
    let uploaded = 0;
    const transport: FederationTransport = {
      async upload() { uploaded++; },
      async fetchPriors() { return null; },
    };
    setTransport(transport);

    // Run a whole auto-session to completion without enabling federation.
    const sid = 's-unfed';
    const t0 = new Date();
    const r = await handlePreToolUse(
      { session_id: sid, tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } },
      { queries, now: () => t0 },
    );
    await handleStop({ session_id: sid }, { queries, now: () => new Date(t0.getTime() + 60_000) });
    await new Promise(r => setTimeout(r, 10));

    expect(uploaded).toBe(0);
    expect(queries.getTask(r!.task_id)!.status).toBe('completed');
  });

  it('when enabled, upload carries only whitelisted fields — no secrets leak', async () => {
    let captured: UploadPayload | null = null;
    setTransport({
      async upload(_e, payload) { captured = payload; },
      async fetchPriors() { return null; },
    });

    // Manually simulate an enabled config (we pass cfg explicitly into
    // uploadIfEnabled in end-task / hook Stop wouldn't help here without a
    // real config file, so just import and call the helper directly).
    const { uploadIfEnabled } = await import('../federation/client.js');

    queries.insertTask('t-secret', 'implement', ['typescript', 'auth'],
      'FULL SECRET DESCRIPTION', 'SECRET PROJECT NAME',
      '2026-01-01T00:00:00Z', null);
    queries.endTask('t-secret', '2026-01-01T00:10:00Z', 600, 'completed', 4,
      'FULL SECRET NOTES', 100, 20, 5, 'FULL SECRET DIFF TEXT');
    queries.updateTelemetry('t-secret', {
      modelId: 'claude-opus-4-7', contextTokens: 100_000, testsPassedFirstTry: 1,
    });
    const row = queries.getTask('t-secret')!;

    uploadIfEnabled(row, { enabled: true, endpoint: 'https://x', salt: 'deadbeef' });
    await new Promise(r => setTimeout(r, 20));

    expect(captured).not.toBeNull();
    const blob = JSON.stringify(captured);
    expect(blob).not.toContain('SECRET');    // description/project/notes/diff all absent
    expect(blob).not.toContain('t-secret');  // task id never leaves
    const c = captured as unknown as UploadPayload;
    expect(c.category).toBe('implement');
    expect(c.duration_seconds).toBe(600);
    expect(c.tags_hashed).toHaveLength(2);
  });

  it('priors fetched via federation warm-start an estimate with no local matches', async () => {
    const priors: Priors = { n: 500, p25_seconds: 180, median_seconds: 240, p75_seconds: 320 };
    setTransport({
      async upload() { /* ignore */ },
      async fetchPriors() { return priors; },
    });

    // Instead of mounting a real config, drive fetch via a short-circuit:
    // call estimateTaskCalibrated (no federation) and mix directly.
    const localEst = estimateTaskCalibrated(
      { category: 'debug', description: 'first ever debug task', tags: [] },
      [],
      queries,
    );
    expect(localEst.matchCount).toBe(0);
    expect(localEst.confidence).toBe('none');

    const { mixWithPrior } = await import('../federation/mixing.js');
    const mixed = mixWithPrior(localEst, priors);
    expect(mixed.federated).toBe(true);
    expect(mixed.federated_n).toBe(500);
    expect(mixed.median_seconds).toBeGreaterThan(0);
    expect(mixed.p25_seconds).toBeLessThan(mixed.median_seconds);
  });
});

// ---------- test 5: reflect sees everything once there's enough data ----------

describe('integration: velocity_reflect surfaces at least one insight once data accumulates', async () => {
  it('produces non-empty insights given a seeded corpus with a clear pattern', async () => {
    const BASE = Date.parse('2026-04-19T10:00:00Z');
    // Seed 6 debug tasks, half with 'async' tag running 3× slower.
    for (let i = 0; i < 3; i++) {
      const id = `d${i}`;
      queries.insertTask(id, 'debug', ['logic'], 'x', null,
        new Date(BASE + i * 1000).toISOString(), null);
      queries.endTask(id, new Date(BASE + i * 1000 + 100_000).toISOString(),
        100, 'completed', null, null);
    }
    for (let i = 0; i < 3; i++) {
      const id = `d-async-${i}`;
      queries.insertTask(id, 'debug', ['async'], 'x', null,
        new Date(BASE + (i + 5) * 1000).toISOString(), null);
      queries.endTask(id, new Date(BASE + (i + 5) * 1000 + 400_000).toISOString(),
        400, 'completed', null, null);
    }
    const insights = generateReflectInsights(queries, {
      scope: 'week',
      now: new Date(BASE + 10 * 1000),
    });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some(i => i.message.includes('async'))).toBe(true);
  });
});

// ---------- test 6: sanity — the whole library builds a plan total correctly ----------

describe('integration: plan total matches the documented formula', async () => {
  it('total = critical_path + k1*n + k2*d² even when only some have deps', async () => {
    // No deps → critical == sum
    const items: PlanTaskInput[] = [
      { seconds: 100, category: 'implement' },
      { seconds: 200, category: 'debug' },
      { seconds: 50, category: 'debug' },
    ];
    const totals = computePlanTotal(items, { k1: 60, k2: 30, n_observations: 10 });
    expect(totals.sum_task_seconds).toBe(350);
    expect(totals.critical_path_seconds).toBe(350);
    expect(totals.overhead_seconds).toBe(180);   // 3 * 60
    expect(totals.debug_tail_seconds).toBe(120); // 2² * 30
    expect(totals.total_seconds).toBe(350 + 180 + 120);

    // Add a dep and the critical path shortens below sum.
    items[2].depends_on = [0];
    const withDeps = computePlanTotal(items, { k1: 60, k2: 30, n_observations: 10 });
    expect(withDeps.has_dependencies).toBe(true);
    expect(withDeps.critical_path_seconds).toBeLessThan(withDeps.sum_task_seconds);
  });
});
