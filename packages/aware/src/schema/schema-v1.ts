/**
 * Historical snapshot of the v1 `.aware.json` shape. Kept frozen so the
 * migrator can safely consume any file that was written before Phase 0.
 */

export interface AwareConfigV1 {
  version: 1;
  project: {
    name: string;
    description: string;
    architecture: string;
  };
  stack: Record<string, string | string[] | null>;
  conventions: Record<string, unknown>;
  rules: string[];
  structure: Record<string, string>;
  targets: {
    claude: boolean;
    cursor: boolean;
    copilot: boolean;
    agents: boolean;
  };
  _meta: {
    createdAt: string;
    lastSyncedAt: string | null;
    lastDetectionHash: string;
    awareVersion: string;
  };
}
