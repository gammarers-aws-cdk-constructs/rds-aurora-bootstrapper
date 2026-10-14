/**
 * PostgreSQL identifiers this library accepts in dynamic SQL.
 *
 * Unquoted identifiers that start with a letter or underscore, followed by
 * letters, digits, underscores, or hyphens. Hyphenated names are quoted when
 * SQL is generated.
 */
export const SAFE_POSTGRESQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/**
 * Leave the PostgreSQL `public` schema in place.
 * The construct enum `PublicSchema.KEEP` must use this same value.
 */
export const PUBLIC_SCHEMA_KEEP = 'KEEP';

/**
 * Drop the PostgreSQL `public` schema with `CASCADE`.
 * The construct enum `PublicSchema.DROP` must use this same value.
 */
export const PUBLIC_SCHEMA_DROP = 'DROP';

/** Custom resource property for the Aurora master user secret ARN. */
export const RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN = 'MasterUserSecretArn';

/** Custom resource property for the Aurora master username. */
export const RESOURCE_PROPERTY_MASTER_USERNAME = 'MasterUsername';

/** Custom resource property for the PostgreSQL database name. */
export const RESOURCE_PROPERTY_DATABASE_NAME = 'DatabaseName';

/** Custom resource property for the Aurora cluster ARN. */
export const RESOURCE_PROPERTY_CLUSTER_ARN = 'ClusterArn';

/** Custom resource property for the owner role name. */
export const RESOURCE_PROPERTY_OWNER_USERNAME = 'OwnerUsername';

/** Custom resource property for the schema name. */
export const RESOURCE_PROPERTY_SCHEMA_NAME = 'SchemaName';

/** Custom resource property for the public-schema action (`KEEP` or `DROP`). */
export const RESOURCE_PROPERTY_PUBLIC_SCHEMA = 'PublicSchema';

/** Custom resource property for the application user secret ARN. */
export const RESOURCE_PROPERTY_TARGET_USER_SECRET_ARN = 'TargetUserSecretArn';

/** Custom resource property for the migrator user secret ARN. */
export const RESOURCE_PROPERTY_MIGRATOR_USER_SECRET_ARN = 'MigratorUserSecretArn';
