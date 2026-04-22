export class HowenApiError extends Error {
  public readonly providerCode: number;

  constructor(message: string, providerCode: number) {
    super(message);
    this.name = "HowenApiError";
    this.providerCode = providerCode;
  }
}

export class IntegrationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationConfigError";
  }
}
