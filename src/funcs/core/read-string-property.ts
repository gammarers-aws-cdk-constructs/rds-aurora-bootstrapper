import { RdsAuroraBootstrapperValidateError } from './validate-errors';

/**
 * Reads a required string from custom resource properties.
 *
 * @param properties - CloudFormation resource properties.
 * @param key - Property name.
 * @returns The string value.
 * @throws RdsAuroraBootstrapperValidateError when the property is missing or not a string.
 */
export const readStringProperty = (
  properties: { readonly [key: string]: unknown },
  key: string,
): string => {
  const value = properties[key];
  if (typeof value === 'string') {
    return value;
  }

  throw new RdsAuroraBootstrapperValidateError(`${key} must be a string`);
};
