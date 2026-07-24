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
 * Target application user credentials loaded from Secrets Manager.
 */
interface TargetUserCredentials {
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
const parseTargetUserCredentials = (secretString: string | undefined): TargetUserCredentials => {
  if (secretString === undefined) {
    throw new Error('Target user secret has no SecretString');
  }

  const parsed: unknown = JSON.parse(secretString);
  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('username' in parsed)
    || !('password' in parsed)
  ) {
    throw new Error('Target user secret must be a JSON object with username and password');
  }

  const { username, password } = parsed;
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new Error('Target user secret username and password must be strings');
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
 * Custom resource handler that creates a PostgreSQL application user on Aurora.
 *
 * On Create, reads `MasterUserSecretArn`, `MasterUsername`, `DatabaseName`,
 * `ClusterArn`, `TargetUserSecretArn`, `OwnerUsername`, and `SchemaName` from
 * `ResourceProperties`. `OwnerUsername` and `SchemaName` are validated at CDK
 * synthesis time. `MasterUsername` and the target username from Secrets Manager
 * are validated here before use. Identifiers are double-quoted when embedded in
 * SQL; the password is escaped as a string literal.
 *
 * If the role does not already exist, creates it with `LOGIN`, then grants
 * `CONNECT` on the database, `USAGE` on the schema, DML on existing tables in
 * that schema, and default privileges for future tables owned by
 * `OwnerUsername`. When the role already exists, creation and grants are
 * skipped. The transaction is committed in either case. Update and Delete are
 * no-ops that preserve the physical resource ID.
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
      const targetUserSecretArn = event.ResourceProperties.TargetUserSecretArn as string;
      const ownerUsername = event.ResourceProperties.OwnerUsername as string;
      const schemaName = event.ResourceProperties.SchemaName as string;

      assertSafePostgresqlIdentifier(masterUsername, 'MasterUsername');

      const targetUserSecretData = await secretsClient.send(new GetSecretValueCommand({
        SecretId: targetUserSecretArn,
      }));
      const { username, password } = parseTargetUserCredentials(targetUserSecretData.SecretString);
      assertSafePostgresqlIdentifier(username, 'TargetUsername');

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

          await rdsDataClient.send(new ExecuteStatementCommand({
            ...rdsDataTarget,
            transactionId,
            sql: `GRANT USAGE ON SCHEMA ${quotedSchemaName} TO ${quotedUsername}`,
          }));

          // 👇 Grant DML on existing tables in the schema.
          await rdsDataClient.send(new ExecuteStatementCommand({
            ...rdsDataTarget,
            transactionId,
            sql: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${quotedSchemaName} TO ${quotedUsername}`,
          }));

          // 👇 Set default privileges for future tables owned by the owner role.
          await rdsDataClient.send(new ExecuteStatementCommand({
            ...rdsDataTarget,
            transactionId,
            sql: `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedOwnerUsername} IN SCHEMA ${quotedSchemaName} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedUsername}`,
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
