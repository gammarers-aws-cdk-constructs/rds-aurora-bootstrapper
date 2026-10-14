import { quotePostgresqlIdentifier } from '../../../src/funcs/core/quote-identifier';

describe('quotePostgresqlIdentifier', () => {
  test.each([
    ['app_owner', '"app_owner"'],
    ['app-owner', '"app-owner"'],
    ['MySchema', '"MySchema"'],
    ['a"b', '"a""b"'],
  ])('quotes %s as %s', (input, expected) => {
    expect(quotePostgresqlIdentifier(input)).toBe(expected);
  });
});
