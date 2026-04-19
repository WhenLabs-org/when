import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TaskQueries } from '../db/queries.js';
import { STATUSES, formatDuration, parseTask } from '../types.js';
import { findSimilarTasks, weightedMedian } from '../matching/similarity.js';
import { recordResidual } from '../matching/calibration.js';
import {
  getDefaultEmbedder,
  taskEmbeddingText,
  tryEmbed,
  vectorToBuffer,
} from '../matching/embedding.js';
import { maybeCompletePlan } from '../matching/plan-model.js';
import { uploadIfEnabled } from '../federation/client.js';

const execFileAsync = promisify(execFile);

interface GitDiffStats {
  lines_added: number;
  lines_removed: number;
  files_changed: number;
  raw_stat: string;
  commits_since_start: number | null;
}

async function captureGitDiffStats(startedAt?: string): Promise<GitDiffStats | null> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD~1'], {
      timeout: 5000,
    });
    if (!stdout.trim()) return null;

    const lines = stdout.trim().split('\n');
    const summaryLine = lines[lines.length - 1];
    // e.g. " 3 files changed, 42 insertions(+), 10 deletions(-)"
    const filesMatch = summaryLine.match(/(\d+)\s+files?\s+changed/);
    const insertMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
    const deleteMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);

    let commitsSinceStart: number | null = null;
    if (startedAt) {
      try {
        const { stdout: logOut } = await execFileAsync('git', ['log', '--since', startedAt, '--oneline'], {
          timeout: 5000,
        });
        commitsSinceStart = logOut.trim() ? logOut.trim().split('\n').length : 0;
      } catch {
        commitsSinceStart = null;
      }
    }

    const rawStat = commitsSinceStart != null && commitsSinceStart > 0
      ? `${stdout.trim()}\n(${commitsSinceStart} commit${commitsSinceStart === 1 ? '' : 's'} during task)`
      : stdout.trim();

    return {
      lines_added: insertMatch ? parseInt(insertMatch[1], 10) : 0,
      lines_removed: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
      files_changed: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      raw_stat: rawStat,
      commits_since_start: commitsSinceStart,
    };
  } catch {
    return null;
  }
}

export function registerEndTask(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_end_task',
    'Stop timing a task and record the result.',
    {
      task_id: z.string().describe('The task ID to end'),
      status: z.enum(STATUSES).describe('Outcome of the task'),
      actual_files: z.number().int().nonnegative().optional().describe('Files actually modified'),
      notes: z.string().optional().describe('Additional context'),
      tools_used: z.array(z.string()).optional().describe('Tools invoked during the task (e.g. ["Edit","Bash"])'),
      tool_call_count: z.number().int().nonnegative().optional().describe('Total tool calls during the task'),
      turn_count: z.number().int().nonnegative().optional().describe('Number of assistant turns during the task'),
      retry_count: z.number().int().nonnegative().optional().describe('Times the agent retried a failing operation'),
      tests_passed_first_try: z.boolean().optional().describe('Whether tests passed on the first run attempt'),
      model_id: z.string().optional().describe('Model running this task (if not set at start)'),
      context_tokens: z.number().int().nonnegative().optional().describe('Context size at task end (if not set at start)'),
    },
    async (args) => {
      const row = queries.getActiveTask(args.task_id);
      if (!row) {
        const exists = queries.getTask(args.task_id);
        const msg = exists
          ? `Task '${args.task_id}' has already ended`
          : `Task '${args.task_id}' not found`;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }

      const endedAt = new Date().toISOString();
      const durationSeconds = Math.max(0, (new Date(endedAt).getTime() - new Date(row.started_at).getTime()) / 1000);

      const gitStats = await captureGitDiffStats(row.started_at);

      queries.endTask(
        args.task_id, endedAt, durationSeconds, args.status,
        args.actual_files ?? null, args.notes ?? null,
        gitStats?.lines_added ?? null, gitStats?.lines_removed ?? null,
        gitStats?.files_changed ?? null, gitStats?.raw_stat ?? null,
      );

      if (
        args.tools_used != null || args.tool_call_count != null || args.turn_count != null ||
        args.retry_count != null || args.tests_passed_first_try != null ||
        args.model_id != null || args.context_tokens != null
      ) {
        queries.updateTelemetry(args.task_id, {
          toolsUsed: args.tools_used ?? null,
          toolCallCount: args.tool_call_count ?? null,
          turnCount: args.turn_count ?? null,
          retryCount: args.retry_count ?? null,
          testsPassedFirstTry: args.tests_passed_first_try == null ? null : (args.tests_passed_first_try ? 1 : 0),
          modelId: args.model_id ?? null,
          contextTokens: args.context_tokens ?? null,
        });
      }

      // Calibration feedback: re-read the task row to pick up any late-binding
      // model_id / prediction that may have been set after insert.
      if (args.status === 'completed') {
        const finalRow = queries.getTask(args.task_id);
        if (finalRow && finalRow.predicted_duration_seconds != null && finalRow.predicted_confidence) {
          try {
            recordResidual(
              queries,
              finalRow.category,
              finalRow.model_id,
              finalRow.predicted_confidence,
              finalRow.predicted_duration_seconds,
              durationSeconds,
            );
          } catch {
            // never break end_task
          }
        }

        // Semantic embedding for Phase 4 similarity. Best-effort; no throw.
        const text = taskEmbeddingText(row.description, parseTask(row).tags);
        const embedder = getDefaultEmbedder();
        const vec = await tryEmbed(embedder, text);
        if (vec) {
          try {
            queries.setEmbedding(args.task_id, vectorToBuffer(vec), embedder.modelName);
          } catch { /* ignore */ }
        }

        // Plan-level model feedback: if this task belonged to a plan_run and
        // it was the last active task in that plan, seal the plan and refit.
        if (finalRow?.parent_plan_id) {
          try { maybeCompletePlan(queries, finalRow.parent_plan_id); } catch { /* ignore */ }
        }

        // Federated upload — fire-and-forget. Only emits the privacy-whitelist
        // fields; no-op unless the user has explicitly opted in via
        // `velocity-mcp federation enable`.
        if (finalRow) {
          try { uploadIfEnabled(finalRow); } catch { /* never break end_task */ }
        }
      }

      let message = `Task ${args.status} in ${formatDuration(durationSeconds)}.`;

      if (args.status === 'completed') {
        const task = parseTask(row);
        const historicalRows = queries.getCompletedByCategory(task.category);
        const historicalTasks = historicalRows
          .filter(r => r.id !== args.task_id)
          .map(parseTask);

        if (historicalTasks.length > 0) {
          const planEmbedding = await tryEmbed(getDefaultEmbedder(), taskEmbeddingText(task.description, task.tags));
          const similar = findSimilarTasks(
            {
              category: task.category, tags: task.tags, description: task.description,
              estimated_files: task.files_estimated ?? undefined,
              embedding: planEmbedding ?? undefined,
            },
            historicalTasks,
          );
          if (similar.length > 0) {
            const historicalMedian = weightedMedian(similar);
            if (historicalMedian > 0) {
              const diff = ((durationSeconds - historicalMedian) / historicalMedian) * 100;
              const tagStr = task.tags.length > 0 ? ` + ${task.tags.join(', ')}` : '';
              if (diff < -5) {
                message += ` Historical avg for '${task.category}${tagStr}': ${formatDuration(historicalMedian)} — you were ${Math.abs(Math.round(diff))}% faster.`;
              } else if (diff > 5) {
                message += ` Historical avg for '${task.category}${tagStr}': ${formatDuration(historicalMedian)} — this was ${Math.round(diff)}% slower.`;
              } else {
                message += ` Right on pace with historical avg of ${formatDuration(historicalMedian)}.`;
              }
            }
          }
        }
      }

      const result: Record<string, unknown> = {
        task_id: args.task_id,
        duration_seconds: Math.round(durationSeconds * 10) / 10,
        duration_human: formatDuration(durationSeconds),
        category: row.category,
        tags: parseTask(row).tags,
        message,
      };

      if (gitStats) {
        result.git_diff = {
          lines_added: gitStats.lines_added,
          lines_removed: gitStats.lines_removed,
          files_changed: gitStats.files_changed,
          diff_stat: gitStats.raw_stat,
          commits_since_start: gitStats.commits_since_start,
        };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
