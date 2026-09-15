import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  Context,
  CdkCustomResourceEvent,
  CdkCustomResourceResponse,
  CdkCustomResourceHandler,
} from 'aws-lambda';
import { quotePostgresqlIdentifier } from './libs/postgresql/quote-identifier';
import { assertSafePostgresqlIdentifier } from '../constructs/libs/postgresql/assert-identifier';

/** Reused Secrets Manager client for the Lambda execution environment. */
const secretsClient = new SecretsManagerClient({});
/** Reused RDS Data API client for the Lambda execution environment. */
const rdsDataClient = new RDSDataClient({});

/**
 * Migrator user credentials loaded from Secrets Manager.
 */
interface MigratorUserCredentials {
  /** PostgreSQL role name to create (`LOGIN`). */
  readonly username: string;
  /** Password assigned to the new `LOGIN` role. */
  readonly password: string;
}

/**
 * Parses and validates a Secrets Manager secret string as database credentials.
 *
 * @param secretString - Raw secret string from Secrets Manager.
 * @returns Username and password fields.
 * @throws Error when the secret is missing, not JSON, or lacks string `username`/`password`.
 */
const parseMigratorUserCredentials = (secretString: string | undefined): MigratorUserCredentials => {
  if (secretString === undefined) {
    throw new Error('Migrator user secret has no SecretString');
  }

  const parsed: unknown = JSON.parse(secretString);
  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('username' in parsed)
    || !('password' in parsed)
  ) {
    throw new Error('Migrator user secret must be a JSON object with username and password');
  }

  const { username, password } = parsed;
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new Error('Migrator user secret username and password must be strings');
  }

  return { username, password };
};

/**
 * Escapes a PostgreSQL string literal for use inside single quotes.
 *
 * @param value - Raw string value (for example a password).
 * @returns Value with single quotes doubled for SQL embedding.
 */
const escapePostgresqlStringLiteral = (value: string): string => value.replace(/'/g, "''");

/**
 * Custom resource handler that creates a PostgreSQL migrator user on Aurora.
 *
 * On Create, reads `MasterUserSecretArn`, `MasterUsername`, `DatabaseName`,
 * `ClusterArn`, `MigratorUserSecretArn`, `OwnerUsername`, and `SchemaName` from
 * `ResourceProperties`. `OwnerUsername` and `SchemaName` are validated at CDK
 * synthesis time. `MasterUsername` and the migrator username from Secrets Manager
 * are validated here before use. Identifiers are double-quoted when embedded in
 * SQL; the password is escaped as a string literal.
 *
 * If the role does not already exist, creates it with `LOGIN`, grants `CONNECT`
 * on the database, grants membership in `OwnerUsername` so the migrator can
 * assume the owner role, and sets `search_path` to `SchemaName`. When the role
 * already exists, creation and grants are skipped. The transaction is committed
 * in either case. Update and Delete are no-ops that preserve the physical
 * resource ID.
 *
 * @param event - CloudFormation custom resource event.
 * @param context - Lambda execution context.
 * @returns Custom resource response with a physical resource ID and optional data.
 * @throws Error when identifier or secret validation fails.
 * @throws Rethrows any error after rolling back an open transaction on Create.
 */
export const handler: CdkCustomResourceHandler = async (event: CdkCustomResourceEvent, context: Context): Promise<CdkCustomResourceResponse> => {
  console.log({ event, context });

  switch (event.RequestType) {
    case 'Create':
      const masterUserSecretArn = event.ResourceProperties.MasterUserSecretArn as string;
      const masterUsername = event.ResourceProperties.MasterUsername as string;
      const databaseName = event.ResourceProperties.DatabaseName as string;
      const clusterArn = event.ResourceProperties.ClusterArn as string;
      const migratorUserSecretArn = event.ResourceProperties.MigratorUserSecretArn as string;
      const ownerUsername = event.ResourceProperties.OwnerUsername as string;
      const schemaName = event.ResourceProperties.SchemaName as string;

      assertSafePostgresqlIdentifier(masterUsername, 'MasterUsername');

      const migratorUserSecretData = await secretsClient.send(new GetSecretValueCommand({
        SecretId: migratorUserSecretArn,
      }));
      const { username, password } = parseMigratorUserCredentials(migratorUserSecretData.SecretString);
      assertSafePostgresqlIdentifier(username, 'MigratorUsername');

      const physicalResourceId = `${clusterArn}:${databaseName}:${username}`;
      const quotedUsername = quotePostgresqlIdentifier(username);
      const quotedOwnerUsername = quotePostgresqlIdentifier(ownerUsername);
      const quotedSchemaName = quotePostgresqlIdentifier(schemaName);
      const quotedDatabaseName = quotePostgresqlIdentifier(databaseName);
      const escapedPassword = escapePostgresqlStringLiteral(password);

      const rdsDataTarget = {
        resourceArn: clusterArn,
        secretArn: masterUserSecretArn,
        database: databaseName,
      };

      // 👇 Begin transaction.
      const { transactionId } = await rdsDataClient.send(new BeginTransactionCommand(rdsDataTarget));

      try {
        const exists = await (async () => {
          const result = await rdsDataClient.send(new ExecuteStatementCommand({
            ...rdsDataTarget,
            transactionId,
            sql: 'SELECT 1 FROM pg_roles WHERE rolname = :r',
            parameters: [{ name: 'r', value: { stringValue: username } }],
          }));
          return (result.records ?? []).length > 0;
        })();

        if (!exists) {
          // 👇 Create LOGIN role.
          await rdsDataClient.send(new ExecuteStatementCommand({
            ...rdsDataTarget,
            transactionId,
            sql: `CREATE ROLE ${quotedUsername} LOGIN PASSWORD '${escapedPassword}'`,
          }));

          await rdsDataClient.send(new ExecuteStatementCommand({
            ...rdsDataTarget,
            transactionId,
            sql: `GRANT CONNECT ON DATABASE ${quotedDatabaseName} TO ${quotedUsername}`,
          }));

          // 👇 Allow the migrator to assume the owner role.
          await rdsDataClient.send(new ExecuteStatementCommand({
            ...rdsDataTarget,
            transactionId,
            sql: `GRANT ${quotedOwnerUsername} TO ${quotedUsername}`,
          }));

          // 👇 Set search path for migration tooling.
          await rdsDataClient.send(new ExecuteStatementCommand({
            ...rdsDataTarget,
            transactionId,
            sql: `ALTER ROLE ${quotedUsername} IN DATABASE ${quotedDatabaseName} SET search_path = ${quotedSchemaName}`,
          }));
        }

        // 👇 Commit transaction.
        await rdsDataClient.send(new CommitTransactionCommand({
          resourceArn: rdsDataTarget.resourceArn,
          secretArn: rdsDataTarget.secretArn,
          transactionId,
        }));

        return {
          PhysicalResourceId: physicalResourceId,
          Data: {
            created: true,
          },
        };

      } catch (error) {
        if (transactionId) {
          await rdsDataClient.send(new RollbackTransactionCommand({
            resourceArn: rdsDataTarget.resourceArn,
            secretArn: rdsDataTarget.secretArn,
            transactionId,
          })).catch(() => {});
        }
        throw error;
      }
    case 'Update':
      // No-op for now; revisit if property updates need handling.
    case 'Delete':
      // No-op: leave the database role in place.
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
    default:
      throw new Error('unreachable');
  }
};
