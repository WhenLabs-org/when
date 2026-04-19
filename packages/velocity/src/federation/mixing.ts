// Inverse-variance mixing of a thin local estimate with a federated prior.
//
// We treat durations as log-normal. The p25/p75 band implies a log-stddev via
// the normal distribution's IQR = 1.349·σ. Weighting by 1/σ² then behaves
// correctly across estimates with very different spreads.
//
// Only called when the local matchCount is below the 'medium' confidence
// threshold; otherwise the local estimate is trusted on its own.

import type { TaskEstimate } from '../matching/similarity.js';
import type { Confidence } from '../types.js';
import type { Priors } from './client.js';

const NORMAL_IQR_FACTOR = 1.349;  // p75 - p25 = 1.349σ for a normal distribution
const MIN_LOG_SIGMA = 0.05;       // floor to avoid division blow-ups
const MIN_LOCAL_WEIGHT = 0.5;     // local always contributes a little

export interface MixedEstimate extends TaskEstimate {
  federated: boolean;
  federated_n: number | null;
  local_weight: number;
  federated_weight: number;
}

function logSigmaFromIqr(p25: number, p75: number): number {
  if (p25 <= 0 || p75 <= 0 || p75 <= p25) return 0.5; // safe default
  return Math.max(MIN_LOG_SIGMA, (Math.log(p75) - Math.log(p25)) / NORMAL_IQR_FACTOR);
}

/**
 * Combine a local TaskEstimate with a federated Priors record using inverse-
 * variance weighting in log-space. Weights also scale with effective sample
 * size so that priors built from thousands of tasks beat a 1-sample local
 * estimate — but the local estimate never disappears entirely.
 */
export function mixWithPrior(local: TaskEstimate, prior: Priors): MixedEstimate {
  // Decompose each into log-median and log-sigma.
  const safeMed = Math.max(1, local.median_seconds || local.seconds || 1);
  const safePriorMed = Math.max(1, prior.median_seconds || 1);

  const muL = Math.log(safeMed);
  const sigL = logSigmaFromIqr(local.p25_seconds, local.p75_seconds);
  const nL = Math.max(1, local.matchCount);

  const muF = Math.log(safePriorMed);
  const sigF = logSigmaFromIqr(prior.p25_seconds, prior.p75_seconds);
  const nF = Math.max(1, prior.n);

  const precL = nL / (sigL * sigL);
  const precF = nF / (sigF * sigF);
  const totalPrec = precL + precF;

  // Normalise so the caller can see how much each side contributed.
  const wL = Math.max(MIN_LOCAL_WEIGHT / (MIN_LOCAL_WEIGHT + 1), precL / totalPrec);
  const wF = 1 - wL;

  const muMix = wL * muL + wF * muF;
  const sigMix = Math.sqrt(1 / totalPrec);

  const median = Math.exp(muMix);
  const p25 = Math.exp(muMix - NORMAL_IQR_FACTOR / 2 * sigMix);
  const p75 = Math.exp(muMix + NORMAL_IQR_FACTOR / 2 * sigMix);

  // Confidence: upgrade to 'medium' if the federated n is large enough,
  // otherwise keep the local confidence (never downgrade).
  const order: Confidence[] = ['none', 'low', 'medium', 'high'];
  let confidence: Confidence = local.confidence;
  if (prior.n >= 30 && order.indexOf(confidence) < order.indexOf('medium')) confidence = 'medium';

  return {
    matchCount: local.matchCount,
    confidence,
    seconds: Math.round(median),
    median_seconds: Math.round(median),
    p25_seconds: Math.round(p25),
    p75_seconds: Math.round(p75),
    federated: true,
    federated_n: prior.n,
    local_weight: Number(wL.toFixed(3)),
    federated_weight: Number(wF.toFixed(3)),
  };
}
