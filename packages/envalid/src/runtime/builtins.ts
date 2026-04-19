import type { ValidatorDefinition } from "./registry.js";

export const BUILTIN_TYPES = [
  "string",
  "integer",
  "float",
  "boolean",
  "url",
  "email",
  "enum",
  "csv",
  "json",
  "path",
  "semver",
] as const;

export type BuiltinType = (typeof BUILTIN_TYPES)[number];

export const builtinValidators: ValidatorDefinition[] = [
  {
    name: "string",
    typeHint: "string",
    validate: (value, schema) => {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return {
          valid: false,
          message: `Length ${value.length} is below minimum ${schema.minLength}`,
        };
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return {
          valid: false,
          message: `Length ${value.length} exceeds maximum ${schema.maxLength}`,
        };
      }
      if (schema.pattern) {
        const re = new RegExp(schema.pattern);
        if (!re.test(value)) {
          return {
            valid: false,
            message: `Does not match pattern ${schema.pattern}`,
          };
        }
      }
      return { valid: true };
    },
    toJsonSchema: (schema) => {
      const out: Record<string, unknown> = { type: "string" };
      if (schema.minLength !== undefined) out.minLength = schema.minLength;
      if (schema.maxLength !== undefined) out.maxLength = schema.maxLength;
      if (schema.pattern) out.pattern = schema.pattern;
      return out;
    },
  },
  {
    name: "integer",
    typeHint: "number",
    validate: (value, schema) => {
      const n = Number(value);
      if (value.trim() === "" || isNaN(n) || !Number.isInteger(n)) {
        return { valid: false, message: `"${value}" is not a valid integer` };
      }
      if (schema.range) {
        const [min, max] = schema.range;
        if (n < min || n > max) {
          return {
            valid: false,
            message: `${n} is outside range [${min}, ${max}]`,
          };
        }
      }
      return { valid: true };
    },
    toJsonSchema: (schema) => {
      const out: Record<string, unknown> = { type: "integer" };
      if (schema.range) {
        out.minimum = schema.range[0];
        out.maximum = schema.range[1];
      }
      return out;
    },
  },
  {
    name: "float",
    typeHint: "number",
    validate: (value, schema) => {
      const n = parseFloat(value);
      if (value.trim() === "" || isNaN(n)) {
        return { valid: false, message: `"${value}" is not a valid float` };
      }
      if (schema.range) {
        const [min, max] = schema.range;
        if (n < min || n > max) {
          return {
            valid: false,
            message: `${n} is outside range [${min}, ${max}]`,
          };
        }
      }
      return { valid: true };
    },
    toJsonSchema: (schema) => {
      const out: Record<string, unknown> = { type: "number" };
      if (schema.range) {
        out.minimum = schema.range[0];
        out.maximum = schema.range[1];
      }
      return out;
    },
  },
  {
    name: "boolean",
    typeHint: "boolean",
    validate: (value) => {
      if (!["true", "false", "1", "0"].includes(value.toLowerCase())) {
        return {
          valid: false,
          message: `"${value}" is not a valid boolean (expected true/false/1/0)`,
        };
      }
      return { valid: true };
    },
    toJsonSchema: () => ({ type: "boolean" }),
  },
  {
    name: "url",
    typeHint: "string",
    validate: (value, schema) => {
      try {
        const url = new URL(value);
        if (schema.protocol) {
          const proto = url.protocol.replace(":", "");
          if (!schema.protocol.includes(proto)) {
            return {
              valid: false,
              message: `Protocol "${proto}" not in allowed list: ${schema.protocol.join(", ")}`,
            };
          }
        }
        return { valid: true };
      } catch {
        return { valid: false, message: `"${value}" is not a valid URL` };
      }
    },
    toJsonSchema: () => ({ type: "string", format: "uri" }),
  },
  {
    name: "email",
    typeHint: "string",
    validate: (value) => {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(value)
        ? { valid: true }
        : { valid: false, message: `"${value}" is not a valid email` };
    },
    toJsonSchema: () => ({ type: "string", format: "email" }),
  },
  {
    name: "enum",
    typeHint: "string",
    validate: (value, schema) => {
      if (!schema.values?.includes(value)) {
        return {
          valid: false,
          message: `"${value}" is not one of: ${schema.values?.join(", ")}`,
        };
      }
      return { valid: true };
    },
    toJsonSchema: (schema) => ({
      type: "string",
      enum: schema.values ?? [],
    }),
  },
  {
    name: "csv",
    typeHint: "array",
    validate: (value) => {
      if (value.trim() === "") {
        return { valid: false, message: "CSV value is empty" };
      }
      return { valid: true };
    },
    toJsonSchema: () => ({
      type: "string",
      pattern: "^([^,]+)(,[^,]+)*$",
      "x-envalid-csv": true,
    }),
  },
  {
    name: "json",
    typeHint: "json",
    validate: (value) => {
      try {
        JSON.parse(value);
        return { valid: true };
      } catch {
        return { valid: false, message: `"${value}" is not valid JSON` };
      }
    },
    toJsonSchema: () => ({ "x-envalid-json": true }),
  },
  {
    name: "path",
    typeHint: "string",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return { valid: false, message: "Path is empty" };
      }
      return { valid: true };
    },
    toJsonSchema: () => ({ type: "string" }),
  },
  {
    name: "semver",
    typeHint: "string",
    validate: (value) => {
      const re = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
      return re.test(value)
        ? { valid: true }
        : { valid: false, message: `"${value}" is not valid semver` };
    },
    toJsonSchema: () => ({
      type: "string",
      pattern: "^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.]+)?(\\+[a-zA-Z0-9.]+)?$",
    }),
  },
];

export function registerBuiltins(
  registry: { registerValidator: (def: ValidatorDefinition) => void },
): void {
  for (const v of builtinValidators) registry.registerValidator(v);
}
