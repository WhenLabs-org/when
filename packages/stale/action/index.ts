import { resolve } from 'node:path';
import { runAction, type ActionIo, type PullRequestRef } from './run.js';

async function buildIo(): Promise<ActionIo> {
  const core = await import('@actions/core');
  const github = await import('@actions/github');

  const getPullRequestRef = (): PullRequestRef | null => {
    const pr = github.context.payload.pull_request;
    if (!pr) return null;
    const token = process.env.GITHUB_TOKEN || core.getInput('github-token');
    if (!token) return null;
    return {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      number: pr.number,
      token,
    };
  };

  const upsertPullRequestComment: ActionIo['upsertPullRequestComment'] = async (ref, body, marker) => {
    const octokit = github.getOctokit(ref.token);
    const { data: comments } = await octokit.rest.issues.listComments({
      owner: ref.owner,
      repo: ref.repo,
      issue_number: ref.number,
    });
    const existing = comments.find((c) => typeof c.body === 'string' && c.body.includes(marker));
    if (existing) {
      await octokit.rest.issues.updateComment({
        owner: ref.owner,
        repo: ref.repo,
        comment_id: existing.id,
        body,
      });
    } else {
      await octokit.rest.issues.createComment({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.number,
        body,
      });
    }
  };

  return {
    getInput: (name) => core.getInput(name),
    info: (msg) => core.info(msg),
    warning: (msg) => core.warning(msg),
    setOutput: (name, value) => core.setOutput(name, value),
    setFailed: (msg) => core.setFailed(msg),
    getPullRequestRef,
    upsertPullRequestComment,
  };
}

async function main(): Promise<void> {
  const projectPath = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  try {
    const io = await buildIo();
    await runAction({ io, projectPath });
  } catch (error: unknown) {
    // If @actions/* itself failed to load, fall back to console + non-zero exit
    console.error(`Stale action bootstrap failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

main();
