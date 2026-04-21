import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createTool as createBerthTool } from '@whenlabs/berth';
import { registerScanTool } from './register-scan-tool.js';

export function registerBerthTools(server: McpServer): void {
  const berth = createBerthTool();

  registerScanTool(server, {
    name: 'berth_check',
    description: [
      'Scan a project for port conflicts between ports declared in common dev-server config sources (.env files, package.json scripts, docker-compose.yml, devcontainer.json, Procfile, Makefile, framework defaults, and a project-local .berthrc) and ports currently listening on the host.',
      '',
      'When to use: before running `npm run dev`, `docker compose up`, or any other dev-server command — especially after switching branches in a monorepo where multiple services may want the same port. Safe to call repeatedly; read-only and side-effect free.',
      '',
      'Side effects: enumerates listening TCP ports on the host via platform-appropriate commands (lsof on macOS/Linux, netstat on Windows) and inspects running Docker containers for published ports. Reads only the config files listed above; never opens, closes, or binds any ports. No network I/O beyond local loopback checks.',
      '',
      'Returns: plain-text (or JSON) report listing each configured port, whether it is free or in use, and — for occupied ports — the PID and process name of the holder. Exit 1 when a conflict is detected, 0 otherwise.',
    ].join('\n'),
    tool: berth,
  });
}
