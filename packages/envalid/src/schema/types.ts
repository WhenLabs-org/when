// The 11 supported value types
export type SchemaValueType =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "url"
  | "email"
  | "enum"
  | "csv"
  | "json"
  | "path"
  | "semver";

// Per-variable schema definition
export interface VariableSchema {
  type: SchemaValueType;
  required: boolean;
  default?: string | number | boolean;
  description?: string;
  sensitive?: boolean;
  environments?: string[]; // only required in these environments

  // Type-specific constraints
  pattern?: string; // string: regex pattern
  range?: [number, number]; // integer/float: [min, max]
  values?: string[]; // enum: allowed values
  protocol?: string[]; // url: allowed protocols
  minLength?: number; // string: minimum length
  maxLength?: number; // string: maximum length
}

// Group definition
export interface GroupSchema {
  variables: string[];
  description?: string;
  required_in?: string[];
}

// The top-level schema document
export interface EnvSchema {
  version: number;
  variables: Record<string, VariableSchema>;
  groups?: Record<string, GroupSchema>;
}

// Validation result types
export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  variable: string;
  severity: ValidationSeverity;
  message: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  stats: {
    total: number;
    valid: number;
    errors: number;
    warnings: number;
    missing: number;
  };
}

// Diff result types
export interface DiffEntry {
  variable: string;
  status: "added" | "removed" | "changed";
  sourceValue?: string;
  targetValue?: string;
  inSchema: boolean;
  required: boolean;
}

export interface DiffResult {
  source: string;
  target: string;
  entries: DiffEntry[];
}

// Reporter interface
export interface Reporter {
  reportValidation(result: ValidationResult): string;
  reportDiff(result: DiffResult): string;
  reportSync(results: Map<string, ValidationResult>): string;
}
