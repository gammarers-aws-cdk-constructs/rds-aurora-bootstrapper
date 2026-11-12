import { readStringProperty } from '../../../src/funcs/core/read-string-property';
import { RdsAuroraBootstrapperValidateError } from '../../../src/funcs/core/validate-errors';
import { RESOURCE_PROPERTY_DATABASE_NAME } from '../../../src/settings/consts';

describe('readStringProperty', () => {
  test('returns a string property', () => {
    expect(readStringProperty({
      [RESOURCE_PROPERTY_DATABASE_NAME]: 'appdb',
    }, RESOURCE_PROPERTY_DATABASE_NAME)).toBe('appdb');
  });

  test.each([
    [{}, 'missing'],
    [{ [RESOURCE_PROPERTY_DATABASE_NAME]: 1 }, 'not a string'],
  ])('rejects a property that is %s', (properties) => {
    expect(() => readStringProperty(properties, RESOURCE_PROPERTY_DATABASE_NAME)).toThrow(RdsAuroraBootstrapperValidateError);
    expect(() => readStringProperty(properties, RESOURCE_PROPERTY_DATABASE_NAME)).toThrow(
      `${RESOURCE_PROPERTY_DATABASE_NAME} must be a string`,
    );
  });
});
