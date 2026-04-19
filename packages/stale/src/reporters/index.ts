import type { Reporter } from '../types.js';
import { TerminalReporter } from './terminal.js';
import { JsonReporter } from './json.js';
import { MarkdownReporter } from './markdown.js';
import { SarifReporter } from './sarif.js';

export function getReporter(format: string): Reporter {
  switch (format) {
    case 'json': return new JsonReporter();
    case 'markdown': return new MarkdownReporter();
    case 'sarif': return new SarifReporter();
    case 'terminal':
    default:
      return new TerminalReporter();
  }
}
