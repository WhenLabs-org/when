import Anthropic from '@anthropic-ai/sdk';
import type { CodebaseFacts, ParsedDocument, DocSection } from '../../types.js';
import { ApiError } from '../../errors.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.STALE_AI_KEY;
    if (!apiKey) {
      throw new ApiError('STALE_AI_KEY environment variable is required for AI analysis');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

const MODEL_MAP = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
} as const;

export async function askAI(
  prompt: string,
  model: 'sonnet' | 'opus',
  systemPrompt: string,
  maxRetries = 3,
): Promise<string> {
  const ai = getClient();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.messages.create({
        model: MODEL_MAP[model],
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock?.text ?? '';
    } catch (err: unknown) {
      lastError = err as Error;
      if ((err as any)?.status === 429) {
        // Rate limited — exponential backoff
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      throw new ApiError(`AI API error: ${(err as Error).message}`);
    }
  }

  throw new ApiError(`AI API failed after ${maxRetries} retries: ${lastError?.message}`);
}

export function buildContext(
  doc: ParsedDocument,
  codebase: CodebaseFacts,
  section?: DocSection,
): string {
  const parts: string[] = [];

  if (section) {
    parts.push(`## Documentation Section (from ${doc.filePath}, line ${section.line})`);
    parts.push(`### ${section.heading}`);
    parts.push(section.content);
  } else {
    parts.push(`## Documentation: ${doc.filePath}`);
    for (const s of doc.sections) {
      parts.push(`### ${s.heading}`);
      parts.push(s.content.slice(0, 500));
    }
  }

  parts.push('\n## Codebase Facts');

  if (Object.keys(codebase.scripts).length > 0) {
    parts.push(`Scripts: ${JSON.stringify(codebase.scripts)}`);
  }
  if (Object.keys(codebase.dependencies).length > 0) {
    parts.push(`Dependencies: ${Object.keys(codebase.dependencies).join(', ')}`);
  }
  if (codebase.routes.length > 0) {
    parts.push('Routes:');
    for (const r of codebase.routes) {
      parts.push(`  ${r.method} ${r.path} (${r.file}:${r.line})`);
    }
  }
  if (codebase.envVarsUsed.length > 0) {
    parts.push(`Env vars used: ${codebase.envVarsUsed.map((v) => v.name).join(', ')}`);
  }

  // Truncate to ~50K characters
  const full = parts.join('\n');
  return full.length > 50000 ? full.slice(0, 50000) + '\n\n[truncated]' : full;
}
