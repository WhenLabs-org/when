# Velocity benchmarks

_Generated 2026-04-19T18:26:49.909Z on Node v22.22.2, seeded with 10,000 tasks._

| Operation | iterations | median | p95 | ops/sec |
|---|---:|---:|---:|---:|
| getCompletedByCategory (implement) | 1000 | 12.640 ms | 18.485 ms | 73 |
| findSimilarTasks (n=1250, tags-only) | 500 | 1.003 ms | 1.618 ms | 914 |
| estimateTaskCalibrated | 500 | 1.185 ms | 1.834 ms | 779 |
| insertTask (single row) | 1000 | 0.191 ms | 0.340 ms | 3,040 |

_Not a CI gate. Re-run whenever you suspect a regression._
