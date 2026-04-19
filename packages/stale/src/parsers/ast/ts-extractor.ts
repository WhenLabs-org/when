import ts from 'typescript';
import type { CodeEnvVar, CodeRoute } from '../../types.js';

export interface TsFileFacts {
  envVars: CodeEnvVar[];
  routes: CodeRoute[];
  symbols: string[];
}

const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]+$/;
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);
const ROUTER_IDENTS = new Set(['app', 'router', 'server', 'fastify', 'hono', 'api']);

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.ts') || file.endsWith('.mts') || file.endsWith('.cts')) return ts.ScriptKind.TS;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function stringLiteralValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function frameworkFor(source: string): CodeRoute['framework'] {
  if (/\bfastify\b/.test(source)) return 'fastify';
  if (/\bexpress\b/.test(source)) return 'express';
  if (/\bkoa\b/.test(source)) return 'koa';
  if (/\bhono\b/.test(source)) return 'hono';
  return 'unknown';
}

function collectEnvFromPropertyAccess(
  node: ts.PropertyAccessExpression,
  file: string,
  sf: ts.SourceFile,
  out: CodeEnvVar[],
): void {
  const expr = node.expression;
  if (ts.isPropertyAccessExpression(expr)) {
    if (
      ts.isIdentifier(expr.expression) && expr.expression.text === 'process' &&
      ts.isIdentifier(expr.name) && expr.name.text === 'env'
    ) {
      const name = node.name.text;
      if (ENV_VAR_NAME.test(name)) {
        out.push({ name, file, line: lineOf(sf, node.name.getStart(sf)) });
      }
    }
  }
}

function collectEnvFromElementAccess(
  node: ts.ElementAccessExpression,
  file: string,
  sf: ts.SourceFile,
  out: CodeEnvVar[],
): void {
  const expr = node.expression;
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) && expr.expression.text === 'process' &&
    ts.isIdentifier(expr.name) && expr.name.text === 'env'
  ) {
    const arg = node.argumentExpression;
    const literal = arg ? stringLiteralValue(arg) : null;
    if (literal && ENV_VAR_NAME.test(literal)) {
      out.push({ name: literal, file, line: lineOf(sf, node.getStart(sf)) });
    }
  }
}

function collectDestructuredEnv(
  node: ts.VariableDeclaration,
  file: string,
  sf: ts.SourceFile,
  out: CodeEnvVar[],
): void {
  const init = node.initializer;
  if (!init) return;
  const isProcessEnv =
    ts.isPropertyAccessExpression(init) &&
    ts.isIdentifier(init.expression) && init.expression.text === 'process' &&
    ts.isIdentifier(init.name) && init.name.text === 'env';
  if (!isProcessEnv) return;
  if (!ts.isObjectBindingPattern(node.name)) return;
  for (const element of node.name.elements) {
    const binding = element.propertyName ?? element.name;
    if (ts.isIdentifier(binding)) {
      const name = binding.text;
      if (ENV_VAR_NAME.test(name)) {
        out.push({ name, file, line: lineOf(sf, binding.getStart(sf)) });
      }
    } else if (ts.isStringLiteral(binding) && ENV_VAR_NAME.test(binding.text)) {
      out.push({ name: binding.text, file, line: lineOf(sf, binding.getStart(sf)) });
    }
  }
}

/** Returns the path from `router.route('/x')` if node matches that shape. */
function pathFromRouteCall(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  if (callee.name.text !== 'route') return null;
  const arg = node.arguments[0];
  if (!arg) return null;
  const val = stringLiteralValue(arg);
  if (!val || !val.startsWith('/')) return null;
  return val;
}

function baseReceiver(node: ts.Node): ts.Node {
  let recv: ts.Node = node;
  while (ts.isPropertyAccessExpression(recv) || ts.isCallExpression(recv)) {
    recv = ts.isPropertyAccessExpression(recv) ? recv.expression : recv.expression;
  }
  return recv;
}

function collectRouteFromCall(
  node: ts.CallExpression,
  file: string,
  sf: ts.SourceFile,
  framework: CodeRoute['framework'],
  out: CodeRoute[],
): void {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return;
  const methodName = callee.name.text.toLowerCase();
  if (!HTTP_METHODS.has(methodName)) return;

  const recv = baseReceiver(callee.expression);
  const recvName =
    ts.isIdentifier(recv) ? recv.text.toLowerCase() :
    recv.kind === ts.SyntaxKind.ThisKeyword ? 'this' :
    '';
  if (recvName !== 'this' && !ROUTER_IDENTS.has(recvName)) return;

  // Case A: router.get('/x', handler) — path is the first argument
  const directPath = stringLiteralValue(node.arguments[0] ?? ({} as ts.Node));
  if (directPath && directPath.startsWith('/')) {
    out.push({
      method: methodName.toUpperCase(),
      path: directPath,
      file,
      line: lineOf(sf, node.getStart(sf)),
      framework,
    });
    return;
  }

  // Case B: router.route('/x').get(handler) — walk up the call chain to
  // find the first .route('/path') call and use its argument.
  let cursor: ts.Node = callee.expression;
  while (cursor) {
    const routePath = pathFromRouteCall(cursor);
    if (routePath) {
      out.push({
        method: methodName.toUpperCase(),
        path: routePath,
        file,
        line: lineOf(sf, node.getStart(sf)),
        framework,
      });
      return;
    }
    if (ts.isCallExpression(cursor) && ts.isPropertyAccessExpression(cursor.expression)) {
      cursor = cursor.expression.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(cursor)) {
      cursor = cursor.expression;
      continue;
    }
    break;
  }
}

function collectSymbolName(node: ts.Node, out: Set<string>): void {
  if (ts.isFunctionDeclaration(node) && node.name) out.add(node.name.text);
  else if (ts.isClassDeclaration(node) && node.name) out.add(node.name.text);
  else if (ts.isInterfaceDeclaration(node)) out.add(node.name.text);
  else if (ts.isTypeAliasDeclaration(node)) out.add(node.name.text);
  else if (ts.isEnumDeclaration(node)) out.add(node.name.text);
  else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) out.add(node.name.text);
  else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) out.add(node.name.text);
}

export function extractFromTsSource(file: string, source: string): TsFileFacts {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const framework = frameworkFor(source);
  const envVars: CodeEnvVar[] = [];
  const routes: CodeRoute[] = [];
  const symbolSet = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) collectEnvFromPropertyAccess(node, file, sf, envVars);
    else if (ts.isElementAccessExpression(node)) collectEnvFromElementAccess(node, file, sf, envVars);
    else if (ts.isVariableDeclaration(node)) collectDestructuredEnv(node, file, sf, envVars);
    if (ts.isCallExpression(node)) collectRouteFromCall(node, file, sf, framework, routes);
    collectSymbolName(node, symbolSet);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return { envVars, routes, symbols: Array.from(symbolSet) };
}

export function isTsLikeFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(file);
}
