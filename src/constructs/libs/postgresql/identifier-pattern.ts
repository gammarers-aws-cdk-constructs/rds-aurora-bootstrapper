/**
 * Regular expression for PostgreSQL identifiers allowed in dynamic SQL built by this library.
 *
 * Matches unquoted identifiers that start with a letter or underscore, followed by letters,
 * digits, underscores, or hyphens. Hyphenated names are quoted at SQL generation time.
 */
export const SAFE_POSTGRESQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
