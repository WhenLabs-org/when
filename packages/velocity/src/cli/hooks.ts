import { v4 as uuidv4 } from 'uuid';
import type { TaskQueries } from '../db/queries.js';
import type { Category } from '../types.js';
import { parseTask } from '../types.js';
import { detectProject } from './detect-project.js';
import { readTranscriptSummary } from './transcript.js';
import { estimateTaskCalibrated } from '../matching/similarity.js';
import { recordResidual } from '../matching/calibration.js';
import {
  DEFAULT_EMBEDDING_MODEL,
  getDefaultEmbedder,
  taskEmbeddingText,
  tryEmbed,
  vectorToBuffer,
} from '../matching/embedding.js';
import { maybeCompletePlan } from '../matching/plan-model.js';
import { generateReflectInsights } from '../matching/reflect.js';
import { uploadIfEnabled } from '../federation/client.js';

// How long after the last edit in an auto-task we treat a new edit as "same task".
// Separate bursts of activity start a new task.
export const MERGE_WINDOW_MS = 60_000;

// Tasks that never ended after this long are assumed abandoned (session crashed, etc.).
export const ORPHAN_AGE_MS = 4 * 60 * 60 * 1000;

export const AUTO_TAG = 'auto';

// Tool names Claude Code emits for file-editing operations.
const EDIT_TOOL_NAMES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  cwd?: string;
  stop_hook_active?: boolean;
  transcript_path?: string;
}

export interface SessionState {
  task_id: string;
  last_activity_at: string; // ISO
  tool_call_count: number;
  first_edit_offset_seconds: number | null;
  tools_used: string[];
}

export function sessionStateKey(sessionId: string): string {
  return `auto:session:${sessionId}`;
}

export function getSessionState(queries: TaskQueries, sessionId: string): SessionState | null {
  const raw = queries.getMeta(sessionStateKey(sessionId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    if (typeof parsed.task_id !== 'string' || typeof parsed.last_activity_at !== 'string') return null;
    return {
      task_id: parsed.task_id,
      last_activity_at: parsed.last_activity_at,
      tool_call_count: parsed.tool_call_count ?? 0,
      first_edit_offset_seconds: parsed.first_edit_offset_seconds ?? null,
      tools_used: parsed.tools_used ?? [],
    };
  } catch {
    return null;
  }
}

export function setSessionState(queries: TaskQueries, sessionId: string, state: SessionState): void {
  queries.setMeta(sessionStateKey(sessionId), JSON.stringify(state));
}

export function clearSessionState(queries: TaskQueries, sessionId: string): void {
  queries.deleteMeta(sessionStateKey(sessionId));
}

// --- Category inference ------------------------------------------------------

const TEST_PATH_RE = /(^|\/)(__tests__|tests?|spec)\//i;
const TEST_NAME_RE = /\.(test|spec)\.[cm]?[jt]sx?$|\.test\.py$|_test\.py$|_spec\.rb$/i;
const DOCS_PATH_RE = /(^|\/)(docs?|documentation)\//i;
const DOCS_NAME_RE = /\.(md|mdx|rst|adoc)$|(^|\/)(readme|changelog|contributing|license)(\.[^\/]+)?$/i;
const CONFIG_NAME_RE =
  /(^|\/)(\.[^/]+|[^/]*\.(json|ya?ml|toml|ini|conf|cfg)|tsconfig[^/]*|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|dockerfile|makefile)$/i;

export function inferCategoryFromPath(filePath: string | undefined): Category {
  if (!filePath) return 'implement';
  const p = filePath.replace(/\\/g, '/');
  if (TEST_NAME_RE.test(p) || TEST_PATH_RE.test(p)) return 'test';
  if (DOCS_NAME_RE.test(p) || DOCS_PATH_RE.test(p)) return 'docs';
  if (CONFIG_NAME_RE.test(p)) return 'config';
  return 'implement';
}

export function extractFilePath(toolInput: Record<string, unknown> | undefined): string | undefined {
  if (!toolInput) return undefined;
  const candidates = ['file_path', 'filePath', 'path', 'notebook_path'];
  for (const key of candidates) {
    const v = toolInput[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

// --- Merge-window check ------------------------------------------------------

export function shouldReuseTask(state: SessionState | null, now: Date): boolean {
  if (!state) return false;
  const last = new Date(state.last_activity_at).getTime();
  return now.getTime() - last <= MERGE_WINDOW_MS;
}

// --- Hook handlers -----------------------------------------------------------

export interface HookDeps {
  queries: TaskQueries;
  now?: () => Date;
}

export function handlePreToolUse(input: HookInput, deps: HookDeps): { task_id: string } | null {
  const sessionId = input.session_id;
  const toolName = input.tool_name;
  if (!sessionId || !toolName || !EDIT_TOOL_NAMES.has(toolName)) return null;

  const { queries } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();

  const state = getSessionState(queries, sessionId);

  if (shouldReuseTask(state, now) && state) {
    const active = queries.getActiveTask(state.task_id);
    if (active) {
      const updated: SessionState = {
        ...state,
        last_activity_at: nowIso,
      };
      setSessionState(queries, sessionId, updated);
      return { task_id: state.task_id };
    }
    // Active task was ended elsewhere — fall through to start a new one.
  }

  // Start a new auto-task.
  const filePath = extractFilePath(input.tool_input);
  const category = inferCategoryFromPath(filePath);
  const taskId = uuidv4();
  const description = filePath
    ? `Auto: edits to ${filePath}`
    : `Auto: ${toolName}`;
  const tags = [AUTO_TAG, toolName.toLowerCase()];

  queries.insertTask(
    taskId,
    category,
    tags,
    description,
    detectProject(),
    nowIso,
    null,
  );

  // Best-effort: pull model / context size from the session transcript so the
  // calibration loop (Phase 3) can bucket estimates per model.
  const summary = readTranscriptSummary(input.transcript_path);
  if (summary.model_id != null || summary.context_tokens != null) {
    queries.updateTelemetry(taskId, {
      modelId: summary.model_id,
      contextTokens: summary.context_tokens,
    });
  }

  // Persist a prediction so the residual is computable at Stop. Wrapped in
  // try/catch because calibration failures must never block the agent.
  try {
    const historicalTasks = queries.getCompletedByCategory(category).map(parseTask);
    const prediction = estimateTaskCalibrated(
      { category, tags, description, estimated_files: undefined },
      historicalTasks,
      queries,
      summary.model_id ?? null,
    );
    queries.setPrediction(taskId, {
      predictedDurationSeconds: prediction.seconds,
      predictedP25Seconds: prediction.p25_seconds,
      predictedP75Seconds: prediction.p75_seconds,
      predictedConfidence: prediction.confidence,
    });
  } catch {
    // Swallow — calibration is a nice-to-have.
  }

  const newState: SessionState = {
    task_id: taskId,
    last_activity_at: nowIso,
    tool_call_count: 0,
    first_edit_offset_seconds: 0,
    tools_used: [toolName],
  };
  setSessionState(queries, sessionId, newState);
  return { task_id: taskId };
}

const TEST_BASH_RE = /\b(npm (test|run test)|pnpm (test|run test)|yarn (test|run test)|vitest|jest|pytest|cargo test|go test|mvn test|gradle test|rspec)\b/i;

export function handlePostToolUse(input: HookInput, deps: HookDeps): void {
  const sessionId = input.session_id;
  if (!sessionId) return;
  const { queries } = deps;
  const state = getSessionState(queries, sessionId);
  if (!state) return;

  const toolName = input.tool_name ?? 'unknown';
  const tools = state.tools_used.includes(toolName) ? state.tools_used : [...state.tools_used, toolName];

  const updated: SessionState = {
    ...state,
    tools_used: tools,
    tool_call_count: state.tool_call_count + 1,
    last_activity_at: (deps.now ?? (() => new Date()))().toISOString(),
  };
  setSessionState(queries, sessionId, updated);

  queries.updateTelemetry(state.task_id, {
    toolsUsed: tools,
    toolCallCount: updated.tool_call_count,
  });

  // Test-run detection: Bash invocations that look like a test command.
  if (toolName === 'Bash') {
    const cmd = typeof input.tool_input?.command === 'string' ? input.tool_input.command : '';
    if (TEST_BASH_RE.test(cmd)) {
      const response = input.tool_response ?? {};
      const exitCode = typeof response.exit_code === 'number' ? response.exit_code
        : typeof response.exitCode === 'number' ? response.exitCode
        : null;
      const passed = exitCode === 0 ? 1 : exitCode != null ? 0 : null;
      // Only record the FIRST test run for this task — that's "first try".
      const existing = queries.getTask(state.task_id);
      if (existing && existing.tests_passed_first_try == null && passed != null) {
        queries.updateTelemetry(state.task_id, { testsPassedFirstTry: passed });
      }
    }
  }
}

export async function handleStop(input: HookInput, deps: HookDeps): Promise<{ ended: string | null }> {
  const sessionId = input.session_id;
  if (!sessionId) return { ended: null };
  const { queries } = deps;
  const state = getSessionState(queries, sessionId);
  if (!state) return { ended: null };

  const active = queries.getActiveTask(state.task_id);
  if (!active) {
    clearSessionState(queries, sessionId);
    return { ended: null };
  }

  const now = (deps.now ?? (() => new Date()))();
  const endedAt = now.toISOString();
  const duration = Math.max(0, (now.getTime() - new Date(active.started_at).getTime()) / 1000);

  queries.endTask(state.task_id, endedAt, duration, 'completed', null, null);

  // Refresh model / context from the final state of the transcript so the
  // task row reflects the context size when work actually stopped.
  const summary = readTranscriptSummary(input.transcript_path);

  queries.updateTelemetry(state.task_id, {
    toolsUsed: state.tools_used,
    toolCallCount: state.tool_call_count,
    firstEditOffsetSeconds: state.first_edit_offset_seconds ?? null,
    modelId: summary.model_id ?? null,
    contextTokens: summary.context_tokens ?? null,
  });

  // Feed the observed residual back into the calibration bucket.
  try {
    const finalRow = queries.getTask(state.task_id);
    if (finalRow && finalRow.predicted_duration_seconds != null && finalRow.predicted_confidence) {
      recordResidual(
        queries,
        finalRow.category,
        finalRow.model_id,
        finalRow.predicted_confidence,
        finalRow.predicted_duration_seconds,
        duration,
      );
    }
  } catch {
    // never break the hook
  }

  // Semantic embedding so future matches can find this task by meaning.
  try {
    const parsed = parseTask(active);
    const text = taskEmbeddingText(parsed.description, parsed.tags);
    const vec = await tryEmbed(getDefaultEmbedder(), text);
    if (vec) queries.setEmbedding(state.task_id, vectorToBuffer(vec), DEFAULT_EMBEDDING_MODEL);
  } catch { /* never break the hook */ }

  // Plan-level completion + refit.
  try {
    const finalRow = queries.getTask(state.task_id);
    if (finalRow?.parent_plan_id) maybeCompletePlan(queries, finalRow.parent_plan_id);
  } catch { /* never break the hook */ }

  // Federated upload — opt-in, fire-and-forget, privacy-whitelisted.
  try {
    const finalRow = queries.getTask(state.task_id);
    if (finalRow) uploadIfEnabled(finalRow);
  } catch { /* never break the hook */ }

  // Session-end reflection: log any actionable insights to stderr so they
  // surface in the agent's session logs. Only fires once the user has
  // produced at least a few recent completed tasks (otherwise we'd spam).
  try {
    const recentCount = queries.getCompletedInRange(
      new Date((deps.now ?? (() => new Date()))().getTime() - 4 * 60 * 60 * 1000).toISOString(),
    ).length;
    if (recentCount >= 3) {
      const insights = generateReflectInsights(queries, { scope: 'session' });
      for (const ins of insights) {
        process.stderr.write(`velocity-mcp reflect [${ins.confidence}] ${ins.message}\n`);
      }
    }
  } catch { /* never break the hook */ }

  clearSessionState(queries, sessionId);
  return { ended: state.task_id };
}

export function reapOrphanTasks(queries: TaskQueries, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - ORPHAN_AGE_MS).toISOString();
  return queries.reapOrphans(cutoff, now.toISOString(), 'reaped as orphan on server boot');
}

// --- CLI entrypoint ----------------------------------------------------------

async function readStdinJson<T = HookInput>(): Promise<T> {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => {
      if (!buf.trim()) return resolve({} as T);
      try {
        resolve(JSON.parse(buf) as T);
      } catch {
        resolve({} as T);
      }
    });
    // If stdin is a TTY (hook invoked manually), don't hang forever.
    if (process.stdin.isTTY) resolve({} as T);
  });
}

export async function runHookCli(event: string, queries: TaskQueries): Promise<void> {
  const input = await readStdinJson();
  try {
    switch (event) {
      case 'pre-tool-use':
      case 'PreToolUse':
        handlePreToolUse(input, { queries });
        break;
      case 'post-tool-use':
      case 'PostToolUse':
        handlePostToolUse(input, { queries });
        break;
      case 'stop':
      case 'Stop':
        await handleStop(input, { queries });
        break;
      case 'session-start':
      case 'SessionStart':
        reapOrphanTasks(queries);
        break;
      default:
        process.stderr.write(`velocity-mcp hook: unknown event '${event}'\n`);
    }
  } catch (err) {
    // Hooks must never break the agent — log to stderr and exit 0.
    process.stderr.write(`velocity-mcp hook error: ${(err as Error).message ?? err}\n`);
  }
}
