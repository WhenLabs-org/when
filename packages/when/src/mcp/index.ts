import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));

import {
  initDb,
  TaskQueries,
  registerStartTask,
  registerEndTask,
} from '@whenlabs/velocity-mcp/lib';

import { registerStaleTools } from './stale.js';
import { registerEnvalidTools } from './envalid.js';
import { registerBerthTools } from './berth.js';
import { registerAwareTools } from './aware.js';
import { registerVowTools } from './vow.js';
import { registerSummaryTool } from './summary.js';

const server = new McpServer({
  name: 'whenlabs',
  version,
});

const velocityDb = initDb();
const velocityQueries = new TaskQueries(velocityDb);

// Cast needed: velocity-mcp may resolve its own @modelcontextprotocol/sdk copy,
// creating duplicate private types. Runtime types are identical.
const s = server as Parameters<typeof registerStartTask>[0];
registerStartTask(s, velocityQueries);
registerEndTask(s, velocityQueries);

registerStaleTools(server);
registerEnvalidTools(server);
registerBerthTools(server);
registerAwareTools(server);
registerVowTools(server);
registerSummaryTool(server);

process.on('SIGINT', () => {
  velocityDb.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  velocityDb.close();
  process.exit(0);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
