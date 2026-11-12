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
  RESOURCE_PROPERTY_OWNER_USERNAME,
  RESOURCE_PROPERTY_SCHEMA_NAME,
  RESOURCE_PROPERTY_TARGET_USER_SECRET_ARN,
} from '../../settings/consts';

/**
 * Creates a `LOGIN` application user and grants DML on the target schema.
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
export const createUser = async (
  properties: ResourceProperties,
  rdsDataClient: RDSDataClient,
  secretsClient: SecretsManagerClient,
  target: RdsDataTarget,
): Promise<CdkCustomResourceResponse> => {
  const masterUsername = readStringProperty(properties, RESOURCE_PROPERTY_MASTER_USERNAME);
  const ownerUsername = readStringProperty(properties, RESOURCE_PROPERTY_OWNER_USERNAME);
  const schemaName = readStringProperty(properties, RESOURCE_PROPERTY_SCHEMA_NAME);
  const targetUserSecretArn = readStringProperty(properties, RESOURCE_PROPERTY_TARGET_USER_SECRET_ARN);
  // MasterUsername arrives from a deploy-time dynamic reference, so it is checked even though this SQL does not embed it.
  assertSafePostgresqlIdentifier(masterUsername, 'MasterUsername');

  const { username, quotedUsername, escapedPassword } = await loadLoginCredentials(
    secretsClient,
    targetUserSecretArn,
    'Target user',
    'TargetUsername',
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

    // Existing objects in the schema are granted now. Default privileges cover tables created later.
    await rdsDataClient.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `GRANT USAGE ON SCHEMA ${quotedSchemaName} TO ${quotedUsername}`,
    }));

    await rdsDataClient.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${quotedSchemaName} TO ${quotedUsername}`,
    }));

    // Future tables created by the owner role inherit the same DML grants.
    await rdsDataClient.send(new ExecuteStatementCommand({
      ...target,
      transactionId,
      sql: `ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedOwnerUsername} IN SCHEMA ${quotedSchemaName} `
        + `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedUsername}`,
    }));
  });

  return {
    PhysicalResourceId: `${target.resourceArn}:${target.database}:${username}`,
    Data: {
      created: true,
    },
  };
};
