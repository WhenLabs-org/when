import type { ComposedContext, GeneratorResult, TargetName } from "../types.js";

export abstract class BaseGenerator {
  abstract readonly target: TargetName;
  abstract readonly filePath: string;
  abstract generate(context: ComposedContext): GeneratorResult;
}
