import {
  configPath,
  disableFederation,
  enableFederation,
  loadConfig,
} from '../federation/client.js';

export function runFederationCommand(subcommand: string | undefined, rest: string[]): void {
  switch (subcommand) {
    case 'enable': {
      const i = rest.indexOf('--endpoint');
      const endpoint = i >= 0 && rest[i + 1] ? rest[i + 1] : null;
      if (!endpoint) {
        console.error('Error: --endpoint URL is required.');
        console.error('');
        console.error('Federation is EXPERIMENTAL. There is no public velocity server yet —');
        console.error('you must deploy one yourself. See docs/federation-wire-format.md for');
        console.error('the POST /v1/tasks and GET /v1/priors contract.');
        console.error('');
        console.error('Usage: npx velocity-mcp federation enable --endpoint https://your-server.example');
        process.exit(1);
      }
      let cfg;
      try {
        cfg = enableFederation(endpoint);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
      console.log('\n✅ Federation enabled\n');
      console.log(`  endpoint: ${cfg.endpoint}`);
      console.log(`  config:   ${configPath()}`);
      console.log('\nWhat leaves your machine on each completed task:');
      console.log('  • category, duration, files_changed, lines_added, lines_removed');
      console.log('  • model_id, context_tokens, tests_passed_first_try');
      console.log('  • tags hashed with your per-user salt (opaque across users)');
      console.log('\nNEVER uploaded:');
      console.log('  • description, notes, project, git diff text, task id');
      console.log('\nDisable any time: npx velocity-mcp federation disable\n');
      return;
    }
    case 'disable': {
      const cfg = disableFederation();
      if (!cfg) {
        console.log('Federation was not configured — nothing to disable.');
      } else {
        console.log('\n✅ Federation disabled. No further uploads will be sent.\n');
        console.log(`Config preserved at ${configPath()} (salt retained for re-enable).`);
      }
      return;
    }
    case 'status':
    case undefined: {
      const cfg = loadConfig();
      if (!cfg) {
        console.log('\nFederation: not configured');
        console.log('Enable with: npx velocity-mcp federation enable\n');
        return;
      }
      console.log('\nFederation:', cfg.enabled ? 'ENABLED' : 'disabled');
      console.log(`  endpoint:       ${cfg.endpoint}`);
      console.log(`  salt:           ${cfg.salt.slice(0, 8)}… (${cfg.salt.length / 2} bytes, kept local)`);
      console.log(`  config:         ${configPath()}`);
      console.log();
      return;
    }
    default:
      console.error(`Unknown federation subcommand: ${subcommand}`);
      console.error('Usage: npx velocity-mcp federation {enable [--endpoint URL] | disable | status}');
      process.exit(1);
  }
}
