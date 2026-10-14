import { assertSafePostgresqlIdentifier } from '../../../src/funcs/core/assert-identifier';
import { RdsAuroraBootstrapperValidateError } from '../../../src/funcs/core/validate-errors';

describe('assertSafePostgresqlIdentifier', () => {
  test.each([
    'app_owner',
    'app-owner',
    'MyRole',
    '_private',
  ])('accepts %s', (name) => {
    expect(() => assertSafePostgresqlIdentifier(name, 'name')).not.toThrow();
  });

  test.each([
    '',
    '1starts_with_digit',
    'has space',
    'semi;colon',
    'quote"inside',
  ])('rejects %s', (name) => {
    expect(() => assertSafePostgresqlIdentifier(name, 'name')).toThrow(RdsAuroraBootstrapperValidateError);
  });
});
