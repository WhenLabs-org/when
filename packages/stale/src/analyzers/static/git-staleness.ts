import { simpleGit } from 'simple-git';
import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { issueId } from '../../utils/id.js';

const DEFAULT_THRESHOLD_DAYS = 30;

// Source directories to track commits in
const SOURCE_DIRS = ['src/', 'lib/', 'app/', 'pages/', 'components/', 'api/', 'server/', 'packages/'];

export class GitStalenessAnalyzer implements Analyzer {
  name = 'git-staleness';
  category = 'git-staleness' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];

    const thresholdDays = typeof ctx.config.checks.gitStaleness === 'object'
      ? ctx.config.checks.gitStaleness.thresholdDays
      : DEFAULT_THRESHOLD_DAYS;

    let git;
    try {
      git = simpleGit(ctx.projectPath);
      // Verify this is a git repo
      await git.revparse(['--git-dir']);
    } catch {
      // Not a git repo, skip
      return issues;
    }

    for (const doc of ctx.docs) {
      try {
        // Get last modified timestamp of the doc
        const docLog = await git.log({ file: doc.filePath, maxCount: 1 });
        if (!docLog.latest) continue;

        const docLastModified = new Date(docLog.latest.date);
        const now = new Date();
        const docAgeDays = Math.floor((now.getTime() - docLastModified.getTime()) / (1000 * 60 * 60 * 24));

        if (docAgeDays < thresholdDays) continue;

        // Check how many source commits have happened since the doc was last modified
        let totalSourceCommits = 0;
        const activeDirs: string[] = [];

        for (const dir of SOURCE_DIRS) {
          // Check if directory exists in the project
          let dirExists = false;
          for (const file of ctx.codebase.existingFiles) {
            if (file.startsWith(dir)) {
              dirExists = true;
              break;
            }
          }
          if (!dirExists) continue;

          try {
            const srcLog = await git.log({
              file: dir,
              '--after': docLastModified.toISOString(),
            });
            if (srcLog.total > 0) {
              totalSourceCommits += srcLog.total;
              activeDirs.push(`${dir} (${srcLog.total})`);
            }
          } catch {
            continue;
          }
        }

        if (totalSourceCommits > 0) {
          issues.push({
            id: issueId('git-staleness', doc.filePath, 1),
            category: 'git-staleness',
            severity: ctx.config.severity.staleDoc,
            source: { file: doc.filePath, line: 1, text: doc.filePath },
            message: `${doc.filePath} last modified ${docAgeDays} days ago \u2014 source has had ${totalSourceCommits} commits since then`,
            suggestion: `Active directories: ${activeDirs.join(', ')}`,
            gitInfo: {
              lastModified: docLastModified,
              lastModifiedBy: docLog.latest.author_name,
              commitHash: docLog.latest.hash,
            },
          });
        }
      } catch {
        continue;
      }
    }

    return issues;
  }
}
