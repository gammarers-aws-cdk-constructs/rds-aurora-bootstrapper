import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data';
import {
  Context,
  CdkCustomResourceEvent,
  CdkCustomResourceResponse,
  CdkCustomResourceHandler,
} from 'aws-lambda';
import { quotePostgresqlIdentifier } from './libs/postgresql/quote-identifier';

/** Reused RDS Data API client for the Lambda execution environment. */
const rdsDataClient = new RDSDataClient({});

/**
 * Custom resource handler that creates a PostgreSQL schema on Aurora.
 *
 * On Create, reads `MasterUserSecretArn`, `DatabaseName`, `ClusterArn`,
 * `OwnerUsername`, `SchemaName`, and `IsDropPublicSchema` from
 * `ResourceProperties`. `OwnerUsername` and `SchemaName` are validated at CDK
 * synthesis time and double-quoted when embedded in SQL.
 *
 * The handler creates the schema (if missing), assigns ownership to
 * `OwnerUsername`, and optionally drops the `public` schema with `CASCADE`.
 * Update and Delete are no-ops that preserve the physical resource ID.
 *
 * @param event - CloudFormation custom resource event.
 * @param context - Lambda execution context.
 * @returns Custom resource response with a physical resource ID and optional data.
 * @throws Rethrows any error after rolling back an open transaction on Create.
 */
export const handler: CdkCustomResourceHandler = async (event: CdkCustomResourceEvent, context: Context): Promise<CdkCustomResourceResponse> => {
  console.log({ event, context });

  switch (event.RequestType) {
    case 'Create':
      const masterUserSecretArn = event.ResourceProperties.MasterUserSecretArn as string;
      const databaseName = event.ResourceProperties.DatabaseName as string;
      const clusterArn = event.ResourceProperties.ClusterArn as string;
      const ownerUsername = event.ResourceProperties.OwnerUsername as string;
      const schemaName = event.ResourceProperties.SchemaName as string;
      const isDropPublicSchema = event.ResourceProperties.IsDropPublicSchema as boolean;

      const physicalResourceId = `${clusterArn}:${databaseName}:${ownerUsername}:${schemaName}`;
      const quotedSchemaName = quotePostgresqlIdentifier(schemaName);
      const quotedOwnerUsername = quotePostgresqlIdentifier(ownerUsername);

      // 👇 Begin transaction.
      const { transactionId } = await rdsDataClient.send(new BeginTransactionCommand({
        resourceArn: clusterArn,
        secretArn: masterUserSecretArn,
        database: databaseName,
      }));

      try {

        // 👇 Create schema.
        await rdsDataClient.send(new ExecuteStatementCommand({
          resourceArn: clusterArn,
          secretArn: masterUserSecretArn,
          database: databaseName,
          transactionId,
          sql: `CREATE SCHEMA IF NOT EXISTS ${quotedSchemaName}`,
        }));

        // 👇 Change ownership to app_owner.
        await rdsDataClient.send(new ExecuteStatementCommand({
          resourceArn: clusterArn,
          secretArn: masterUserSecretArn,
          database: databaseName,
          transactionId,
          sql: `ALTER SCHEMA ${quotedSchemaName} OWNER TO ${quotedOwnerUsername}`,
        }));

        // 👇 Drop public schema.
        if (isDropPublicSchema) {
          await rdsDataClient.send(new ExecuteStatementCommand({
            resourceArn: clusterArn,
            secretArn: masterUserSecretArn,
            database: databaseName,
            transactionId,
            sql: 'DROP SCHEMA IF EXISTS public CASCADE',
          }));
        }

        // 👇 Commit transaction.
        await rdsDataClient.send(new CommitTransactionCommand({
          resourceArn: clusterArn,
          secretArn: masterUserSecretArn,
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
            resourceArn: clusterArn,
            secretArn: masterUserSecretArn,
            transactionId,
          })).catch(() => {});
        }
        throw error;
      }
    case 'Update':
      // 特に何もしない（修正が入った場合に検討する）
    case 'Delete':
      // 特に何もしない
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
    default:
      throw new Error('unreachable');
  }
};
