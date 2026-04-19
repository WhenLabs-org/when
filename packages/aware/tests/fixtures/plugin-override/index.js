/**
 * Sample plugin that REPLACES a core fragment by declaring
 * `replaces: ["nextjs-app-router"]`. `replaces` targets the produced
 * Fragment.id (what other fragments render with), not the owning
 * FragmentModule.id — so the core `nextjs-15` module stops contributing
 * under that id and this plugin's content wins.
 */

export default {
  name: "aware-plugin-override",
  version: "0.1.0",
  fragments: [
    {
      id: "nextjs-15-override",
      category: "framework",
      priority: 10,
      replaces: ["nextjs-app-router"],
      appliesTo: {
        stack: "nextjs",
        variant: "app-router",
        versionRange: ">=15",
      },
      build: () => ({
        id: "nextjs-app-router",
        category: "framework",
        title: "Next.js (plugin override)",
        content: "## Plugin Override\n- This replaced the core Next.js fragment.",
        priority: 10,
      }),
    },
  ],
};
