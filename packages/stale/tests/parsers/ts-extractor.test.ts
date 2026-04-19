import { describe, it, expect } from 'vitest';
import { extractFromTsSource } from '../../src/parsers/ast/ts-extractor.js';

describe('TS AST extractor', () => {
  describe('env vars', () => {
    it('finds process.env.FOO', () => {
      const { envVars } = extractFromTsSource('a.ts', `const x = process.env.API_KEY;`);
      expect(envVars.map((e) => e.name)).toContain('API_KEY');
    });

    it('finds process.env["FOO"]', () => {
      const { envVars } = extractFromTsSource('a.ts', `const x = process.env["DATABASE_URL"];`);
      expect(envVars.map((e) => e.name)).toContain('DATABASE_URL');
    });

    it('finds destructured env vars', () => {
      const { envVars } = extractFromTsSource('a.ts', `const { API_KEY, PORT } = process.env;`);
      expect(envVars.map((e) => e.name).sort()).toEqual(['API_KEY', 'PORT']);
    });

    it('ignores lowercase names (likely not env vars)', () => {
      const { envVars } = extractFromTsSource('a.ts', `const x = process.env.foo;`);
      expect(envVars).toHaveLength(0);
    });

    it('does not extract env vars from string literals', () => {
      const { envVars } = extractFromTsSource('a.ts', `const s = "process.env.API_KEY";`);
      expect(envVars).toHaveLength(0);
    });

    it('does not extract env vars from comments', () => {
      const { envVars } = extractFromTsSource('a.ts', `// process.env.FAKE_VAR\nconst x = 1;`);
      expect(envVars).toHaveLength(0);
    });
  });

  describe('routes', () => {
    it('finds app.get(...) routes', () => {
      const src = `
        const app = express();
        app.get('/users', (req, res) => res.json([]));
        app.post('/users', (req, res) => res.json({}));
      `;
      const { routes } = extractFromTsSource('server.ts', src);
      expect(routes).toHaveLength(2);
      expect(routes[0]).toMatchObject({ method: 'GET', path: '/users', framework: 'express' });
      expect(routes[1]).toMatchObject({ method: 'POST', path: '/users' });
    });

    it('finds router.put routes', () => {
      const src = `const router = Router(); router.put('/items/:id', handler);`;
      const { routes } = extractFromTsSource('a.ts', src);
      expect(routes[0]).toMatchObject({ method: 'PUT', path: '/items/:id' });
    });

    it('ignores non-router method calls', () => {
      const src = `foo.get('/ignored', bar);`;
      const { routes } = extractFromTsSource('a.ts', src);
      expect(routes).toHaveLength(0);
    });

    it('ignores strings that look like routes', () => {
      const src = `const s = "app.get('/foo', handler)";`;
      const { routes } = extractFromTsSource('a.ts', src);
      expect(routes).toHaveLength(0);
    });

    it('detects fastify framework', () => {
      const src = `import fastify from 'fastify'; const server = fastify(); server.get('/x', () => {});`;
      const { routes } = extractFromTsSource('a.ts', src);
      expect(routes[0]?.framework).toBe('fastify');
    });

    it('detects route chains: router.route("/x").get(handler)', () => {
      const src = `
        const router = Router();
        router.route('/items').get(list).post(create);
      `;
      const { routes } = extractFromTsSource('a.ts', src);
      expect(routes).toHaveLength(2);
      expect(routes).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/items' }),
        expect.objectContaining({ method: 'POST', path: '/items' }),
      ]));
    });

    it('detects route chains with three methods', () => {
      const src = `
        const app = express();
        app.route('/users/:id')
          .get(getUser)
          .put(updateUser)
          .delete(deleteUser);
      `;
      const { routes } = extractFromTsSource('a.ts', src);
      expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
        'DELETE /users/:id',
        'GET /users/:id',
        'PUT /users/:id',
      ]);
    });
  });

  describe('symbols', () => {
    it('collects declarations', () => {
      const src = `
        function foo() {}
        class Bar {}
        const baz = 1;
        interface Qux {}
        type Quux = string;
      `;
      const { symbols } = extractFromTsSource('a.ts', src);
      expect(symbols).toEqual(expect.arrayContaining(['foo', 'Bar', 'baz', 'Qux', 'Quux']));
    });
  });
});
