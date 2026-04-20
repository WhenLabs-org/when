import type { DriftReport } from '../src/types.js';
import { scan } from '../src/commands/scan.js';
import { getReporter } from '../src/reporters/index.js';

export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
  token: string;
}

export interface ActionIo {
  getInput(name: string): string;
  info(message: string): void;
  warning(message: string): void;
  setOutput(name: string, value: string | number): void;
  setFailed(message: string): void;
  /** Returns the PR ref when the workflow is running on a pull_request event, else null. */
  getPullRequestRef(): PullRequestRef | null;
  /** Post a new PR comment or update the existing stale comment. */
  upsertPullRequestComment(ref: PullRequestRef, body: string, marker: string): Promise<void>;
}

export interface RunActionOptions {
  io: ActionIo;
  projectPath: string;
}

export type RunActionResult =
  | { kind: 'report'; report: DriftReport }
  | { kind: 'no-docs' }
  | { kind: 'failed'; reason: string };

const COMMENT_MARKER = '<!-- stale-docs-drift-report -->';

function parseFailOn(raw: string): 'error' | 'warning' | 'never' {
  if (raw === 'warning' || raw === 'never') return raw;
  return 'error';
}

function parseFormat(raw: string): 'terminal' | 'json' | 'markdown' {
  if (raw === 'json' || raw === 'markdown') return raw;
  return 'terminal';
}

export async function runAction({ io, projectPath }: RunActionOptions): Promise<RunActionResult> {
  try {
    const failOn = parseFailOn(io.getInput('fail-on') || 'error');
    const shouldComment = io.getInput('comment') !== 'false';
    const configPath = io.getInput('config') || undefined;
    const format = parseFormat(io.getInput('format') || 'markdown');

    const outcome = await scan({
      path: projectPath,
      format,
      config: configPath,
    });

    if (outcome.kind === 'no-docs') {
      io.info('No documentation files found. Nothing to check.');
      return { kind: 'no-docs' };
    }

    const { report } = outcome;
    const reporter = getReporter(format);
    io.info(reporter.render(report));

    io.setOutput('errors', report.summary.errors);
    io.setOutput('warnings', report.summary.warnings);
    io.setOutput('passed', report.summary.passed);

    if (shouldComment) {
      const prRef = io.getPullRequestRef();
      if (prRef) {
        const body = `${COMMENT_MARKER}\n${getReporter('markdown').render(report)}`;
        try {
          await io.upsertPullRequestComment(prRef, body, COMMENT_MARKER);
        } catch (err) {
          io.warning(`Failed to post PR comment: ${(err as Error).message}`);
        }
      }
    }

    if (failOn === 'error' && report.summary.errors > 0) {
      io.setFailed(`Documentation drift detected: ${report.summary.errors} errors found`);
    } else if (failOn === 'warning' && (report.summary.errors > 0 || report.summary.warnings > 0)) {
      io.setFailed(`Documentation drift detected: ${report.summary.errors} errors, ${report.summary.warnings} warnings`);
    }

    return { kind: 'report', report };
  } catch (error: unknown) {
    const reason = (error as Error).message ?? 'unknown error';
    io.setFailed(`Stale action failed: ${reason}`);
    return { kind: 'failed', reason };
  }
}
