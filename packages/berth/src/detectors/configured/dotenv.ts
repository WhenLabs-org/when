import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import type { ConfiguredPort } from '../../types.js';
import { isValidPort } from '../../utils/ports.js';

const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.dev'];

const PORT_KEY_PATTERN = /^(PORT|.*_PORT|SERVER_PORT|API_PORT|APP_PORT|HTTP_PORT|HTTPS_PORT)$/i;

const URL_PORT_PATTERN = /(?:\/\/[^/:]+):(\d+)/;

export async function detectFromDotenv(dir: string): Promise<ConfiguredPort[]> {
  const ports: ConfiguredPort[] = [];
  const projectName = path.basename(dir);

  for (const envFile of ENV_FILES) {
    const filePath = path.join(dir, envFile);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseDotenv(Buffer.from(content));

    for (const [key, value] of Object.entries(parsed)) {
      if (!value) continue;

      // Direct port keys like PORT=3000, DB_PORT=5432
      if (PORT_KEY_PATTERN.test(key)) {
        const port = parseInt(value, 10);
        if (isValidPort(port)) {
          ports.push({
            port,
            source: 'dotenv',
            sourceFile: filePath,
            context: `${key}=${value}`,
            projectDir: dir,
            projectName,
            confidence: 'high',
          });
        }
        continue;
      }

      // URL values like DATABASE_URL=postgres://localhost:5432/mydb
      if (key.toLowerCase().includes('url') || key.toLowerCase().includes('dsn')) {
        const urlMatch = value.match(URL_PORT_PATTERN);
        if (urlMatch) {
          const port = parseInt(urlMatch[1], 10);
          if (isValidPort(port)) {
            ports.push({
              port,
              source: 'dotenv',
              sourceFile: filePath,
              context: `${key}=${value}`,
              projectDir: dir,
              projectName,
              confidence: 'medium',
            });
          }
        }
      }
    }
  }

  return ports;
}
