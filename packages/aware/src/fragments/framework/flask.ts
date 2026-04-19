import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function flaskFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "flask")) return null;

  return {
    id: "flask",
    category: "framework",
    title: "Flask",
    priority: 15,
    content: `## Flask

### Routing & Views
- Define routes with \`@app.route('/path', methods=['GET', 'POST'])\` decorators
- Access request data via \`request.args\` (query params), \`request.form\` (form data), \`request.json\` (JSON body)
- Return responses with \`jsonify()\` for JSON APIs or \`render_template()\` for HTML
- Use \`url_for('function_name')\` to generate URLs — never hardcode paths

### Application Structure
- Use the application factory pattern with \`create_app()\` for testability and configuration flexibility
- Organize large apps with Blueprints: \`bp = Blueprint('auth', __name__)\` then \`app.register_blueprint(bp)\`
- Use \`current_app\` to access the app instance within request context
- Store configuration in config classes or environment variables — use \`app.config.from_object()\`

### Request Context
- Flask provides context locals: \`request\`, \`session\`, \`g\`, and \`current_app\`
- Use \`g\` for per-request data (e.g., current user, database connection) — it resets each request
- Use \`session\` for persistent user data across requests — it is a signed cookie by default
- Use \`before_request\` and \`after_request\` hooks for setup/teardown logic

### Templates & Extensions
- Templates use Jinja2 — place them in \`templates/\` directory
- Use template inheritance: \`{% extends "base.html" %}\` with \`{% block content %}\` for layout
- Common extensions: Flask-SQLAlchemy (ORM), Flask-Login (auth), Flask-WTF (forms), Flask-Migrate (migrations)
- Initialize extensions with the \`init_app()\` pattern to support the application factory

### Error Handling
- Register custom error handlers with \`@app.errorhandler(404)\` to return consistent error responses
- Use \`abort(status_code)\` to immediately stop request processing with an HTTP error
- Log errors with \`app.logger\` — configure proper logging for production

### Best Practices
- Always validate and sanitize user input — Flask does not provide built-in validation
- Use \`flask run --debug\` for development with auto-reload and the interactive debugger
- Keep route handlers thin — extract business logic into service modules
- Use WSGI servers (Gunicorn, uWSGI) in production — never use the development server`,
  };
}
