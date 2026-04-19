import { runMcpServer } from './server.js';

async function main(): Promise<void> {
  try {
    await runMcpServer();
  } catch (err) {
    // stderr only — stdout is reserved for the MCP protocol.
    if (err instanceof Error) {
      process.stderr.write(`berth-mcp: ${err.message}\n`);
    }
    process.exitCode = 1;
  }
}

main();
