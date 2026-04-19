import { describe, it, expect } from 'vitest';
import {
  parsePsLine,
  parseEnvBlob,
  parsePsEnvLine,
  parseWmicCsv,
} from '../../src/utils/ancestry.js';

describe('parsePsLine', () => {
  it('parses a standard ps line', () => {
    // ps -o pid=,ppid=,lstart=,comm=,args=
    const line = '42156 4000 Thu Jan  1 12:34:56 2024 node /usr/bin/node dev-server --port 3000';
    const row = parsePsLine(line);
    expect(row).toBeDefined();
    expect(row!.pid).toBe(42156);
    expect(row!.ppid).toBe(4000);
    expect(row!.lstart).toBe('Thu Jan 1 12:34:56 2024');
    expect(row!.command).toBe('node');
    expect(row!.args).toContain('dev-server --port 3000');
  });

  it('returns undefined on a too-short line', () => {
    expect(parsePsLine('42156 4000')).toBeUndefined();
  });

  it('returns undefined when pid is not a number', () => {
    expect(parsePsLine('abc def Thu Jan 1 12:34:56 2024 node /usr/bin/node')).toBeUndefined();
  });
});

describe('parseEnvBlob', () => {
  it('parses NUL-delimited /proc/pid/environ', () => {
    const blob = 'PATH=/usr/bin\0TMUX_PANE=%42\0LANG=en_US.UTF-8\0';
    const env = parseEnvBlob(blob);
    expect(env.PATH).toBe('/usr/bin');
    expect(env.TMUX_PANE).toBe('%42');
    expect(env.LANG).toBe('en_US.UTF-8');
  });

  it('ignores empty entries and lines without "="', () => {
    const env = parseEnvBlob('A=1\0\0NOEQ\0B=2\0');
    expect(env).toEqual({ A: '1', B: '2' });
  });
});

describe('parsePsEnvLine', () => {
  it('picks up uppercase env keys only', () => {
    const line = '/usr/bin/node index.js --foo=bar TMUX=/tmp/tmux-1000/default,123,2 SHELL=/bin/zsh';
    const env = parsePsEnvLine(line);
    expect(env.TMUX).toBe('/tmp/tmux-1000/default,123,2');
    expect(env.SHELL).toBe('/bin/zsh');
    expect(env).not.toHaveProperty('--foo');
  });
});

describe('parseWmicCsv', () => {
  it('extracts ppid and creationdate', () => {
    const output =
      'Node,CreationDate,Name,ParentProcessId,ProcessId\nMYBOX,20240101120000.000000+000,node.exe,4000,42156\n';
    const parsed = parseWmicCsv(output);
    expect(parsed?.ppid).toBe(4000);
    expect(parsed?.startedAt).toBe('2024-01-01T12:00:00.000Z');
  });

  it('returns undefined on empty output', () => {
    expect(parseWmicCsv('')).toBeUndefined();
  });
});
