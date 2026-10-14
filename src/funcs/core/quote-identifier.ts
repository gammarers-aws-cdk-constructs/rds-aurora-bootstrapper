/**
 * Wraps a PostgreSQL identifier in double quotes and escapes embedded quotes.
 * Intended for Lambda handlers that build dynamic SQL at runtime.
 *
 * Callers validate identifiers before quoting. Synthesis checks construct props.
 * Runtime-only values, such as `MasterUsername` resolved from Secrets Manager
 * at deploy time, are checked in the handler.
 *
 * @param ident - Raw identifier text.
 * @returns Quoted identifier safe for SQL interpolation.
 */
export const quotePostgresqlIdentifier = (ident: string): string =>
  `"${ident.replace(/"/g, '""')}"`;
