/**
 * Base error for failures raised by the Lambda handlers in this package.
 */
export abstract class RdsAuroraBootstrapperError extends Error {
  override readonly name: string = 'RdsAuroraBootstrapperError';

  protected constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, RdsAuroraBootstrapperError.prototype);
  }
}

/**
 * Handler input failed validation.
 */
export class RdsAuroraBootstrapperValidateError extends RdsAuroraBootstrapperError {
  override readonly name: string = 'RdsAuroraBootstrapperValidateError';

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, RdsAuroraBootstrapperValidateError.prototype);
  }
}
