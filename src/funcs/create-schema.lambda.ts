import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data';
import {
  Context,
  CdkCustomResourceEvent,
  CdkCustomResourceResponse,
  CdkCustomResourceHandler,
} from 'aws-lambda';
import { quotePostgresqlIdentifier } from './core/quote-identifier';
import { readStringProperty } from './core/read-string-property';
import { RdsAuroraBootstrapperValidateError } from './core/validate-errors';
import {
  PUBLIC_SCHEMA_DROP,
  PUBLIC_SCHEMA_KEEP,
  RESOURCE_PROPERTY_CLUSTER_ARN,
  RESOURCE_PROPERTY_DATABASE_NAME,
  RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN,
  RESOURCE_PROPERTY_OWNER_USERNAME,
  RESOURCE_PROPERTY_PUBLIC_SCHEMA,
  RESOURCE_PROPERTY_SCHEMA_NAME,
} from '../settings/consts';

/** Reused RDS Data API client for the Lambda execution environment. */
const rdsDataClient = new RDSDataClient({});

/**
 * Custom resource handler that creates a PostgreSQL schema on Aurora.
 *
 * On Create, reads `MasterUserSecretArn`, `DatabaseName`, `ClusterArn`,
 * `OwnerUsername`, `SchemaName`, and `PublicSchema` from
 * `ResourceProperties`. `OwnerUsername` and `SchemaName` are validated at CDK
 * synthesis time and double-quoted when embedded in SQL.
 *
 * The handler creates the schema (if missing), assigns ownership to
 * `OwnerUsername`, and drops the `public` schema with `CASCADE` when
 * `PublicSchema` is `DROP`. Update and Delete are no-ops that preserve the
 * physical resource ID.
 *
 * @param event - CloudFormation custom resource event.
 * @param context - Lambda execution context.
 * @returns Custom resource response with a physical resource ID and optional data.
 * @throws RdsAuroraBootstrapperValidateError when a property is not a string or `PublicSchema` is not `KEEP` or `DROP`.
 * @throws Rethrows any error after rolling back an open transaction on Create.
 */
export const handler: CdkCustomResourceHandler = async (event: CdkCustomResourceEvent, context: Context): Promise<CdkCustomResourceResponse> => {
  console.log({ event, context });

  switch (event.RequestType) {
    case 'Create':
      const masterUserSecretArn = readStringProperty(event.ResourceProperties, RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN);
      const databaseName = readStringProperty(event.ResourceProperties, RESOURCE_PROPERTY_DATABASE_NAME);
      const clusterArn = readStringProperty(event.ResourceProperties, RESOURCE_PROPERTY_CLUSTER_ARN);
      const ownerUsername = readStringProperty(event.ResourceProperties, RESOURCE_PROPERTY_OWNER_USERNAME);
      const schemaName = readStringProperty(event.ResourceProperties, RESOURCE_PROPERTY_SCHEMA_NAME);
      const publicSchema = readStringProperty(event.ResourceProperties, RESOURCE_PROPERTY_PUBLIC_SCHEMA);
      if (publicSchema !== PUBLIC_SCHEMA_KEEP && publicSchema !== PUBLIC_SCHEMA_DROP) {
        throw new RdsAuroraBootstrapperValidateError(
          `${RESOURCE_PROPERTY_PUBLIC_SCHEMA} must be ${PUBLIC_SCHEMA_KEEP} or ${PUBLIC_SCHEMA_DROP}`,
        );
      }

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
        if (publicSchema === PUBLIC_SCHEMA_DROP) {
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
    case 'Delete':
      // Update and Delete leave the schema in place.
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
    default:
      throw new Error('unreachable');
  }
};
