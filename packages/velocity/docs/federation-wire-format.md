# Federation wire format

**Status: experimental.** Velocity ships with a federation client, but there is no public velocity server. If you want federated priors, you must deploy a server that speaks this contract and point clients at it with `--endpoint https://your-server.example`.

---

## `POST /v1/tasks`

Called once per completed task when federation is enabled.

### Request

```json
{
  "category": "implement",
  "duration_seconds": 420,
  "files_changed": 3,
  "lines_added": 145,
  "lines_removed": 22,
  "model_id": "claude-opus-4-7",
  "context_tokens": 250000,
  "tests_passed_first_try": 1,
  "tags_hashed": ["1a2b3c4d5e6f7890", "aabbccddeeff0011"],
  "client_version": "0.1.3"
}
```

### Fields

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `category` | enum | no | One of `scaffold`, `implement`, `refactor`, `debug`, `test`, `config`, `docs`, `deploy`. |
| `duration_seconds` | number | no | Always > 0. |
| `files_changed` | integer | yes | From `git diff --stat`. |
| `lines_added` | integer | yes | From `git diff --stat`. |
| `lines_removed` | integer | yes | From `git diff --stat`. |
| `model_id` | string | yes | E.g. `claude-opus-4-7`. |
| `context_tokens` | integer | yes | Sum of input + cache_read + cache_creation at task end. |
| `tests_passed_first_try` | 0 \| 1 | yes | `null` when no test run was detected during the task. |
| `tags_hashed` | string[] | no | HMAC-SHA256(per-user salt, tag), 64-bit hex truncation. **Opaque across users** — a tag means nothing to the server without the user's salt. |
| `client_version` | string | no | Version of the velocity-mcp package. |

### Privacy invariant

The client enforces — via a fixed `UPLOAD_FIELD_WHITELIST` plus a runtime key sweep — that **no other field** is ever serialized into the request body. The following fields NEVER leave the machine:

- `description`, `notes`, `project`, `git_diff_stat`
- Raw tag strings (only the HMAC hash is sent)
- Task id, task start time, session id
- Calibration table, plan-model parameters, embeddings

### Response

`200 OK` on success. Any non-2xx status is logged to stderr and swallowed — the upload is fire-and-forget.

---

## `GET /v1/priors?category=X&model_id=Y`

Called when a local estimate has fewer than 3 matching historical tasks. Response is cached client-side for 1 hour.

### Query parameters

| Param | Required | Notes |
|---|---|---|
| `category` | yes | One of the 8 category enums. |
| `model_id` | no | Omit to get the cross-model aggregate. |

### Response

```json
{
  "n": 1234,
  "p25_seconds": 180,
  "median_seconds": 300,
  "p75_seconds": 480,
  "updated_at": "2026-04-19T12:00:00Z"
}
```

Any of:
- 4xx/5xx → treated as "no prior available"
- `n <= 0` → treated as "no prior available"
- missing any of `p25_seconds` / `median_seconds` / `p75_seconds` → treated as "no prior available"

---

## Mixing: how priors affect a local estimate

The client uses inverse-variance weighting in log-space:

1. Decompose each estimate into `(log_median, log_sigma)` where `log_sigma = (log(p75) - log(p25)) / 1.349` (the normal-distribution IQR factor).
2. Precision = `n / sigma²` for each side.
3. Combined mean = `(prec_L * log_median_L + prec_F * log_median_F) / (prec_L + prec_F)`.
4. Local always contributes **at least ~33%** of the final weight — a user's own data can never be fully overwritten by the prior.
5. Confidence can only upgrade, never downgrade.

---

## Server implementation notes

A minimal server only needs:

- Append-only store for `POST /v1/tasks` payloads.
- A periodic aggregation job that computes per-`(category, model_id)` percentiles.
- A cache for `GET /v1/priors` responses.

You do **not** need authentication for v1 — the data is anonymous and tags are opaque. Add rate limiting by source IP to protect against spam.

You do **not** get user-specific insight back into a user — the server can't identify anyone across sessions because there's no stable user id in the payload.
