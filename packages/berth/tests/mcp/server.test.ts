import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../../src/mcp/server.js';

describe('createMcpServer', () => {
  it('instantiates without throwing and exposes connect/close', () => {
    const server = createMcpServer();
    expect(typeof server.connect).toBe('function');
    expect(typeof server.close).toBe('function');
  });
});
