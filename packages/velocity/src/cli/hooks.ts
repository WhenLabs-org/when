import { v4 as uuidv4 } from 'uuid';
import type { TaskQueries } from '../db/queries.js';
import type { Category } from '../types.js';
import { parseTask } from '../types.js';
import { detectProject } from './detect-project.js';
import { readTranscriptSummary } from './transcript.js';
import { estimateTaskCalibrated } from '../matching/similarity.js';
import { recordResidual } from '../matching/calibration.js';
import {
  getDefaultEmbedder,
  taskEmbeddingText,
  tryEmbed,
  vectorToBuffer,
} from '../matching/embedding.js';
import { maybeCompletePlan } from '../matching/plan-model.js';
import { generateReflectInsights } from '../matching/reflect.js';
import { uploadIfEnabled } from '../federation/client.js';
import { classifyCategory } from '../matching/classify.js';

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

export async function handlePreToolUse(input: HookInput, deps: HookDeps): Promise<{ task_id: string } | null> {
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

  // Start a new auto-task. Read the transcript up front so the description,
  // model, and context size all come from the same source of truth.
  const filePath = extractFilePath(input.tool_input);
  const fileCategory = inferCategoryFromPath(filePath);
  const taskId = uuidv4();
  const summary = readTranscriptSummary(input.transcript_path);

  // Prefer the user's actual request for the description — it carries
  // semantic intent that matching and reflection can use. Fall back to the
  // file path when the transcript doesn't expose a user message.
  const description = summary.last_user_message
    ? (filePath ? `${summary.last_user_message} (editing ${filePath})` : summary.last_user_message)
    : (filePath ? `Auto: edits to ${filePath}` : `Auto: ${toolName}`);
  const tags = [AUTO_TAG, toolName.toLowerCase()];

  // Upgrade the category via the embedding classifier when we have semantic
  // signal in the description — "fix the login bug (editing login.ts)" should
  // land as `debug`, not `implement`. Falls back to the file-path regex when
  // there isn't enough historical data to vote reliably.
  let category = fileCategory;
  try {
    const result = await classifyCategory(description, tags, queries, getDefaultEmbedder(), fileCategory);
    category = result.category;
  } catch {
    // never break the hook on classifier issues
  }

  queries.insertTask(
    taskId,
    category,
    tags,
    description,
    detectProject(),
    nowIso,
    null,
  );

  // Pull model / context size from the same transcript read for the
  // per-model calibration bucketing.
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

// Canonical test-runner commands — strong match.
const TEST_BASH_STRONG_RE = /\b(npm (test|run test)|pnpm (test|run test)|yarn (test|run test)|vitest|jest|pytest|cargo test|go test|mvn test|gradle test|rspec|phpunit|dotnet test|tox)\b/i;
// Custom shell test scripts — weaker match, still counts. Matches paths like
// `./scripts/ci.sh`, `./run-tests`, `./bin/test-all`, `make test`.
const TEST_BASH_SHELL_RE = /(^|[\s&;])(?:make\s+test\b|\.?\/?[\w./-]*(?:ci|test|tests|check|verify)[\w./-]*\.sh\b|\.?\/?[\w./-]*\/(?:test|tests|ci)(?:\.\w+)?\b)/i;

/** Does this bash command look like a test invocation? */
export function commandLooksLikeTest(cmd: string): boolean {
  if (!cmd) return false;
  return TEST_BASH_STRONG_RE.test(cmd) || TEST_BASH_SHELL_RE.test(cmd);
}

// Common strings that show up in test-runner stdout. Used as a secondary
// signal when exit_code is missing or the runner exits 0 but didn't actually
// run any tests.
const TEST_PASS_RE = /\b(all tests passed|tests? passed|✓ \d+ passed|[1-9][0-9]* passed(,|\s)|ok \d+|PASS\b|OK\s*\(\d+\s+tests?\)|tests: [1-9][0-9]* passed)\b/i;
// Require a nonzero failed count so "0 failed" in a passing summary doesn't
// collide with the PASS regex.
const TEST_FAIL_RE = /\b(tests? failed|[1-9][0-9]* failed(,|\s)|not ok \d+|FAIL\b|AssertionError|FAILED \(|error: test)/i;

/**
 * Decide whether tests passed on their first try, given a tool_response.
 * Returns 1 (passed), 0 (failed), or null (inconclusive).
 *
 * Prefers exit_code when present. Falls back to stdout/stderr scanning so
 * custom runners that don't report an exit code still register a signal.
 */
export function judgeTestRun(toolResponse: Record<string, unknown>): 0 | 1 | null {
  const exitCode = typeof toolResponse.exit_code === 'number' ? toolResponse.exit_code
    : typeof toolResponse.exitCode === 'number' ? toolResponse.exitCode
    : null;
  if (exitCode === 0) return 1;
  if (typeof exitCode === 'number' && exitCode !== 0) return 0;

  // No exit code — fall back to text matching.
  const stdout = typeof toolResponse.stdout === 'string' ? toolResponse.stdout : '';
  const stderr = typeof toolResponse.stderr === 'string' ? toolResponse.stderr : '';
  const combined = `${stdout}\n${stderr}`;
  if (TEST_FAIL_RE.test(combined)) return 0;
  if (TEST_PASS_RE.test(combined)) return 1;
  return null;
}

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
    if (commandLooksLikeTest(cmd)) {
      const passed = judgeTestRun(input.tool_response ?? {});
      // Only record the FIRST test run for this task — that's "first try".
      const existing = queries.getTask(state.task_id);
      if (existing && existing.tests_passed_first_try == null && passed != null) {
        queries.updateTelemetry(state.task_id, { testsPassedFirstTry: passed });
      }
    }
  }
}

export async function handleStop(input: HookInput, deps: HookDeps): Promise<{ ended: string | null; systemMessage?: string }> {
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
    const embedder = getDefaultEmbedder();
    const vec = await tryEmbed(embedder, text);
    if (vec) queries.setEmbedding(state.task_id, vectorToBuffer(vec), embedder.modelName);
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

  // Session-end reflection: collect actionable insights. High/medium-confidence
  // ones (cap: 2) are surfaced to the user via the hook's systemMessage
  // channel; everything else goes to stderr as a diagnostic log.
  let systemMessage: string | undefined;
  try {
    const reflectNow = (deps.now ?? (() => new Date()))();
    const recentCount = queries.getCompletedInRange(
      new Date(reflectNow.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    ).length;
    if (recentCount >= 3) {
      const insights = generateReflectInsights(queries, { scope: 'session', now: reflectNow });
      for (const ins of insights) {
        process.stderr.write(`velocity-mcp reflect [${ins.confidence}] ${ins.message}\n`);
      }
      const shown = insights
        .filter(i => i.confidence === 'high' || i.confidence === 'medium')
        .slice(0, 2);
      if (shown.length > 0) {
        systemMessage = 'velocity: ' + shown.map(i => i.message).join(' ');
      }
    }
  } catch { /* never break the hook */ }

  clearSessionState(queries, sessionId);
  return { ended: state.task_id, systemMessage };
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
        await handlePreToolUse(input, { queries });
        break;
      case 'post-tool-use':
      case 'PostToolUse':
        handlePostToolUse(input, { queries });
        break;
      case 'stop':
      case 'Stop': {
        const result = await handleStop(input, { queries });
        // Claude Code's Stop hook surfaces any JSON on stdout to the user.
        // systemMessage is the documented field for "show this to the user".
        if (result.systemMessage) {
          process.stdout.write(JSON.stringify({ systemMessage: result.systemMessage }) + '\n');
        }
        break;
      }
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
