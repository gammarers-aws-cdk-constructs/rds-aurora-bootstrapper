import { asSecretsManagerClient } from './sdk-client-double';
import { loadLoginCredentials } from '../../../src/funcs/core/load-login-credentials';
import { RdsAuroraBootstrapperValidateError } from '../../../src/funcs/core/validate-errors';

describe('loadLoginCredentials', () => {
  test('quotes the username and escapes the password', async () => {
    const send = jest.fn(async () => ({
      SecretString: JSON.stringify({ username: 'app_user', password: "p'w" }),
    }));
    const client = asSecretsManagerClient({ send });

    await expect(loadLoginCredentials(client, 'arn:secret', 'Target user', 'TargetUsername')).resolves.toEqual({
      username: 'app_user',
      quotedUsername: '"app_user"',
      escapedPassword: "p''w",
    });
  });

  test('rejects an unsafe username', async () => {
    const send = jest.fn(async () => ({
      SecretString: JSON.stringify({ username: 'bad name', password: 'secret' }),
    }));
    const client = asSecretsManagerClient({ send });

    await expect(loadLoginCredentials(client, 'arn:secret', 'Target user', 'TargetUsername'))
      .rejects.toThrow(RdsAuroraBootstrapperValidateError);
  });
});
