import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { issueId } from '../../utils/id.js';
import { findRemovalCommit } from '../../utils/git.js';
import { depsFor } from '../../utils/workspace-scope.js';

// Maps a dependency name (as mentioned in docs) to npm package patterns
const DEPENDENCY_PACKAGE_MAP: Record<string, string[]> = {
  redis: ['redis', 'ioredis', '@redis/client', 'redis-mock'],
  postgresql: ['pg', 'postgres', 'pg-promise', '@prisma/client', 'typeorm', 'knex', 'sequelize'],
  postgres: ['pg', 'postgres', 'pg-promise', '@prisma/client', 'typeorm', 'knex', 'sequelize'],
  mongodb: ['mongodb', 'mongoose', 'mongoist'],
  mongo: ['mongodb', 'mongoose', 'mongoist'],
  mysql: ['mysql', 'mysql2', 'knex', 'sequelize', 'typeorm'],
  mariadb: ['mariadb', 'mysql2', 'knex', 'sequelize'],
  elasticsearch: ['@elastic/elasticsearch', 'elasticsearch'],
  rabbitmq: ['amqplib', 'amqp-connection-manager'],
  kafka: ['kafkajs', 'node-rdkafka'],
  memcached: ['memcached', 'memjs'],
  docker: [],  // Docker is an external dependency, not an npm package
  nginx: [],
  sqlite: ['better-sqlite3', 'sqlite3', 'sql.js'],
};

// Maps dependency names to docker-compose service patterns
const DEPENDENCY_SERVICE_MAP: Record<string, string[]> = {
  redis: ['redis'],
  postgresql: ['postgres', 'postgresql', 'db'],
  postgres: ['postgres', 'postgresql', 'db'],
  mongodb: ['mongo', 'mongodb'],
  mongo: ['mongo', 'mongodb'],
  mysql: ['mysql', 'mariadb', 'db'],
  mariadb: ['mariadb', 'mysql'],
  elasticsearch: ['elasticsearch', 'elastic', 'es'],
  rabbitmq: ['rabbitmq', 'rabbit'],
  kafka: ['kafka'],
  memcached: ['memcached'],
};

export class DependenciesAnalyzer implements Analyzer {
  name = 'dependencies';
  category = 'dependency' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    const serviceNames = ctx.codebase.dockerCompose?.services ?? [];

    for (const doc of ctx.docs) {
      const { deps, devDeps } = depsFor(doc.filePath, ctx.codebase);
      const allDeps = { ...deps, ...devDeps };
      for (const claim of doc.dependencyClaims) {
        const depKey = claim.name.toLowerCase();

        // Check npm packages
        const packagePatterns = DEPENDENCY_PACKAGE_MAP[depKey] ?? [depKey];
        const foundInDeps = packagePatterns.some((p) => p in allDeps);

        // Check docker-compose services
        const servicePatterns = DEPENDENCY_SERVICE_MAP[depKey] ?? [depKey];
        const foundInServices = servicePatterns.some((s) =>
          serviceNames.some((svc) => svc.toLowerCase().includes(s)),
        );

        if (!foundInDeps && !foundInServices && packagePatterns.length > 0) {
          let removalInfo: string | undefined;
          try {
            const commit = await findRemovalCommit(depKey, ctx.projectPath);
            if (commit) {
              removalInfo = `Last seen in git history (commit ${commit.slice(0, 7)})`;
            }
          } catch {}

          issues.push({
            id: issueId('dependency', doc.filePath, claim.line),
            category: 'dependency',
            severity: ctx.config.severity.missingDependency,
            source: { file: doc.filePath, line: claim.line, text: claim.name },
            message: `Lists "${claim.name}" as a prerequisite — not found in dependencies or docker-compose`,
            suggestion: removalInfo ?? 'Removed?',
            evidence: { expected: claim.name },
          });
        }
      }
    }

    return issues;
  }
}
