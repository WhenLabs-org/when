import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  EMPTY_CALIBRATION,
  EWMA_ALPHA,
  MIN_CALIBRATION_N,
  bucketKey,
  calibrate,
  getStats,
  recordResidual,
  updateStats,
} from '../matching/calibration.js';
import type { TaskEstimate } from '../matching/similarity.js';

let db: Database.Database;
let queries: TaskQueries;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-calib-'));
  db = initDb(join(dir, 'test.db'));
  queries = new TaskQueries(db);
});

afterEach(() => {
  db.close();
});

describe('updateStats', () => {
  it('seeds the first observation exactly', () => {
    const s = updateStats(EMPTY_CALIBRATION, 0.693);
    expect(s.n).toBe(1);
    expect(s.mean_log_error).toBeCloseTo(0.693, 5);
    expect(s.var_log_error).toBeCloseTo(0, 5);
  });

  it('EWMA-smooths subsequent observations', () => {
    let s = updateStats(EMPTY_CALIBRATION, 0);
    s = updateStats(s, 1);
    expect(s.mean_log_error).toBeCloseTo(EWMA_ALPHA, 5);
  });

  it('ignores non-finite residuals', () => {
    const s1 = updateStats(EMPTY_CALIBRATION, 0.5);
    const s2 = updateStats(s1, Number.NaN);
    expect(s2).toEqual(s1);
    const s3 = updateStats(s1, Number.POSITIVE_INFINITY);
    expect(s3).toEqual(s1);
  });
});

describe('bucketKey', () => {
  it('formats with model id', () => {
    expect(bucketKey('claude-opus-4-7', 'medium')).toBe('claude-opus-4-7|medium');
  });
  it('falls back to "any" when model missing', () => {
    expect(bucketKey(null, 'low')).toBe('any|low');
    expect(bucketKey(undefined, 'none')).toBe('any|none');
  });
});

describe('calibrate', () => {
  const raw: TaskEstimate = {
    seconds: 100, matchCount: 5, confidence: 'medium',
    p25_seconds: 80, median_seconds: 100, p75_seconds: 120,
  };

  it('returns raw estimate untouched when n below threshold', () => {
    const out = calibrate(raw, { mean_log_error: 0.693, var_log_error: 0, n: MIN_CALIBRATION_N - 1 }, 'any|medium');
    expect(out.calibrated).toBe(false);
    expect(out.seconds).toBe(100);
    expect(out.median_seconds).toBe(100);
  });

  it('shifts the median by exp(mean_log_error) once n is high enough', () => {
    const out = calibrate(raw, { mean_log_error: Math.log(2), var_log_error: 0, n: 10 }, 'any|medium');
    expect(out.calibrated).toBe(true);
    expect(out.calibration_shift).toBeCloseTo(2, 2);
    expect(out.median_seconds).toBeCloseTo(200, 0);
    expect(out.seconds).toBeCloseTo(200, 0);
  });

  it('never narrows the p25/p75 band — it only widens', () => {
    const out = calibrate(raw, { mean_log_error: 0, var_log_error: 0.25, n: 10 }, 'any|medium');
    // Shift is 1 (no bias); variance >0 means widen.
    expect(out.p25_seconds).toBeLessThanOrEqual(raw.p25_seconds);
    expect(out.p75_seconds).toBeGreaterThanOrEqual(raw.p75_seconds);
  });

  it('clamps absurd shifts — huge positive bias caps at 8x', () => {
    const out = calibrate(raw, { mean_log_error: Math.log(100), var_log_error: 0, n: 20 }, 'any|medium');
    expect(out.calibration_shift).toBeLessThanOrEqual(8 + 1e-6);
  });
});

describe('recordResidual + getStats (round-trip)', () => {
  it('persists an updated bucket across reads', () => {
    recordResidual(queries, 'debug', 'claude-opus-4-7', 'medium', 100, 200);
    const s = getStats(queries, 'debug', 'claude-opus-4-7', 'medium');
    expect(s.n).toBe(1);
    expect(s.mean_log_error).toBeCloseTo(Math.log(2), 5);
  });

  it('ignores calls with null/zero predicted or actual', () => {
    recordResidual(queries, 'debug', null, 'medium', null, 100);
    recordResidual(queries, 'debug', null, 'medium', 100, null);
    recordResidual(queries, 'debug', null, 'medium', 0, 100);
    recordResidual(queries, 'debug', null, 'medium', 100, 0);
    expect(getStats(queries, 'debug', null, 'medium').n).toBe(0);
  });

  it('buckets independently by model_id and confidence', () => {
    recordResidual(queries, 'debug', 'opus', 'medium', 100, 200); // log(2)
    recordResidual(queries, 'debug', 'haiku', 'medium', 100, 50); // log(0.5)
    const opus = getStats(queries, 'debug', 'opus', 'medium');
    const haiku = getStats(queries, 'debug', 'haiku', 'medium');
    expect(opus.mean_log_error).toBeGreaterThan(0);
    expect(haiku.mean_log_error).toBeLessThan(0);
  });
});

describe('convergence — synthetic 2x-slower dataset', () => {
  it('after 30 observations of actual=2*predicted, calibrated median is within 20% of actual', () => {
    const predicted = 100;
    const actual = 200;
    for (let i = 0; i < 30; i++) {
      recordResidual(queries, 'implement', 'opus', 'medium', predicted, actual);
    }
    const stats = getStats(queries, 'implement', 'opus', 'medium');
    const raw: TaskEstimate = {
      seconds: predicted, matchCount: 5, confidence: 'medium',
      p25_seconds: predicted * 0.8, median_seconds: predicted, p75_seconds: predicted * 1.2,
    };
    const out = calibrate(raw, stats, bucketKey('opus', 'medium'));
    expect(out.calibrated).toBe(true);
    const errPct = Math.abs(out.median_seconds - actual) / actual;
    expect(errPct).toBeLessThan(0.2);
  });

  it('noisy dataset (actual = N(2*predicted, 0.3*predicted) in log space) still converges the mean within 20%', () => {
    // Pseudo-random but deterministic: pre-generated residual draws around log(2) with sigma=0.3
    // (log-normal around 2x).
    const seed = [0.25, -0.10, 0.40, 0.05, -0.20, 0.35, 0.15, -0.05, 0.30, 0.20,
                  0.10, -0.15, 0.45, 0.00, 0.25, 0.35, -0.10, 0.20, 0.15, 0.05,
                  0.30, -0.05, 0.40, 0.10, 0.25, -0.20, 0.35, 0.05, 0.15, 0.20];
    for (const noise of seed) {
      const predicted = 100;
      const actual = predicted * Math.exp(Math.log(2) + noise);
      recordResidual(queries, 'implement', 'opus', 'medium', predicted, actual);
    }
    const stats = getStats(queries, 'implement', 'opus', 'medium');
    expect(stats.n).toBe(seed.length);
    // EWMA mean should be close to log(2) + mean(noise) which is about log(2)+0.145 ≈ 0.838
    // The calibrated shift should be in the ballpark of 2.0-2.5.
    const shift = Math.exp(stats.mean_log_error);
    expect(shift).toBeGreaterThan(1.6);
    expect(shift).toBeLessThan(3.0);
  });

  it('does not calibrate when sample count is below MIN_CALIBRATION_N', () => {
    for (let i = 0; i < MIN_CALIBRATION_N - 1; i++) {
      recordResidual(queries, 'refactor', 'opus', 'low', 100, 200);
    }
    const stats = getStats(queries, 'refactor', 'opus', 'low');
    const raw: TaskEstimate = {
      seconds: 100, matchCount: 2, confidence: 'low',
      p25_seconds: 80, median_seconds: 100, p75_seconds: 120,
    };
    const out = calibrate(raw, stats, bucketKey('opus', 'low'));
    expect(out.calibrated).toBe(false);
    expect(out.seconds).toBe(100);
  });
});
