export { createTool, scan, type StaleScanOptions } from './tool.js';
export { scan as scanRaw, type ScanOutcome } from './commands/scan.js';
export type {
  DriftReport,
  DriftIssue,
  DriftCategory,
  DriftSummary,
  StaleConfig,
  Severity,
} from './types.js';
