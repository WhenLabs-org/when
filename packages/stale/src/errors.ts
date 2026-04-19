export class StaleError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'StaleError';
    this.code = code;
  }
}

export class ConfigError extends StaleError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class ParseError extends StaleError {
  constructor(message: string) {
    super(message, 'PARSE_ERROR');
    this.name = 'ParseError';
  }
}

export class AnalyzerError extends StaleError {
  constructor(message: string) {
    super(message, 'ANALYZER_ERROR');
    this.name = 'AnalyzerError';
  }
}

export class ApiError extends StaleError {
  constructor(message: string) {
    super(message, 'API_ERROR');
    this.name = 'ApiError';
  }
}
