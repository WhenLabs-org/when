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

const command = process.argv[2];

if (command === 'install') {
  const { install } = await import('./cli/install.js');
  await install();
  process.exit(0);
}

if (command === 'uninstall') {
  const { uninstall } = await import('./cli/uninstall.js');
  await uninstall();
  process.exit(0);
}

const server = new McpServer({
  name: 'velocity-mcp',
  version: '0.1.0',
});

const db = initDb();
const queries = new TaskQueries(db);

registerStartTask(server, queries);
registerEndTask(server, queries);
registerEstimate(server, queries);
registerStats(server, queries);
registerHistory(server, queries);

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
