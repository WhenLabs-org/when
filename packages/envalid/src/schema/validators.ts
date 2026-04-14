import type { SchemaValueType, VariableSchema } from "./types.js";

export interface ValidatorResult {
  valid: boolean;
  message?: string;
}

type ValidatorFn = (value: string, schema: VariableSchema) => ValidatorResult;

const validators: Record<SchemaValueType, ValidatorFn> = {
  string: (value, schema) => {
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

  integer: (value, schema) => {
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

  float: (value, schema) => {
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

  boolean: (value) => {
    if (!["true", "false", "1", "0"].includes(value.toLowerCase())) {
      return {
        valid: false,
        message: `"${value}" is not a valid boolean (expected true/false/1/0)`,
      };
    }
    return { valid: true };
  },

  url: (value, schema) => {
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

  email: (value) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(value)
      ? { valid: true }
      : { valid: false, message: `"${value}" is not a valid email` };
  },

  enum: (value, schema) => {
    if (!schema.values?.includes(value)) {
      return {
        valid: false,
        message: `"${value}" is not one of: ${schema.values?.join(", ")}`,
      };
    }
    return { valid: true };
  },

  csv: (value) => {
    if (value.trim() === "") {
      return { valid: false, message: "CSV value is empty" };
    }
    return { valid: true };
  },

  json: (value) => {
    try {
      JSON.parse(value);
      return { valid: true };
    } catch {
      return { valid: false, message: `"${value}" is not valid JSON` };
    }
  },

  path: (value) => {
    if (!value || value.trim().length === 0) {
      return { valid: false, message: "Path is empty" };
    }
    return { valid: true };
  },

  semver: (value) => {
    const re = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
    return re.test(value)
      ? { valid: true }
      : { valid: false, message: `"${value}" is not valid semver` };
  },
};

export function validateValue(
  value: string,
  schema: VariableSchema,
): ValidatorResult {
  const validator = validators[schema.type];
  return validator(value, schema);
}
