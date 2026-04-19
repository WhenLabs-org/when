// Performance benchmark for velocity's hot paths.
//
// Run manually with:  npx tsx bench/run.ts  (or: npm run build && node dist-bench/run.js)
// Results land in bench/results.md as a diff-able snapshot. Not a CI gate —
// re-run when you suspect a regression and eyeball the numbers.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { initDb } from '../src/db/schema.js';
import { TaskQueries } from '../src/db/queries.js';
import type { Category } from '../src/types.js';
import { estimateTaskCalibrated, findSimilarTasks } from '../src/matching/similarity.js';
import { parseTask } from '../src/types.js';
import { vectorToBuffer } from '../src/matching/embedding.js';

const CATEGORIES: Category[] = ['scaffold', 'implement', 'refactor', 'debug', 'test', 'config', 'docs', 'deploy'];
const TAG_POOL = ['typescript', 'react', 'sqlite', 'api', 'auth', 'database', 'test', 'docs', 'cli', 'mcp', 'async', 'logic'];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

function seedVector(seed: number): Float32Array {
  const v = new Float32Array(384);
  for (let i = 0; i < v.length; i++) v[i] = Math.sin(seed + i) * 0.1;
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

interface BenchResult {
  name: string;
  iterations: number;
  median_ms: number;
  p95_ms: number;
  ops_per_sec: number;
}

function timeIt(iterations: number, fn: () => void): Omit<BenchResult, 'name'> {
  const samples: number[] = [];
  // Warm up
  for (let i = 0; i < Math.min(50, iterations); i++) fn();
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const total = samples.reduce((s, v) => s + v, 0);
  return { iterations, median_ms: median, p95_ms: p95, ops_per_sec: (iterations / total) * 1000 };
}

function seedTasks(queries: TaskQueries, n: number): void {
  for (let i = 0; i < n; i++) {
    const id = `t${i}`;
    const category = pick(CATEGORIES, i);
    const tags = [pick(TAG_POOL, i), pick(TAG_POOL, i + 3)];
    const description = `task ${i} doing ${category} work on ${tags.join(' ')}`;
    const startedAt = new Date(Date.now() - (n - i) * 60_000).toISOString();
    queries.insertTask(id, category, tags, description, 'bench', startedAt, 2);
    const endedAt = new Date(new Date(startedAt).getTime() + 300_000).toISOString();
    queries.endTask(id, endedAt, 300, 'completed', 2, null, 20, 5, 2, null);
    queries.setEmbedding(id, vectorToBuffer(seedVector(i)), 'bench-stub');
  }
}

function main(): void {
  console.log('Seeding 10,000 tasks into a temporary DB...');
  const dir = mkdtempSync(join(tmpdir(), 'velocity-bench-'));
  const db = initDb(join(dir, 'bench.db'));
  const queries = new TaskQueries(db);

  const seedStart = performance.now();
  seedTasks(queries, 10_000);
  const seedMs = performance.now() - seedStart;
  console.log(`Seed complete in ${seedMs.toFixed(0)} ms (${(10_000 / seedMs * 1000).toFixed(0)} rows/sec).\n`);

  const results: BenchResult[] = [];

  // --- getCompletedByCategory throughput ---
  results.push({
    name: 'getCompletedByCategory (implement)',
    ...timeIt(1000, () => { queries.getCompletedByCategory('implement'); }),
  });

  // --- findSimilarTasks scan (pure, no embeddings) ---
  const implementTasks = queries.getCompletedByCategory('implement').map(parseTask);
  results.push({
    name: `findSimilarTasks (n=${implementTasks.length}, tags-only)`,
    ...timeIt(500, () => {
      findSimilarTasks(
        { category: 'implement', tags: ['typescript', 'api'], description: 'x', estimated_files: 2 },
        implementTasks,
      );
    }),
  });

  // --- estimateTaskCalibrated end-to-end (includes calibration lookup) ---
  results.push({
    name: 'estimateTaskCalibrated',
    ...timeIt(500, () => {
      estimateTaskCalibrated(
        { category: 'implement', tags: ['typescript', 'api'], description: 'benchmark task', estimated_files: 2 },
        implementTasks,
        queries,
        'claude-opus-4-7',
      );
    }),
  });

  // --- insertTask single-row throughput ---
  let counter = 10_000;
  results.push({
    name: 'insertTask (single row)',
    ...timeIt(1000, () => {
      const id = `bench-${counter++}`;
      queries.insertTask(id, 'implement', ['x'], 'y', 'bench', new Date().toISOString(), null);
    }),
  });

  db.close();

  // ---- Summary + markdown dump ----
  console.log('\nResults:');
  console.log('');
  const widestName = Math.max(...results.map(r => r.name.length));
  for (const r of results) {
    console.log(`  ${r.name.padEnd(widestName)}  median=${r.median_ms.toFixed(3)} ms  p95=${r.p95_ms.toFixed(3)} ms  ${r.ops_per_sec.toFixed(0)}/s`);
  }

  const md = [
    '# Velocity benchmarks',
    '',
    `_Generated ${new Date().toISOString()} on Node ${process.version}, seeded with 10,000 tasks._`,
    '',
    '| Operation | iterations | median | p95 | ops/sec |',
    '|---|---:|---:|---:|---:|',
    ...results.map(r =>
      `| ${r.name} | ${r.iterations} | ${r.median_ms.toFixed(3)} ms | ${r.p95_ms.toFixed(3)} ms | ${Math.round(r.ops_per_sec).toLocaleString()} |`,
    ),
    '',
    '_Not a CI gate. Re-run whenever you suspect a regression._',
    '',
  ].join('\n');

  const mdPath = new URL('./results.md', import.meta.url).pathname;
  writeFileSync(mdPath, md, 'utf-8');
  console.log(`\nWrote ${mdPath}`);
}

main();
