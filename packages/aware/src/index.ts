export { createTool } from "./tool.js";
export { scan } from "./scan.js";
export type { ScanOptions, ScanOutput, GeneratedFile } from "./scan.js";
export type {
  DetectedStack,
  StackItem,
  StackConfig,
  AwareConfig,
  ConfigMeta,
  ConventionsConfig,
  ExtractedConventions,
  Fragment,
  FragmentFunction,
  FragmentModule,
  TargetsConfig,
  TargetName,
  GeneratorResult,
} from "./types.js";
export { registerFragmentModule, resolveFragments } from "./fragments/index.js";
export { versionMatches, majorVersion, majorEq } from "./fragments/common.js";
export { migrate } from "./schema/migrate.js";
export {
  hashContent,
  stampHash,
  extractStampedHash,
  verifyStampedHash,
  normalizeForHash,
} from "./core/hash.js";
export { readLockfile } from "./core/lockfile.js";
export type { LockfileVersionMap } from "./core/lockfile.js";
export {
  parsePackageJson,
  loadProjectDeps,
  getDepVersion,
  getRawDepVersion,
  cleanVersion,
} from "./utils/parsers.js";
export {
  extractConventions,
  extractNaming,
  extractTestLayout,
  extractLayout,
  sampleProjectFiles,
} from "./conventions/extractor.js";
export type {
  NamingExtraction,
  NamingStyle,
} from "./conventions/naming.js";
export type {
  TestLayoutExtraction,
  TestLayout,
} from "./conventions/tests.js";
export type {
  LayoutExtraction,
  LayoutPattern,
} from "./conventions/layout.js";
export type { SampledFiles, SampleOptions } from "./conventions/sample.js";
export {
  discoverWorkspace,
  resolvePackageConfig,
  scanMonorepo,
  computeExtendsPath,
} from "./monorepo/index.js";
export type {
  DiscoveredPackage,
  WorkspaceDiscovery,
  ResolvedPackageConfig,
  MonorepoScanResult,
} from "./monorepo/index.js";
export {
  definePlugin,
  defineFragment,
  loadPlugins,
  resetLoadedPlugins,
} from "./plugins/index.js";
export type {
  Plugin,
  LoadPluginsOptions,
  LoadPluginsResult,
  LoadedPlugin,
} from "./plugins/index.js";
export {
  openMarker,
  closeMarker,
  wrapSection,
  parseSections,
  findSectionIssues,
  footerWithPlaceholder,
} from "./core/markers.js";
export type { ParsedSection, SectionIssue, SectionIssueKind } from "./core/markers.js";
export {
  SECTION_MARKER_PREFIX,
  SECTION_CUSTOM_TOKEN,
  HASH_MARKER_PREFIX,
  HASH_PLACEHOLDER,
} from "./constants.js";
export {
  computeDriftReport,
  computeStackDrift,
  computeContentDrift,
  exitCodeFor,
  ROOT_PACKAGE_KEY,
} from "./diff/index.js";
export type {
  DriftReport,
  DriftSeverity,
  StackDrift,
  ContentDrift,
  ContentDriftKind,
  SectionDrift,
  ComputeDriftOptions,
  ContentDriftOptions,
  DisabledTarget,
} from "./diff/index.js";
