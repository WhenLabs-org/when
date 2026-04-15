import { describe, it, expect } from 'vitest';
import { createDelegateCommand } from '../commands/delegate.js';

describe('createDelegateCommand', () => {
  it('returns a Command with the correct name', () => {
    const cmd = createDelegateCommand('stale', 'Detect drift');
    expect(cmd.name()).toBe('stale');
  });

  it('sets the description correctly', () => {
    const cmd = createDelegateCommand('berth', 'Resolve port conflicts');
    expect(cmd.description()).toBe('Resolve port conflicts');
  });

  it('uses the provided name when no binName is given', () => {
    const cmd = createDelegateCommand('vow', 'Scan licenses');
    expect(cmd.name()).toBe('vow');
  });

  it('still uses the display name when binName override is provided', () => {
    const cmd = createDelegateCommand('velocity', 'Velocity timing', 'velocity-mcp');
    // Command name is the first arg (display name), binName is internal
    expect(cmd.name()).toBe('velocity');
    expect(cmd.description()).toBe('Velocity timing');
  });

  it('has allowUnknownOption enabled', () => {
    const cmd = createDelegateCommand('aware', 'Generate context');
    // Commander exposes this via _allowUnknownOption
    expect((cmd as unknown as { _allowUnknownOption: boolean })._allowUnknownOption).toBe(true);
  });

  it('has helpOption disabled', () => {
    const cmd = createDelegateCommand('envalid', 'Validate env');
    // Commander stores this as _addImplicitHelpCommand or _helpOption
    // When helpOption(false) is called, the help flags are removed
    expect((cmd as unknown as { _helpOption: unknown })._helpOption).toBeFalsy();
  });
});
