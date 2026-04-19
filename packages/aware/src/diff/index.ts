export { computeStackDrift } from "./stack-diff.js";
export { computeContentDrift } from "./content-diff.js";
// `diffSections` is an implementation detail of `computeContentDrift`;
// kept module-local. Tests in tests/diff/ import it directly from
// "./content-diff.js" when they need to.
export {
  computeDriftReport,
  exitCodeFor,
  ROOT_PACKAGE_KEY,
} from "./drift-report.js";
export type {
  DriftReport,
  DriftSeverity,
  StackDrift,
  ContentDrift,
  ContentDriftKind,
  SectionDrift,
} from "./types.js";
export type { ComputeDriftOptions } from "./drift-report.js";
export type { ContentDriftOptions, DisabledTarget } from "./content-diff.js";
