/**
 * Wraps a PostgreSQL identifier in double quotes and escapes embedded quotes.
 * Intended for Lambda handlers that build dynamic SQL at runtime.
 *
 * Callers are expected to validate identifiers at synthesis time via
 * {@link assertSafePostgresqlIdentifier}. Runtime-only values (for example
 * `MasterUsername` resolved from Secrets Manager at deploy time) must be
 * validated separately before quoting.
 *
 * @param ident - Raw identifier text.
 * @returns Quoted identifier safe for SQL interpolation.
 */
export const quotePostgresqlIdentifier = (ident: string): string =>
  `"${ident.replace(/"/g, '""')}"`;
