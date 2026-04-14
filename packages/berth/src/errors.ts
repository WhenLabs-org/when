export class BerthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BerthError';
  }
}

export class PermissionError extends BerthError {
  constructor(message: string) {
    super(message, 'PERMISSION_DENIED');
    this.name = 'PermissionError';
  }
}

export class RegistryError extends BerthError {
  constructor(message: string) {
    super(message, 'REGISTRY_ERROR');
    this.name = 'RegistryError';
  }
}

export class DetectorError extends BerthError {
  constructor(message: string) {
    super(message, 'DETECTOR_ERROR');
    this.name = 'DetectorError';
  }
}
