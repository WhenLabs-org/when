/**
 * Sample plugin used by the Phase 5 loader tests. Ships as a bare JS
 * file (rather than requiring a build step) so tests can dynamic-
 * import it directly from tests/fixtures.
 */

export const plugin = {
  name: "aware-plugin-sample",
  version: "1.0.0",
  fragments: [
    {
      id: "sample-plugin-fragment",
      category: "framework",
      priority: 5,
      build: () => ({
        id: "sample-plugin-fragment",
        category: "framework",
        title: "Sample Plugin",
        content: "## Plugin Guidance\n- This came from a plugin, not core.",
        priority: 5,
      }),
    },
  ],
};

export default plugin;
