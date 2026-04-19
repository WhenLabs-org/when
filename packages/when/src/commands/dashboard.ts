import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { generateDashboard } from '../mcp/velocity-dashboard.js';

export function createDashboardCommand(): Command {
  const cmd = new Command('dashboard');
  cmd.description('Generate an HTML velocity dashboard and open it in the browser');
  cmd.option('--no-open', 'Write the HTML file without opening the browser');

  cmd.action(async (options: { open: boolean }) => {
    const { path, summary } = await generateDashboard();
    console.log(summary);

    if (options.open !== false) {
      const platform = process.platform;
      try {
        if (platform === 'darwin') {
          execSync(`open "${path}"`, { stdio: 'ignore' });
        } else if (platform === 'linux') {
          execSync(`xdg-open "${path}"`, { stdio: 'ignore' });
        } else {
          console.log(`Dashboard written to: ${path}`);
        }
      } catch {
        console.log(`Dashboard written to: ${path}`);
      }
    }
  });

  return cmd;
}
