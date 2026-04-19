# Example GitHub Actions workflows

Drop these into `.github/workflows/` in your repository.

| File | Trigger | What it does |
|------|---------|--------------|
| [`check-on-pr.yml`](./check-on-pr.yml) | Every PR that changes a lockfile or policy | Runs `vow check --offline` against the committed `policy.lock.json`, uploads the markdown report, comments the result on the PR. No API key required. |
| [`diff-on-pr.yml`](./diff-on-pr.yml) | Every PR | Scans the base branch, scans the PR branch, diffs the two, and posts the diff as a PR comment. Surfaces license downgrades and newly-introduced copyleft deps. |
| [`sbom-on-release.yml`](./sbom-on-release.yml) | On release publish | Generates CycloneDX 1.5 and SPDX 2.3 JSON SBOMs and attaches them to the GitHub Release. |

## Required setup

For `check-on-pr.yml`:

```bash
# Once, on your dev machine:
vow policy compile          # writes policy.lock.json
git add policy.lock.json
git commit -m "chore: compile policy for CI"
```

With the lockfile committed, the action runs `vow check --offline` in CI with no ANTHROPIC_API_KEY needed.

## Permissions

All three workflows need at most:

```yaml
permissions:
  contents: read          # checkout
  pull-requests: write    # comment on PR (check-on-pr + diff-on-pr)
```

`sbom-on-release.yml` also needs `contents: write` to attach assets to the release.
