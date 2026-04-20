import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAction, type ActionIo, type PullRequestRef } from '../../action/run.js';

const FIXTURE_PATH = resolve(import.meta.dirname, '../fixtures/sample-project');

interface Recorder {
  inputs: Record<string, string>;
  infos: string[];
  warnings: string[];
  outputs: Record<string, string | number>;
  failed: string | null;
  prRef: PullRequestRef | null;
  commentCalls: { ref: PullRequestRef; body: string; marker: string }[];
  commentError?: Error;
}

function makeIo(rec: Recorder): ActionIo {
  return {
    getInput: (name) => rec.inputs[name] ?? '',
    info: (m) => { rec.infos.push(m); },
    warning: (m) => { rec.warnings.push(m); },
    setOutput: (name, value) => { rec.outputs[name] = value; },
    setFailed: (m) => { rec.failed = m; },
    getPullRequestRef: () => rec.prRef,
    upsertPullRequestComment: async (ref, body, marker) => {
      if (rec.commentError) throw rec.commentError;
      rec.commentCalls.push({ ref, body, marker });
    },
  };
}

function baseRec(): Recorder {
  return {
    inputs: {},
    infos: [],
    warnings: [],
    outputs: {},
    failed: null,
    prRef: null,
    commentCalls: [],
  };
}

describe('runAction', () => {
  it('returns no-docs for an empty project', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stale-action-'));
    try {
      const rec = baseRec();
      const result = await runAction({ io: makeIo(rec), projectPath: dir });
      expect(result.kind).toBe('no-docs');
      expect(rec.infos.some((m) => m.includes('No documentation'))).toBe(true);
      expect(rec.failed).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('scans the sample fixture, sets outputs, and fails on errors by default', async () => {
    const rec = baseRec();
    rec.inputs = { 'fail-on': 'error' };
    const result = await runAction({ io: makeIo(rec), projectPath: FIXTURE_PATH });

    expect(result.kind).toBe('report');
    if (result.kind !== 'report') return;
    expect(result.report.summary.errors).toBeGreaterThan(0);
    expect(rec.outputs.errors).toBe(result.report.summary.errors);
    expect(rec.outputs.warnings).toBe(result.report.summary.warnings);
    expect(rec.outputs.passed).toBe(result.report.summary.passed);
    expect(rec.failed).toMatch(/errors found/);
  });

  it('does not fail when fail-on=never even with errors present', async () => {
    const rec = baseRec();
    rec.inputs = { 'fail-on': 'never' };
    await runAction({ io: makeIo(rec), projectPath: FIXTURE_PATH });
    expect(rec.failed).toBeNull();
  });

  it('fails on warnings when fail-on=warning', async () => {
    const rec = baseRec();
    rec.inputs = { 'fail-on': 'warning' };
    await runAction({ io: makeIo(rec), projectPath: FIXTURE_PATH });
    expect(rec.failed).toMatch(/warnings/);
  });

  it('posts a PR comment with the marker when a PR ref is present', async () => {
    const rec = baseRec();
    rec.inputs = { 'fail-on': 'never' };
    rec.prRef = { owner: 'o', repo: 'r', number: 42, token: 't' };
    await runAction({ io: makeIo(rec), projectPath: FIXTURE_PATH });
    expect(rec.commentCalls).toHaveLength(1);
    expect(rec.commentCalls[0].body).toContain('<!-- stale-docs-drift-report -->');
    expect(rec.commentCalls[0].body).toContain('Stale: Documentation Drift Report');
  });

  it('skips the PR comment when comment=false', async () => {
    const rec = baseRec();
    rec.inputs = { 'comment': 'false', 'fail-on': 'never' };
    rec.prRef = { owner: 'o', repo: 'r', number: 1, token: 't' };
    await runAction({ io: makeIo(rec), projectPath: FIXTURE_PATH });
    expect(rec.commentCalls).toHaveLength(0);
  });

  it('warns but does not fail the job when comment posting throws', async () => {
    const rec = baseRec();
    rec.inputs = { 'fail-on': 'never' };
    rec.prRef = { owner: 'o', repo: 'r', number: 1, token: 't' };
    rec.commentError = new Error('403 Forbidden');
    await runAction({ io: makeIo(rec), projectPath: FIXTURE_PATH });
    expect(rec.warnings.some((w) => w.includes('403 Forbidden'))).toBe(true);
    expect(rec.failed).toBeNull();
  });

});
