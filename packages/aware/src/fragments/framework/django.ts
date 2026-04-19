import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function djangoFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "django")) return null;

  return {
    id: "django",
    category: "framework",
    title: "Django",
    priority: 15,
    content: `## Django

### MTV Pattern (Model-Template-View)
- Models define database tables in \`models.py\` using \`django.db.models\` — each class maps to a table
- Views handle request logic — prefer class-based views (CBVs) for standard CRUD, use function-based views for custom logic
- Templates use Django template language (\`{{ variable }}\`, \`{% tag %}\`) — keep logic minimal in templates
- URL routing lives in \`urls.py\` — use \`path()\` for static routes and \`re_path()\` only when regex is needed
- Use \`include()\` in the root \`urls.py\` to delegate to app-level URL configs

### ORM & Database
- Define fields with appropriate types: \`CharField\`, \`IntegerField\`, \`ForeignKey\`, \`ManyToManyField\`
- Use the queryset API for data access: \`filter()\`, \`exclude()\`, \`annotate()\`, \`select_related()\`, \`prefetch_related()\`
- Use \`select_related()\` for foreign key joins and \`prefetch_related()\` for many-to-many to avoid N+1 queries
- Create migrations with \`python manage.py makemigrations\` and apply with \`python manage.py migrate\`
- Never edit migration files manually unless resolving merge conflicts

### Views & Serialization
- Use generic CBVs (\`ListView\`, \`DetailView\`, \`CreateView\`, \`UpdateView\`, \`DeleteView\`) for standard patterns
- For APIs, use Django REST Framework (DRF) with \`ModelSerializer\` and \`ViewSet\` classes
- Use \`@login_required\` or \`LoginRequiredMixin\` to protect views that require authentication
- Return proper HTTP status codes and use \`JsonResponse\` for JSON endpoints

### Configuration & Settings
- Settings live in \`settings.py\` — use environment variables for secrets (\`SECRET_KEY\`, database credentials)
- Use \`INSTALLED_APPS\` to register apps — order matters for template resolution and signal loading
- Configure \`DATABASES\` with the appropriate engine for your database backend
- Use \`STATICFILES_DIRS\` and \`MEDIA_ROOT\` for static and uploaded file management

### Best Practices
- Keep apps small and focused — each app should handle one domain concern
- Use Django admin for internal tools — customize with \`ModelAdmin\` classes
- Write model methods for business logic — keep views thin
- Use signals sparingly — prefer explicit method calls for clarity
- Use \`get_object_or_404()\` in views to handle missing objects cleanly`,
  };
}
