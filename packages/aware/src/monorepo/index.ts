export { discoverWorkspace } from "./discovery.js";
export type { DiscoveredPackage, WorkspaceDiscovery } from "./discovery.js";
export { resolvePackageConfig } from "./resolver.js";
export type { ResolvedPackageConfig } from "./resolver.js";
export {
  scanMonorepo,
  computeExtendsPath,
} from "./scoped-scan.js";
export type { MonorepoScanResult } from "./scoped-scan.js";
