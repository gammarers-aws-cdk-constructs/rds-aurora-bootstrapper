import { ExecuteStatementCommand, RDSDataClient } from '@aws-sdk/client-rds-data';
import { CdkCustomResourceResponse } from 'aws-lambda';
import { assertSafePostgresqlIdentifier } from './assert-identifier';
import { quotePostgresqlIdentifier } from './quote-identifier';
import { runInTransaction } from './rds-data-transaction';
import { RdsDataTarget } from './read-rds-data-target';
import { readStringProperty, ResourceProperties } from './read-string-property';
import { roleExists } from './role-exists';
import { RESOURCE_PROPERTY_MASTER_USERNAME, RESOURCE_PROPERTY_OWNER_USERNAME } from '../../settings/consts';

/**
 * Creates a `NOLOGIN NOINHERIT` owner role and grants it to the master user.
 *
 * Skips creation when the role already exists. The transaction is committed
 * either way.
 *
 * @param properties - CloudFormation resource properties.
 * @param client - RDS Data API client.
 * @param target - Cluster, secret, and database.
 * @returns Custom resource response. `Data.created` is `true` after a successful Create.
 * @throws RdsAuroraBootstrapperValidateError when `MasterUsername` fails identifier validation.
 * @throws Rethrows any error after rolling back the open transaction.
 */
export const createOwner = async (
  properties: ResourceProperties,
  client: RDSDataClient,
  target: RdsDataTarget,
): Promise<CdkCustomResourceResponse> => {
  const masterUsername = readStringProperty(properties, RESOURCE_PROPERTY_MASTER_USERNAME);
  const ownerUsername = readStringProperty(properties, RESOURCE_PROPERTY_OWNER_USERNAME);
  assertSafePostgresqlIdentifier(masterUsername, 'MasterUsername');

  const quotedOwnerUsername = quotePostgresqlIdentifier(ownerUsername);
  const quotedMasterUsername = quotePostgresqlIdentifier(masterUsername);

  await runInTransaction(client, target, async (transactionId) => {
    const exists = await roleExists(client, target, transactionId, ownerUsername);
    if (exists) {
      return;
    }

    // The owner role cannot log in. Later statements assume it through the master user.
    await client.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `CREATE ROLE ${quotedOwnerUsername} NOLOGIN NOINHERIT`,
    }));

    await client.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `GRANT ${quotedOwnerUsername} TO ${quotedMasterUsername}`,
    }));
  });

  return {
    PhysicalResourceId: `${target.resourceArn}:${target.database}:${ownerUsername}`,
    Data: {
      created: true,
    },
  };
};
