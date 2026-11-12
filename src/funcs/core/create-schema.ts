import { ExecuteStatementCommand, RDSDataClient } from '@aws-sdk/client-rds-data';
import { CdkCustomResourceResponse } from 'aws-lambda';
import { quotePostgresqlIdentifier } from './quote-identifier';
import { runInTransaction } from './rds-data-transaction';
import { RdsDataTarget } from './read-rds-data-target';
import { readStringProperty, ResourceProperties } from './read-string-property';
import { RdsAuroraBootstrapperValidateError } from './validate-errors';
import {
  PUBLIC_SCHEMA_DROP,
  PUBLIC_SCHEMA_KEEP,
  RESOURCE_PROPERTY_OWNER_USERNAME,
  RESOURCE_PROPERTY_PUBLIC_SCHEMA,
  RESOURCE_PROPERTY_SCHEMA_NAME,
} from '../../settings/consts';

/**
 * Creates a schema, assigns it to the owner role, and optionally drops `public`.
 *
 * @param properties - CloudFormation resource properties.
 * @param client - RDS Data API client.
 * @param target - Cluster, secret, and database.
 * @returns Custom resource response. `Data.created` is `true` after a successful Create.
 * @throws RdsAuroraBootstrapperValidateError when `PublicSchema` is not `KEEP` or `DROP`.
 * @throws Rethrows any error after rolling back the open transaction.
 */
export const createSchema = async (
  properties: ResourceProperties,
  client: RDSDataClient,
  target: RdsDataTarget,
): Promise<CdkCustomResourceResponse> => {
  const ownerUsername = readStringProperty(properties, RESOURCE_PROPERTY_OWNER_USERNAME);
  const schemaName = readStringProperty(properties, RESOURCE_PROPERTY_SCHEMA_NAME);
  const publicSchema = readStringProperty(properties, RESOURCE_PROPERTY_PUBLIC_SCHEMA);

  if (publicSchema !== PUBLIC_SCHEMA_KEEP && publicSchema !== PUBLIC_SCHEMA_DROP) {
    throw new RdsAuroraBootstrapperValidateError(
      `${RESOURCE_PROPERTY_PUBLIC_SCHEMA} must be ${PUBLIC_SCHEMA_KEEP} or ${PUBLIC_SCHEMA_DROP}`,
    );
  }

  const quotedSchemaName = quotePostgresqlIdentifier(schemaName);
  const quotedOwnerUsername = quotePostgresqlIdentifier(ownerUsername);

  await runInTransaction(client, target, async (transactionId) => {
    // Create the schema when it is missing, then give it to the owner role.
    await client.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `CREATE SCHEMA IF NOT EXISTS ${quotedSchemaName}`,
    }));

    await client.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `ALTER SCHEMA ${quotedSchemaName} OWNER TO ${quotedOwnerUsername}`,
    }));

    // DROP removes the default public schema and the objects inside it.
    if (publicSchema === PUBLIC_SCHEMA_DROP) {
      await client.send(new ExecuteStatementCommand({
        ...target,
        transactionId,
        sql: 'DROP SCHEMA IF EXISTS public CASCADE',
      }));
    }
  });

  return {
    PhysicalResourceId: `${target.resourceArn}:${target.database}:${ownerUsername}:${schemaName}`,
    Data: {
      created: true,
    },
  };
};
