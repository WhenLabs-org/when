export class EnvalidError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "EnvalidError";
  }
}

export class SchemaNotFoundError extends EnvalidError {
  constructor(path: string) {
    super(`Schema file not found: ${path}`, "SCHEMA_NOT_FOUND");
  }
}

export class SchemaParseError extends EnvalidError {
  constructor(message: string) {
    super(`Invalid schema: ${message}`, "SCHEMA_PARSE_ERROR");
  }
}

export class EnvFileNotFoundError extends EnvalidError {
  constructor(path: string) {
    super(`Env file not found: ${path}`, "ENV_NOT_FOUND");
  }
}
