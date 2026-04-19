import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { TerminalReporter } from '../../src/reporters/terminal.js';
import { canonicalReport } from './fixtures.js';

// Strip ANSI escapes so the snapshot is stable regardless of the terminal env.
const ANSI = /\x1b\[[0-9;]*m/g;

describe('TerminalReporter', () => {
  beforeAll(() => {
    chalk.level = 0;
  });

  it('matches the canonical snapshot (ANSI-stripped)', () => {
    const out = new TerminalReporter().render(canonicalReport()).replace(ANSI, '');
    expect(out).toMatchSnapshot();
  });

  it('includes issue messages', () => {
    const out = new TerminalReporter().render(canonicalReport()).replace(ANSI, '');
    expect(out).toContain('src/db.js');
    expect(out).toContain('npm run dev');
  });
});
