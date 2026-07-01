import { SAFE_POSTGRESQL_IDENTIFIER_PATTERN } from './identifier-pattern';

/**
 * Validates that a value is safe to use as a PostgreSQL identifier in dynamic SQL.
 * Intended for CDK construct props at synthesis time.
 *
 * @param name - Candidate identifier.
 * @param label - Field name used in error messages.
 * @throws Error when `name` does not match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
 * @see {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}
 */
export const assertSafePostgresqlIdentifier = (name: string, label: string): void => {
  if (!SAFE_POSTGRESQL_IDENTIFIER_PATTERN.test(name)) {
    throw new Error(
      `${label} must match ${SAFE_POSTGRESQL_IDENTIFIER_PATTERN}: got ${JSON.stringify(name)}`,
    );
  }
};
