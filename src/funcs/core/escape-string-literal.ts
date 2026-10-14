/**
 * Escapes a PostgreSQL string literal for use inside single quotes.
 *
 * @param value - Raw string value (for example a password).
 * @returns Value with single quotes doubled for SQL embedding.
 */
export const escapePostgresqlStringLiteral = (value: string): string => value.replace(/'/g, "''");
