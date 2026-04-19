import { describe, it, expect } from 'vitest';
import { parseSsOutput } from '../../src/commands/remote.js';

describe('parseSsOutput', () => {
  it('extracts port + pid + process from `ss -tlnp` output', () => {
    const ss = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port  Process
LISTEN 0      511    0.0.0.0:3000        0.0.0.0:*          users:(("node",pid=4242,fd=20))
LISTEN 0      128    127.0.0.1:8080      0.0.0.0:*          users:(("nginx",pid=555,fd=6))
`;
    const out = parseSsOutput(ss, 'staging');
    expect(out.active).toHaveLength(2);
    const node = out.active.find((p) => p.port === 3000)!;
    expect(node.pid).toBe(4242);
    expect(node.process).toBe('node');
    expect(node.project).toBe('@staging');
    expect(node.source).toBe('ss');
  });

  it('tolerates lines without pid info', () => {
    const ss = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN 0      128    0.0.0.0:4000        0.0.0.0:*
`;
    const out = parseSsOutput(ss, 'box');
    expect(out.active).toHaveLength(1);
    expect(out.active[0].pid).toBe(0);
    expect(out.active[0].process).toBe('unknown');
  });

  it('ignores malformed rows', () => {
    const out = parseSsOutput('garbage\n', 'x');
    expect(out.active).toEqual([]);
  });
});
