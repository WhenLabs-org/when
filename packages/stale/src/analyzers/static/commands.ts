import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { findSimilar } from '../../utils/similarity.js';
import { issueId } from '../../utils/id.js';

export class CommandsAnalyzer implements Analyzer {
  name = 'commands';
  category = 'command' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    const { scripts } = ctx.codebase;
    const scriptNames = Object.keys(scripts);

    for (const doc of ctx.docs) {
      for (const block of doc.codeBlocks) {
        for (const cmd of block.commands) {
          if (cmd.manager === 'make') {
            if (cmd.scriptName && !ctx.codebase.makeTargets.includes(cmd.scriptName)) {
              const similar = findSimilar(cmd.scriptName, ctx.codebase.makeTargets);
              issues.push({
                id: issueId('command', doc.filePath, cmd.line),
                category: 'command',
                severity: ctx.config.severity.deadCommand,
                source: { file: doc.filePath, line: cmd.line, text: cmd.raw },
                message: `\`make ${cmd.scriptName}\` — target "${cmd.scriptName}" not found in Makefile`,
                suggestion: similar.length > 0 ? `Did you mean: ${similar.map((s) => `\`make ${s}\``).join(', ')}?` : undefined,
                evidence: { expected: cmd.scriptName, similarMatches: similar },
              });
            }
            continue;
          }

          if (!cmd.scriptName) continue;

          // npm/yarn/pnpm script check
          if (cmd.manager === 'npm' || cmd.manager === 'yarn' || cmd.manager === 'pnpm') {
            if (!(cmd.scriptName in scripts)) {
              const similar = findSimilar(cmd.scriptName, scriptNames);
              issues.push({
                id: issueId('command', doc.filePath, cmd.line),
                category: 'command',
                severity: ctx.config.severity.deadCommand,
                source: { file: doc.filePath, line: cmd.line, text: cmd.raw },
                message: `\`${cmd.raw}\` — script "${cmd.scriptName}" not found in package.json`,
                suggestion: similar.length > 0
                  ? `Did you mean: ${similar.map((s) => `\`${cmd.manager} run ${s}\``).join(', ')}?`
                  : scriptNames.length > 0
                    ? `Available scripts: ${scriptNames.join(', ')}`
                    : undefined,
                evidence: { expected: cmd.scriptName, similarMatches: similar },
              });
            } else {
              // Script exists — check for tool mismatches
              const scriptValue = scripts[cmd.scriptName];
              const { dependencies, devDependencies } = ctx.codebase;
              const allDeps = { ...dependencies, ...devDependencies };

              if (scriptValue.includes('jest') && !('jest' in allDeps) && 'vitest' in allDeps) {
                issues.push({
                  id: issueId('command', doc.filePath, cmd.line),
                  category: 'command',
                  severity: 'warning',
                  source: { file: doc.filePath, line: cmd.line, text: cmd.raw },
                  message: `\`${cmd.raw}\` — script calls \`jest\` but jest is not in dependencies (vitest is installed instead)`,
                  suggestion: 'Likely a test runner migration artifact',
                  evidence: { expected: 'jest', actual: 'vitest' },
                });
              }
            }
          }

          // npx check
          if (cmd.manager === 'npx') {
            const pkg = cmd.scriptName;
            const allDeps = { ...ctx.codebase.dependencies, ...ctx.codebase.devDependencies };
            if (pkg && !(pkg in allDeps)) {
              // npx can run packages not in deps, so just warn
              issues.push({
                id: issueId('command', doc.filePath, cmd.line),
                category: 'command',
                severity: 'info',
                source: { file: doc.filePath, line: cmd.line, text: cmd.raw },
                message: `\`${cmd.raw}\` — package "${pkg}" is not in project dependencies`,
              });
            }
          }
        }
      }
    }

    return issues;
  }
}
