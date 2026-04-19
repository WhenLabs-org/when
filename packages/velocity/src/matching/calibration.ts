import type { TaskQueries } from '../db/queries.js';
import type { Confidence, CalibrationRow } from '../types.js';
import type { TaskEstimate } from './similarity.js';

// EWMA smoothing factor. Higher = faster adaptation, but noisier.
// α=0.1 gives an effective memory of ~10 samples, which matches our
// 10-sample threshold for 'high' confidence.
export const EWMA_ALPHA = 0.1;

// Below this sample count we don't trust the bucket enough to apply
// calibration. Predictions fall back to the raw estimator.
export const MIN_CALIBRATION_N = 3;

// Inverse-CDF factor for a 50% interval (p25/p75) under a normal distribution.
// If log-residuals are ~N(μ,σ²) then p25/p75 in log-space sit at μ ± 0.6745σ.
export const Z_IQR_HALF = 0.6745;

// Hard ceiling on the shift factor we're willing to apply — prevents a
// runaway calibration from blowing up estimates by 10×. Covers log(8) ≈ 2.08.
const MAX_ABS_LOG_SHIFT = Math.log(8);

// Hard ceiling on the stddev we'll use to widen the band. Above this the
// signal is too noisy to meaningfully narrow our uncertainty.
const MAX_STDDEV_LOG = Math.log(4);

export function bucketKey(modelId: string | null | undefined, confidence: Confidence): string {
  return `${modelId ?? 'any'}|${confidence}`;
}

export interface CalibrationStats {
  mean_log_error: number;
  var_log_error: number;
  n: number;
}

export const EMPTY_CALIBRATION: CalibrationStats = {
  mean_log_error: 0,
  var_log_error: 0,
  n: 0,
};

/**
 * Update an EWMA-smoothed estimate of the mean and variance of log-residuals.
 * Uses the standard exponentially-weighted Welford recurrence.
 */
export function updateStats(prev: CalibrationStats, residual: number): CalibrationStats {
  if (!Number.isFinite(residual)) return prev;
  if (prev.n === 0) {
    return { mean_log_error: residual, var_log_error: 0, n: 1 };
  }
  const delta = residual - prev.mean_log_error;
  const meanNew = prev.mean_log_error + EWMA_ALPHA * delta;
  const varNew = (1 - EWMA_ALPHA) * (prev.var_log_error + EWMA_ALPHA * delta * delta);
  return {
    mean_log_error: meanNew,
    var_log_error: varNew,
    n: prev.n + 1,
  };
}

export interface CalibratedEstimate extends TaskEstimate {
  calibrated: boolean;
  calibration_shift: number; // multiplicative factor applied to the median
  calibration_bucket: string;
}

/**
 * Apply bucket calibration to a raw estimate. Shifts the median by the
 * historical mean log-residual and widens the p25/p75 band to cover the
 * bucket's residual spread (band can only widen, never narrow).
 */
export function calibrate(
  raw: TaskEstimate,
  stats: CalibrationStats,
  bucketName: string,
): CalibratedEstimate {
  const base: CalibratedEstimate = {
    ...raw,
    calibrated: false,
    calibration_shift: 1,
    calibration_bucket: bucketName,
  };

  if (stats.n < MIN_CALIBRATION_N || raw.seconds <= 0) return base;

  const clampedMean = Math.max(-MAX_ABS_LOG_SHIFT, Math.min(MAX_ABS_LOG_SHIFT, stats.mean_log_error));
  const stddev = Math.min(MAX_STDDEV_LOG, Math.sqrt(Math.max(0, stats.var_log_error)));
  const shift = Math.exp(clampedMean);
  const bandFactor = Math.exp(Z_IQR_HALF * stddev);

  const median = raw.median_seconds * shift;
  const seconds = raw.seconds * shift;
  // Widen only — never let calibration narrow the raw spread.
  const p25 = Math.min(raw.p25_seconds * shift, median / bandFactor);
  const p75 = Math.max(raw.p75_seconds * shift, median * bandFactor);

  return {
    ...base,
    seconds: Math.round(seconds),
    median_seconds: Math.round(median),
    p25_seconds: Math.round(p25),
    p75_seconds: Math.round(p75),
    calibrated: true,
    calibration_shift: shift,
  };
}

/**
 * Record the observed residual for a completed task into its bucket.
 * Residual is log(actual / predicted): positive = we under-estimated.
 * No-op if predicted is missing or zero, or actual is zero/negative.
 */
export function recordResidual(
  queries: TaskQueries,
  category: string,
  modelId: string | null,
  confidence: Confidence,
  predictedSeconds: number | null,
  actualSeconds: number | null,
): void {
  if (predictedSeconds == null || predictedSeconds <= 0) return;
  if (actualSeconds == null || actualSeconds <= 0) return;

  const residual = Math.log(actualSeconds / predictedSeconds);
  if (!Number.isFinite(residual)) return;

  const bucket = bucketKey(modelId, confidence);
  const prev = queries.getCalibration(category, bucket);
  const prevStats: CalibrationStats = prev
    ? { mean_log_error: prev.mean_log_error, var_log_error: prev.var_log_error, n: prev.n }
    : EMPTY_CALIBRATION;

  const next = updateStats(prevStats, residual);

  const row: CalibrationRow = {
    category,
    bucket,
    mean_log_error: next.mean_log_error,
    var_log_error: next.var_log_error,
    n: next.n,
    updated_at: new Date().toISOString(),
  };
  queries.upsertCalibration(row);
}

/** Look up stats for a bucket; returns EMPTY_CALIBRATION when unseen. */
export function getStats(
  queries: TaskQueries,
  category: string,
  modelId: string | null | undefined,
  confidence: Confidence,
): CalibrationStats {
  const row = queries.getCalibration(category, bucketKey(modelId, confidence));
  return row
    ? { mean_log_error: row.mean_log_error, var_log_error: row.var_log_error, n: row.n }
    : EMPTY_CALIBRATION;
}
