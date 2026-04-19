import type {
  Reporter,
  ValidationResult,
  DiffResult,
} from "../schema/types.js";

export class JsonReporter implements Reporter {
  reportValidation(result: ValidationResult): string {
    return JSON.stringify(result, null, 2);
  }

  reportDiff(result: DiffResult): string {
    return JSON.stringify(result, null, 2);
  }

  reportSync(results: Map<string, ValidationResult>): string {
    return JSON.stringify(Object.fromEntries(results), null, 2);
  }
}
