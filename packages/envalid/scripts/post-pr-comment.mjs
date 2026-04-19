#!/usr/bin/env node
// Post a sticky PR comment with envalid's validation report.
// Inputs via env:
//   GITHUB_TOKEN         required
//   GITHUB_REPOSITORY    required (e.g. "owner/repo")
//   GITHUB_REF           required (pull request context)
//   ENVALID_REPORT       required — the markdown body to post
//   ENVALID_MARKER       optional (defaults to "envalid:validation-report")

import { readFileSync } from "node:fs";

const MARKER = `<!-- ${process.env.ENVALID_MARKER ?? "envalid:validation-report"} -->`;

function extractPrNumber() {
  const ref = process.env.GITHUB_REF ?? "";
  const m = ref.match(/refs\/pull\/(\d+)\//);
  if (m) return Number(m[1]);
  if (process.env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(
        readFileSync(process.env.GITHUB_EVENT_PATH, "utf-8"),
      );
      if (event.pull_request?.number) return event.pull_request.number;
    } catch {
      /* fallthrough */
    }
  }
  return undefined;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const report = process.env.ENVALID_REPORT;
  if (!token || !repo || !report) {
    console.error(
      "post-pr-comment: missing GITHUB_TOKEN, GITHUB_REPOSITORY, or ENVALID_REPORT",
    );
    process.exit(2);
  }
  const pr = extractPrNumber();
  if (!pr) {
    console.error("post-pr-comment: could not determine PR number");
    process.exit(2);
  }
  const headers = {
    authorization: `token ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "envalid-action",
  };
  const base = `https://api.github.com/repos/${repo}/issues/${pr}`;

  const existing = await fetch(`${base}/comments?per_page=100`, { headers }).then((r) =>
    r.json(),
  );
  const body = `${MARKER}\n${report}`;
  const prior = Array.isArray(existing)
    ? existing.find((c) => typeof c.body === "string" && c.body.includes(MARKER))
    : undefined;

  if (prior) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues/comments/${prior.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body }),
      },
    );
    if (!res.ok) {
      console.error(
        `post-pr-comment: failed to patch comment: ${res.status} ${res.statusText}`,
      );
      process.exit(1);
    }
    console.log(`Updated envalid comment on PR #${pr}`);
    return;
  }

  const res = await fetch(`${base}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    console.error(
      `post-pr-comment: failed to create comment: ${res.status} ${res.statusText}`,
    );
    process.exit(1);
  }
  console.log(`Posted envalid comment on PR #${pr}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
