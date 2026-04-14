import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function rustCliFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "rust-cli")) return null;

  return {
    id: "rust-cli",
    category: "framework",
    title: "Rust CLI Application",
    priority: 15,
    content: `## Rust CLI Application

### Project Structure
- Entry point in \`src/main.rs\` — keep it minimal (parse args, call into lib, handle exit code)
- Core logic in \`src/lib.rs\` with submodules in \`src/\` — this makes the library testable independently
- Group related functionality into modules: \`src/commands/\`, \`src/config/\`, \`src/output/\`

### Argument Parsing with Clap
- Use clap's derive macros (\`#[derive(Parser)]\`) for declarative CLI definitions
- Define subcommands with \`#[derive(Subcommand)]\` enum variants
- Use \`#[arg(short, long, default_value_t)]\` attributes for flag configuration
- Validate arguments in the type system — use enums for constrained values, \`PathBuf\` for file paths

### Error Handling
- Use \`anyhow::Result<T>\` in application code for ergonomic error propagation with \`?\`
- Use \`thiserror::Error\` derive macro for library error types that callers may match on
- Return \`Result<T, E>\` from all fallible functions — never call \`.unwrap()\` or \`.expect()\` in production paths
- Use \`.context("descriptive message")?\` from anyhow to add context to errors for user-facing messages

### Output & User Experience
- Write user-facing output to stdout; diagnostics, progress, and errors to stderr
- Use a library like \`indicatif\` for progress bars and spinners on long operations
- Support \`--quiet\` / \`--verbose\` flags; use \`tracing\` or \`env_logger\` for structured logging
- Exit with appropriate codes: 0 for success, 1 for runtime errors, 2 for usage errors

### Testing
- Unit test modules inline with \`#[cfg(test)] mod tests {}\`
- Integration tests in \`tests/\` directory — they test the public API of your crate
- Use \`assert_cmd\` and \`predicates\` crates for CLI integration testing (assert exit codes, stdout content)
- Use \`tempfile\` crate for tests that need filesystem fixtures`,
  };
}
