import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function angularFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "angular")) return null;

  return {
    id: "angular",
    category: "framework",
    title: "Angular",
    priority: 12,
    content: `## Angular

### Architecture
- Use standalone components by default (Angular 14+) — avoid NgModules for new code
- Organize by feature: each feature gets its own directory with component, service, and routes
- Use the Angular CLI (\`ng generate\`) for scaffolding components, services, pipes, guards
- Follow the single-responsibility principle — one component/service per file

### Components
- Use signals for reactive state (\`signal()\`, \`computed()\`, \`effect()\`) — prefer over RxJS for component state
- Use \`@Input()\` and \`@Output()\` (or signal-based \`input()\` / \`output()\`) for component communication
- Use \`OnPush\` change detection strategy for performance
- Templates use the control flow syntax (\`@if\`, \`@for\`, \`@switch\`) — avoid \`*ngIf\`/\`*ngFor\` directives

### Services & DI
- Use \`@Injectable({ providedIn: 'root' })\` for singleton services
- Use the \`inject()\` function instead of constructor injection
- Use \`HttpClient\` for API calls — always handle errors with \`catchError\`

### Routing
- Use lazy loading with \`loadComponent\` / \`loadChildren\` for route-level code splitting
- Use route guards (\`canActivate\`, \`canDeactivate\`) for access control
- Use resolvers for pre-fetching data before route activation

### Testing
- Unit test components with \`TestBed\` — use \`ComponentFixture\` for DOM testing
- Mock services with \`jasmine.createSpyObj\` or provide test doubles
- Use \`HttpClientTestingModule\` for HTTP testing`,
  };
}
