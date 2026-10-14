import { parseUserCredentials } from '../../../src/funcs/core/parse-user-credentials';
import { RdsAuroraBootstrapperValidateError } from '../../../src/funcs/core/validate-errors';

describe('parseUserCredentials', () => {
  test('returns username and password', () => {
    expect(parseUserCredentials(JSON.stringify({ username: 'app_user', password: 'secret' }), 'Target user')).toEqual({
      username: 'app_user',
      password: 'secret',
    });
  });

  test.each([
    [undefined, 'Target user secret has no SecretString'],
    ['not-json', 'Target user secret must be a JSON object with username and password'],
    ['{}', 'Target user secret must be a JSON object with username and password'],
    [JSON.stringify({ username: 1, password: 'secret' }), 'Target user secret username and password must be strings'],
  ])('rejects %j', (secretString, message) => {
    expect(() => parseUserCredentials(secretString, 'Target user')).toThrow(RdsAuroraBootstrapperValidateError);
    expect(() => parseUserCredentials(secretString, 'Target user')).toThrow(message);
  });
});
