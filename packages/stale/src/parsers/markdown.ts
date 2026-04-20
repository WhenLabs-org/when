import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import fg from 'fast-glob';
import type { Root, Code, InlineCode as MdInlineCode, Link, Heading, Text } from 'mdast';
import type {
  ParsedDocument,
  CodeBlock,
  ParsedCommand,
  InlineCode,
  DocLink,
  DocFilePath,
  DocEnvVar,
  VersionClaim,
  DependencyClaim,
  DocApiEndpoint,
  DocPortClaim,
  DocSection,
} from '../types.js';

const COMMAND_REGEX = /^\s*(?:\$\s+)?(npm|yarn|pnpm|npx|make)\s+(.+)$/gm;

const FILE_PATH_REGEX = /(?:^|[\s'"`(])([.\/\w@-]+\/[\w@.-]+(?:\.\w+)?)/g;

// Only treat a candidate as a real file path if it has a file extension
// OR starts with a known path-like prefix. Eliminates prose tokens like
// "Travis/CircleCI" or "Redis/Postgres" that share the slash shape.
const FILE_EXTENSION_REGEX = /\.(?:[tj]sx?|mjs|cjs|m?ts|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|md|mdx|ya?ml|json|jsonc|toml|ini|conf|cfg|html?|css|scss|sass|less|sql|sh|bash|zsh|fish|dockerfile|lock|xml|svg|png|jpg|jpeg|gif|webp|pdf|txt|log|env|gitignore|gitattributes|editorconfig|npmrc|nvmrc|node-version)$/i;
const PATH_PREFIX_REGEX = /^(?:\.\.?\/|\/|src\/|lib\/|tests?\/|bin\/|docs?\/|app\/|apps\/|packages\/|dist\/|build\/|public\/|static\/|assets\/|config\/|scripts?\/|\.github\/|\.vscode\/|\.idea\/|node_modules\/|vendor\/)/;

function looksLikeFilePath(candidate: string): boolean {
  if (FILE_EXTENSION_REGEX.test(candidate)) return true;
  if (PATH_PREFIX_REGEX.test(candidate)) return true;
  return false;
}

const ENV_VAR_REGEX = /\b([A-Z][A-Z0-9_]{2,})\b/g;

// Skip identifiers shaped like <LETTERS><DIGITS> (ES2022, IE11, HTTP2) —
// these are almost always language/protocol versions, not env vars.
const VERSION_LIKE_IDENT = /^[A-Z]+\d+$/;

const VERSION_REGEX = /(?:requires?|needs?|Node(?:\.js)?|Python|Ruby|Java|Go)\s*(?:v|version\s*)?(\d+(?:\.\d+)*(?:\.\*)?)\s*(?:or\s+(?:higher|later|above|newer)|\+|>=)?/gi;

const DEPENDENCY_KEYWORDS = [
  'redis', 'postgresql', 'postgres', 'mongodb', 'mongo', 'mysql', 'mariadb',
  'elasticsearch', 'rabbitmq', 'kafka', 'memcached', 'docker', 'nginx',
  'apache', 'sqlite', 'dynamodb', 'cassandra', 'couchdb',
];

const DEPENDENCY_CONTEXT_REGEX = /(?:requires?|needs?|prerequisite|install|setup|depend)/i;

const API_ENDPOINT_REGEX = /(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[\w/:{}.\-*]+)/gi;

const BADGE_PATTERNS = ['shields.io', 'badge', 'travis-ci', 'codecov', 'coveralls', 'circleci'];

function extractCommands(value: string, blockLine: number): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  const lines = value.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.matchAll(/^\s*(?:\$\s+)?(npm|yarn|pnpm|npx|make)\s+(.+)$/g);
    for (const match of matches) {
      const manager = match[1] as ParsedCommand['manager'];
      const rest = match[2].trim();
      let scriptName: string | undefined;

      if (manager === 'npm' || manager === 'yarn' || manager === 'pnpm') {
        const firstWord = rest.split(/\s/)[0];
        const BUILTIN_ONLY = ['install', 'uninstall', 'update', 'outdated', 'ls', 'init', 'publish', 'pack', 'link', 'ci'];
        if (rest.startsWith('run ')) {
          const runMatch = rest.match(/^run\s+(\S+)/);
          if (runMatch) scriptName = runMatch[1];
        } else if (['start', 'test', 'build', 'dev'].includes(firstWord)) {
          scriptName = firstWord;
        } else if (BUILTIN_ONLY.includes(firstWord)) {
          // Built-in npm command, not a package.json script — skip
          scriptName = undefined;
        }
      } else if (manager === 'make') {
        scriptName = rest.split(/\s/)[0];
      }

      commands.push({
        raw: `${manager} ${rest}`,
        manager,
        scriptName,
        line: blockLine + i,
      });
    }
  }

  return commands;
}

function extractFilePaths(text: string, line: number): DocFilePath[] {
  const paths: DocFilePath[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(FILE_PATH_REGEX)) {
    const p = match[1];
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('//')) continue;
    if (p.length < 4) continue;
    if (!looksLikeFilePath(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p);

    paths.push({ path: p, line, context: text.slice(Math.max(0, match.index! - 20), match.index! + p.length + 20) });
  }

  return paths;
}

function extractEnvVars(text: string, line: number): DocEnvVar[] {
  const vars: DocEnvVar[] = [];
  const seen = new Set<string>();
  const skipWords = new Set([
    'README', 'TODO', 'NOTE', 'WARNING', 'ERROR', 'INFO', 'DEBUG',
    'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
    'TRUE', 'FALSE', 'NULL', 'AND', 'NOT', 'THE', 'FOR', 'BUT',
    'MIT', 'BSD', 'ISC', 'CONTRIBUTING', 'LICENSE', 'CHANGELOG',
    'HTML', 'CSS', 'JSON', 'YAML', 'TOML', 'XML', 'SQL', 'API',
    'CLI', 'URL', 'URI', 'SSH', 'TLS', 'SSL', 'HTTP', 'HTTPS',
    'SARIF', 'CORS', 'REST', 'CRUD', 'IMPORTANT', 'REQUIRED', 'OPTIONAL',
    'DEPRECATED', 'BREAKING', 'RELEASE', 'VERSION', 'BUILD', 'INSTALL',
    'USAGE', 'EXAMPLE', 'DOCKER', 'NGINX', 'REDIS', 'MONGO', 'MYSQL',
  ]);

  for (const match of text.matchAll(ENV_VAR_REGEX)) {
    const name = match[0];
    if (name.length < 4) continue;
    if (skipWords.has(name)) continue;
    if (VERSION_LIKE_IDENT.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    vars.push({
      name,
      line,
      context: text.slice(Math.max(0, match.index! - 20), match.index! + name.length + 20),
    });
  }

  return vars;
}

function extractVersionClaims(text: string, line: number): VersionClaim[] {
  const claims: VersionClaim[] = [];

  for (const match of text.matchAll(VERSION_REGEX)) {
    const rawText = match[0];
    const version = match[1];
    let runtime = 'unknown';

    const lower = rawText.toLowerCase();
    if (lower.includes('node')) runtime = 'node';
    else if (lower.includes('python')) runtime = 'python';
    else if (lower.includes('ruby')) runtime = 'ruby';
    else if (lower.includes('java')) runtime = 'java';
    else if (lower.includes('go')) runtime = 'go';

    claims.push({ runtime, version, line, rawText });
  }

  return claims;
}

function extractDependencyClaims(text: string, line: number): DependencyClaim[] {
  const claims: DependencyClaim[] = [];
  const lowerText = text.toLowerCase();

  for (const dep of DEPENDENCY_KEYWORDS) {
    const idx = lowerText.indexOf(dep);
    if (idx === -1) continue;

    const surroundingStart = Math.max(0, idx - 50);
    const surroundingEnd = Math.min(text.length, idx + dep.length + 50);
    const surrounding = text.slice(surroundingStart, surroundingEnd);

    if (DEPENDENCY_CONTEXT_REGEX.test(surrounding) || lowerText.includes('prerequisite')) {
      claims.push({
        name: dep.charAt(0).toUpperCase() + dep.slice(1),
        line,
        context: surrounding,
      });
    }
  }

  return claims;
}

const PORT_REGEX = /(?:port\s+(\d{3,5})|localhost:(\d{3,5})|127\.0\.0\.1:(\d{3,5})|0\.0\.0\.0:(\d{3,5})|http:\/\/localhost:(\d{3,5}))/gi;

function extractPortClaims(text: string, line: number): DocPortClaim[] {
  const claims: DocPortClaim[] = [];
  const seen = new Set<number>();

  for (const match of text.matchAll(PORT_REGEX)) {
    const portStr = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) continue;
    if (seen.has(port)) continue;
    seen.add(port);

    claims.push({
      port,
      line,
      context: text.slice(Math.max(0, match.index! - 20), match.index! + match[0].length + 20),
    });
  }

  return claims;
}

function extractApiEndpoints(text: string, line: number): DocApiEndpoint[] {
  const endpoints: DocApiEndpoint[] = [];

  for (const match of text.matchAll(API_ENDPOINT_REGEX)) {
    endpoints.push({
      method: match[1].toUpperCase(),
      path: match[2],
      line,
    });
  }

  return endpoints;
}

export async function parseMarkdownFile(filePath: string, projectPath: string): Promise<ParsedDocument> {
  const fullPath = join(projectPath, filePath);
  const content = await readFile(fullPath, 'utf-8');

  const tree = unified().use(remarkParse).parse(content) as Root;

  const doc: ParsedDocument = {
    filePath,
    codeBlocks: [],
    inlineCode: [],
    links: [],
    filePaths: [],
    envVars: [],
    versionClaims: [],
    dependencyClaims: [],
    apiEndpoints: [],
    portClaims: [],
    sections: [],
  };

  const headings: { heading: string; depth: number; line: number; startOffset: number }[] = [];

  visit(tree, (node) => {
    const line = node.position?.start.line ?? 0;

    switch (node.type) {
      case 'code': {
        const codeNode = node as Code;
        const commands = extractCommands(codeNode.value, line);
        doc.codeBlocks.push({
          language: codeNode.lang ?? null,
          value: codeNode.value,
          line,
          commands,
        });
        // Also extract endpoints from code blocks
        doc.apiEndpoints.push(...extractApiEndpoints(codeNode.value, line));
        // Extract env vars from code blocks
        doc.envVars.push(...extractEnvVars(codeNode.value, line));
        // Extract port claims from code blocks
        doc.portClaims.push(...extractPortClaims(codeNode.value, line));
        break;
      }

      case 'inlineCode': {
        const inlineNode = node as MdInlineCode;
        doc.inlineCode.push({ value: inlineNode.value, line });
        // Check if inline code looks like an env var
        if (/^[A-Z][A-Z0-9_]{2,}$/.test(inlineNode.value)) {
          doc.envVars.push({ name: inlineNode.value, line, context: inlineNode.value });
        }
        // Check if inline code looks like a file path
        if (
          inlineNode.value.includes('/') &&
          !inlineNode.value.startsWith('http') &&
          looksLikeFilePath(inlineNode.value)
        ) {
          doc.filePaths.push({ path: inlineNode.value, line, context: inlineNode.value });
        }
        // Extract port claims from inline code
        doc.portClaims.push(...extractPortClaims(inlineNode.value, line));
        break;
      }

      case 'link': {
        const linkNode = node as Link;
        const text = toString(linkNode);
        const isBadge = BADGE_PATTERNS.some((p) => linkNode.url.toLowerCase().includes(p));
        doc.links.push({ url: linkNode.url, text, line, isBadge });
        break;
      }

      case 'heading': {
        const headingNode = node as Heading;
        headings.push({
          heading: toString(headingNode),
          depth: headingNode.depth,
          line,
          startOffset: node.position?.end.offset ?? 0,
        });
        break;
      }

      case 'text': {
        const textNode = node as Text;
        const text = textNode.value;
        doc.filePaths.push(...extractFilePaths(text, line));
        doc.envVars.push(...extractEnvVars(text, line));
        doc.versionClaims.push(...extractVersionClaims(text, line));
        doc.dependencyClaims.push(...extractDependencyClaims(text, line));
        doc.apiEndpoints.push(...extractApiEndpoints(text, line));
        doc.portClaims.push(...extractPortClaims(text, line));
        break;
      }
    }
  });

  // Build sections from headings
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const nextH = headings[i + 1];
    const sectionContent = content.slice(
      h.startOffset,
      nextH ? content.lastIndexOf('\n', nextH.startOffset - 1) : undefined,
    ).trim();

    doc.sections.push({
      heading: h.heading,
      depth: h.depth,
      content: sectionContent,
      line: h.line,
      endLine: nextH ? nextH.line - 1 : content.split('\n').length,
    });
  }

  // Deduplicate env vars by name
  const seenEnvVars = new Set<string>();
  doc.envVars = doc.envVars.filter((v) => {
    if (seenEnvVars.has(v.name)) return false;
    seenEnvVars.add(v.name);
    return true;
  });

  // Deduplicate port claims
  const seenPorts = new Set<number>();
  doc.portClaims = doc.portClaims.filter((p) => {
    if (seenPorts.has(p.port)) return false;
    seenPorts.add(p.port);
    return true;
  });

  return doc;
}

export async function parseAllDocs(patterns: string[], projectPath: string): Promise<ParsedDocument[]> {
  const files = await fg(patterns, {
    cwd: projectPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '.git/**'],
  });

  const docs = await Promise.all(
    files.map((file) => parseMarkdownFile(file, projectPath)),
  );

  return docs;
}
