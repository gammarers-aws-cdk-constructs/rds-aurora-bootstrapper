import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { assertSafePostgresqlIdentifier } from './assert-identifier';
import { escapePostgresqlStringLiteral } from './escape-string-literal';
import { parseUserCredentials } from './parse-user-credentials';
import { quotePostgresqlIdentifier } from './quote-identifier';

/**
 * Login role credentials ready to embed in SQL.
 */
export interface LoginCredentials {
  /** PostgreSQL role name. */
  readonly username: string;
  /** Quoted role name. */
  readonly quotedUsername: string;
  /** Password escaped for a single-quoted SQL literal. */
  readonly escapedPassword: string;
}

/**
 * Loads a login role's username and password from Secrets Manager.
 *
 * @param client - Secrets Manager client.
 * @param secretArn - Secret that stores `username` and `password`.
 * @param subject - Credential owner used in error messages, such as `Target user`.
 * @param usernameLabel - Field name used when the username fails identifier validation.
 * @returns Username, quoted username, and escaped password.
 * @throws RdsAuroraBootstrapperValidateError when the secret or username is invalid.
 */
export const loadLoginCredentials = async (
  client: SecretsManagerClient,
  secretArn: string,
  subject: string,
  usernameLabel: string,
): Promise<LoginCredentials> => {
  const secret = await client.send(new GetSecretValueCommand({
    SecretId: secretArn,
  }));
  const { username, password } = parseUserCredentials(secret.SecretString, subject);
  assertSafePostgresqlIdentifier(username, usernameLabel);

  return {
    username,
    quotedUsername: quotePostgresqlIdentifier(username),
    escapedPassword: escapePostgresqlStringLiteral(password),
  };
};
