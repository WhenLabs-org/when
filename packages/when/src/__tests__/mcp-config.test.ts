import { describe, it, expect } from 'vitest';
import { MCP_SERVER_COMMAND } from '../utils/mcp-config.js';

describe('MCP_SERVER_COMMAND', () => {
  // `@whenlabs/when` has two bins (`when` and `when-mcp`). Historically this
  // registered `npx @whenlabs/when when-mcp`, which runs the default `when`
  // bin with `when-mcp` as an unknown subcommand — so the MCP server never
  // actually started. Guard the invocation that reaches a live server.
  it('uses -p so npx runs the when-mcp bin, not the default when bin', () => {
    const tokens = MCP_SERVER_COMMAND.split(/\s+/);
    expect(tokens[0]).toBe('npx');
    expect(tokens).toContain('-p');
    const pIdx = tokens.indexOf('-p');
    expect(tokens[pIdx + 1]).toMatch(/^@whenlabs\/when(?:@|$)/);
    expect(tokens[tokens.length - 1]).toBe('when-mcp');
  });

  it('pins the package spec to @latest to dodge stale npx cache', () => {
    expect(MCP_SERVER_COMMAND).toContain('@whenlabs/when@latest');
  });

  it('runs non-interactively (-y)', () => {
    expect(MCP_SERVER_COMMAND).toMatch(/\bnpx\s+(?:\S+\s+)*-y\b/);
  });
});
