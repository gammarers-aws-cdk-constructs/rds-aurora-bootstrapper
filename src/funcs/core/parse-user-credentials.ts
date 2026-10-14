import { RdsAuroraBootstrapperValidateError } from './validate-errors';

/**
 * Username and password loaded from a Secrets Manager secret.
 */
export interface UserCredentials {
  /** PostgreSQL role name. */
  readonly username: string;
  /** Password assigned to the role. */
  readonly password: string;
}

/**
 * Parses a Secrets Manager secret string as database credentials.
 *
 * @param secretString - Raw secret string from Secrets Manager.
 * @param subject - Credential owner used in error messages, such as `Target user`.
 * @returns Username and password fields.
 * @throws RdsAuroraBootstrapperValidateError when the secret is missing, not JSON, or lacks string `username`/`password`.
 */
export const parseUserCredentials = (secretString: string | undefined, subject: string): UserCredentials => {
  if (secretString === undefined) {
    throw new RdsAuroraBootstrapperValidateError(`${subject} secret has no SecretString`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(secretString);
  } catch {
    throw new RdsAuroraBootstrapperValidateError(
      `${subject} secret must be a JSON object with username and password`,
    );
  }

  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('username' in parsed)
    || !('password' in parsed)
  ) {
    throw new RdsAuroraBootstrapperValidateError(
      `${subject} secret must be a JSON object with username and password`,
    );
  }

  const { username, password } = parsed;
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new RdsAuroraBootstrapperValidateError(
      `${subject} secret username and password must be strings`,
    );
  }

  return { username, password };
};
