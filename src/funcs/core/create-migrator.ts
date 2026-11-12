import { ExecuteStatementCommand, RDSDataClient } from '@aws-sdk/client-rds-data';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { CdkCustomResourceResponse } from 'aws-lambda';
import { assertSafePostgresqlIdentifier } from './assert-identifier';
import { loadLoginCredentials } from './load-login-credentials';
import { quotePostgresqlIdentifier } from './quote-identifier';
import { runInTransaction } from './rds-data-transaction';
import { RdsDataTarget } from './read-rds-data-target';
import { readStringProperty, ResourceProperties } from './read-string-property';
import { roleExists } from './role-exists';
import {
  RESOURCE_PROPERTY_MASTER_USERNAME,
  RESOURCE_PROPERTY_MIGRATOR_USER_SECRET_ARN,
  RESOURCE_PROPERTY_OWNER_USERNAME,
  RESOURCE_PROPERTY_SCHEMA_NAME,
} from '../../settings/consts';

/**
 * Creates a `LOGIN` migrator user that can assume the owner role.
 *
 * Skips creation and grants when the role already exists. The transaction is
 * committed either way.
 *
 * @param properties - CloudFormation resource properties.
 * @param rdsDataClient - RDS Data API client.
 * @param secretsClient - Secrets Manager client.
 * @param target - Cluster, secret, and database.
 * @returns Custom resource response. `Data.created` is `true` after a successful Create.
 * @throws RdsAuroraBootstrapperValidateError when identifier or secret validation fails.
 * @throws Rethrows any error after rolling back the open transaction.
 */
export const createMigrator = async (
  properties: ResourceProperties,
  rdsDataClient: RDSDataClient,
  secretsClient: SecretsManagerClient,
  target: RdsDataTarget,
): Promise<CdkCustomResourceResponse> => {
  const masterUsername = readStringProperty(properties, RESOURCE_PROPERTY_MASTER_USERNAME);
  const ownerUsername = readStringProperty(properties, RESOURCE_PROPERTY_OWNER_USERNAME);
  const schemaName = readStringProperty(properties, RESOURCE_PROPERTY_SCHEMA_NAME);
  const migratorUserSecretArn = readStringProperty(properties, RESOURCE_PROPERTY_MIGRATOR_USER_SECRET_ARN);
  // MasterUsername arrives from a deploy-time dynamic reference, so it is checked even though this SQL does not embed it.
  assertSafePostgresqlIdentifier(masterUsername, 'MasterUsername');

  const { username, quotedUsername, escapedPassword } = await loadLoginCredentials(
    secretsClient,
    migratorUserSecretArn,
    'Migrator user',
    'MigratorUsername',
  );
  const quotedOwnerUsername = quotePostgresqlIdentifier(ownerUsername);
  const quotedSchemaName = quotePostgresqlIdentifier(schemaName);
  const quotedDatabaseName = quotePostgresqlIdentifier(target.database);

  await runInTransaction(rdsDataClient, target, async (transactionId) => {
    const exists = await roleExists(rdsDataClient, target, transactionId, username);
    if (exists) {
      return;
    }

    // A missing role gets a login password taken from Secrets Manager.
    await rdsDataClient.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `CREATE ROLE ${quotedUsername} LOGIN PASSWORD '${escapedPassword}'`,
    }));

    await rdsDataClient.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `GRANT CONNECT ON DATABASE ${quotedDatabaseName} TO ${quotedUsername}`,
    }));

    // Membership lets the migrator assume the owner role.
    await rdsDataClient.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `GRANT ${quotedOwnerUsername} TO ${quotedUsername}`,
    }));

    await rdsDataClient.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `ALTER ROLE ${quotedUsername} IN DATABASE ${quotedDatabaseName} SET search_path = ${quotedSchemaName}`,
    }));
  });

  return {
    PhysicalResourceId: `${target.resourceArn}:${target.database}:${username}`,
    Data: {
      created: true,
    },
  };
};
