import { assertSafePostgresqlIdentifier } from '../../../../src/constructs/libs/postgresql/assert-identifier';

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
    expect(() => assertSafePostgresqlIdentifier(name, 'name')).toThrow(
      /name must match/,
    );
  });
});
