import net from 'node:net';
import type { FrameworkDefault } from '../types.js';

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function isPrivilegedPort(port: number): boolean {
  return port < 1024;
}

export function parsePortString(s: string): number | null {
  const n = parseInt(s, 10);
  if (isNaN(n) || !isValidPort(n)) return null;
  return n;
}

export function findFreePort(startFrom: number, exclude: number[] = []): Promise<number> {
  const excludeSet = new Set(exclude);
  let candidate = startFrom;
  let attempts = 0;

  const tryPort = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });
  };

  return new Promise(async (resolve, reject) => {
    while (attempts < 100) {
      if (!excludeSet.has(candidate) && isValidPort(candidate)) {
        if (await tryPort(candidate)) {
          resolve(candidate);
          return;
        }
      }
      candidate++;
      attempts++;
    }
    reject(new Error(`Could not find a free port after 100 attempts starting from ${startFrom}`));
  });
}

export const WELL_KNOWN_PORTS: Record<number, string> = {
  80: 'HTTP',
  443: 'HTTPS',
  1234: 'Parcel',
  3000: 'Dev Server',
  3306: 'MySQL',
  4200: 'Angular',
  4321: 'Astro',
  5000: 'Flask',
  5173: 'Vite',
  5432: 'PostgreSQL',
  5433: 'PostgreSQL (alt)',
  6006: 'Storybook',
  6379: 'Redis',
  8000: 'Django/FastAPI',
  8080: 'HTTP Proxy',
  8443: 'HTTPS Alt',
  8888: 'Jupyter',
  9090: 'Prometheus',
  9200: 'Elasticsearch',
  27017: 'MongoDB',
};

export const FRAMEWORK_DEFAULTS: FrameworkDefault[] = [
  { name: 'Next.js', defaultPort: 3000, detectBy: { dependency: 'next', file: 'next.config', command: 'next dev' } },
  { name: 'Vite', defaultPort: 5173, detectBy: { dependency: 'vite', file: 'vite.config', command: 'vite' } },
  { name: 'Create React App', defaultPort: 3000, detectBy: { dependency: 'react-scripts', command: 'react-scripts start' } },
  { name: 'Angular', defaultPort: 4200, detectBy: { dependency: '@angular/cli', command: 'ng serve' } },
  { name: 'Vue CLI', defaultPort: 8080, detectBy: { dependency: '@vue/cli-service', command: 'vue-cli-service serve' } },
  { name: 'Storybook', defaultPort: 6006, detectBy: { dependency: 'storybook', command: 'storybook dev' } },
  { name: 'Remix', defaultPort: 3000, detectBy: { dependency: '@remix-run/dev', command: 'remix dev' } },
  { name: 'Astro', defaultPort: 4321, detectBy: { dependency: 'astro', command: 'astro dev' } },
  { name: 'Nuxt', defaultPort: 3000, detectBy: { dependency: 'nuxt', command: 'nuxt dev' } },
  { name: 'Gatsby', defaultPort: 8000, detectBy: { dependency: 'gatsby', command: 'gatsby develop' } },
  { name: 'SvelteKit', defaultPort: 5173, detectBy: { dependency: '@sveltejs/kit', command: 'vite dev' } },
  { name: 'Webpack Dev Server', defaultPort: 8080, detectBy: { dependency: 'webpack-dev-server', command: 'webpack serve' } },
  { name: 'Parcel', defaultPort: 1234, detectBy: { dependency: 'parcel', command: 'parcel' } },
  { name: 'Django', defaultPort: 8000, detectBy: { file: 'manage.py', command: 'runserver' } },
  { name: 'Flask', defaultPort: 5000, detectBy: { command: 'flask run' } },
  { name: 'FastAPI', defaultPort: 8000, detectBy: { command: 'uvicorn' } },
  { name: 'Rails', defaultPort: 3000, detectBy: { file: 'Gemfile', command: 'rails server' } },
];
