import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const MCP_SERVERS = {
  'velocity-mcp': { command: 'npx', args: ['@whenlabs/velocity-mcp'] },
  whenlabs: { command: 'when-mcp', args: [] },
};

export type EditorName = 'cursor' | 'vscode' | 'windsurf';

interface EditorResult {
  editor: EditorName;
  success: boolean;
  message: string;
}

function getConfigPath(editor: EditorName): string {
  const home = homedir();
  switch (editor) {
    case 'cursor':
      return join(home, '.cursor', 'mcp.json');
    case 'vscode':
      return join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    case 'windsurf':
      return join(home, '.codeium', 'windsurf', 'mcp_config.json');
  }
}

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function ensureDir(filePath: string): void {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function installCursorOrWindsurf(editor: 'cursor' | 'windsurf'): EditorResult {
  const configPath = getConfigPath(editor);
  const existing = readJsonFile(configPath);
  const mcpServers = (existing['mcpServers'] as Record<string, unknown> | undefined) ?? {};

  const updated = {
    ...existing,
    mcpServers: {
      ...mcpServers,
      ...MCP_SERVERS,
    },
  };

  ensureDir(configPath);
  writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  return { editor, success: true, message: `${capitalize(editor)}: MCP servers registered at ${configPath}` };
}

function installVSCode(): EditorResult {
  const configPath = getConfigPath('vscode');
  const existing = readJsonFile(configPath);

  // VS Code uses "mcp" key with "servers" subkey
  const mcpSection = (existing['mcp'] as Record<string, unknown> | undefined) ?? {};
  const servers = (mcpSection['servers'] as Record<string, unknown> | undefined) ?? {};

  const updated = {
    ...existing,
    mcp: {
      ...mcpSection,
      servers: {
        ...servers,
        ...MCP_SERVERS,
      },
    },
  };

  ensureDir(configPath);
  writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  return { editor: 'vscode', success: true, message: `VS Code: MCP servers registered at ${configPath}` };
}

function uninstallCursorOrWindsurf(editor: 'cursor' | 'windsurf'): EditorResult {
  const configPath = getConfigPath(editor);
  if (!existsSync(configPath)) {
    return { editor, success: true, message: `${capitalize(editor)}: config not found, nothing to remove` };
  }

  const existing = readJsonFile(configPath);
  const mcpServers = (existing['mcpServers'] as Record<string, unknown> | undefined) ?? {};

  for (const key of Object.keys(MCP_SERVERS)) {
    delete mcpServers[key];
  }

  const updated = { ...existing, mcpServers };
  writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  return { editor, success: true, message: `${capitalize(editor)}: MCP servers removed from ${configPath}` };
}

function uninstallVSCode(): EditorResult {
  const configPath = getConfigPath('vscode');
  if (!existsSync(configPath)) {
    return { editor: 'vscode', success: true, message: 'VS Code: config not found, nothing to remove' };
  }

  const existing = readJsonFile(configPath);
  const mcpSection = (existing['mcp'] as Record<string, unknown> | undefined) ?? {};
  const servers = (mcpSection['servers'] as Record<string, unknown> | undefined) ?? {};

  for (const key of Object.keys(MCP_SERVERS)) {
    delete servers[key];
  }

  const updated = {
    ...existing,
    mcp: { ...mcpSection, servers },
  };

  writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  return { editor: 'vscode', success: true, message: `VS Code: MCP servers removed from ${configPath}` };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function installForEditor(editor: EditorName): EditorResult {
  try {
    if (editor === 'vscode') return installVSCode();
    return installCursorOrWindsurf(editor);
  } catch (err) {
    return {
      editor,
      success: false,
      message: `${capitalize(editor)}: failed — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function uninstallForEditor(editor: EditorName): EditorResult {
  try {
    if (editor === 'vscode') return uninstallVSCode();
    return uninstallCursorOrWindsurf(editor);
  } catch (err) {
    return {
      editor,
      success: false,
      message: `${capitalize(editor)}: failed — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export const ALL_EDITORS: EditorName[] = ['cursor', 'vscode', 'windsurf'];
