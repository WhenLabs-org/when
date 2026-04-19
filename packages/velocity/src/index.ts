#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDb } from './db/schema.js';
import { TaskQueries } from './db/queries.js';
import { registerStartTask } from './tools/start-task.js';
import { registerEndTask } from './tools/end-task.js';
import { registerEstimate } from './tools/estimate.js';
import { registerStats } from './tools/stats.js';
import { registerHistory } from './tools/history.js';
import { registerCalibration } from './tools/calibration.js';
import { registerReflect } from './tools/reflect.js';

const command = process.argv[2];

if (command === 'install') {
  const { install } = await import('./cli/install.js');
  const noHooks = process.argv.includes('--no-hooks');
  await install({ noHooks });
  process.exit(0);
}

if (command === 'uninstall') {
  const { uninstall } = await import('./cli/uninstall.js');
  await uninstall();
  process.exit(0);
}

if (command === 'federation') {
  const { runFederationCommand } = await import('./cli/federation.js');
  runFederationCommand(process.argv[3], process.argv.slice(4));
  process.exit(0);
}

if (command === 'hook') {
  const event = process.argv[3];
  if (!event) {
    console.error('velocity-mcp hook: missing event name (pre-tool-use|post-tool-use|stop|session-start)');
    process.exit(0); // exit 0 so we never break the agent
  }
  const { runHookCli } = await import('./cli/hooks.js');
  const db = initDb();
  const queries = new TaskQueries(db);
  try {
    await runHookCli(event, queries);
  } finally {
    db.close();
  }
  process.exit(0);
}

const server = new McpServer({
  name: 'velocity-mcp',
  version: '0.1.0',
});

const db = initDb();
const queries = new TaskQueries(db);

// Sweep any tasks left un-ended for >4h — a previous session crashed or was killed.
try {
  const { reapOrphanTasks } = await import('./cli/hooks.js');
  const n = reapOrphanTasks(queries);
  if (n > 0) console.error(`velocity-mcp: reaped ${n} orphan task(s) as abandoned`);
} catch (err) {
  console.error('velocity-mcp: orphan reap failed:', err);
}

// Kick off a background embedding backfill if the store has a critical mass
// of un-embedded historical tasks. Fire-and-forget: failures log to stderr
// and never block the MCP transport.
try {
  const missing = queries.countTasksMissingEmbedding();
  if (missing >= 100) {
    const { backfillEmbeddings, getDefaultEmbedder, BACKFILL_BATCH_LIMIT } = await import('./matching/embedding.js');
    queueMicrotask(() => {
      backfillEmbeddings(queries, getDefaultEmbedder(), BACKFILL_BATCH_LIMIT)
        .then(r => {
          if (r.succeeded > 0 || r.failed > 0) {
            console.error(`velocity-mcp: embedding backfill — ${r.succeeded} ok, ${r.failed} failed (of ${missing} total missing)`);
          }
        })
        .catch(err => console.error('velocity-mcp: backfill error:', err));
    });
  }
} catch (err) {
  console.error('velocity-mcp: backfill scheduling failed:', err);
}

registerStartTask(server, queries);
registerEndTask(server, queries);
registerEstimate(server, queries);
registerStats(server, queries);
registerHistory(server, queries);
registerCalibration(server, queries);
registerReflect(server, queries);

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr — stdout is reserved for the MCP stdio transport
  console.error('velocity-mcp server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
