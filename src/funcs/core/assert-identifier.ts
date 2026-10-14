import { RdsAuroraBootstrapperValidateError } from './validate-errors';
import { SAFE_POSTGRESQL_IDENTIFIER_PATTERN } from '../../settings/consts';

/**
 * Validates that a value is safe to use as a PostgreSQL identifier in dynamic SQL.
 * Intended for Lambda handlers at runtime.
 *
 * @param name - Candidate identifier.
 * @param label - Field name used in error messages.
 * @throws RdsAuroraBootstrapperValidateError when `name` does not match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
 */
export const assertSafePostgresqlIdentifier = (name: string, label: string): void => {
  if (SAFE_POSTGRESQL_IDENTIFIER_PATTERN.test(name)) {
    return;
  }

  throw new RdsAuroraBootstrapperValidateError(
    `${label} must match ${SAFE_POSTGRESQL_IDENTIFIER_PATTERN}: got ${JSON.stringify(name)}`,
  );
};
