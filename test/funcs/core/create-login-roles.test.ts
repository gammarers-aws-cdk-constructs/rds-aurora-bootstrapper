import { asRdsDataClient, asSecretsManagerClient } from './sdk-client-double';
import { createMigrator } from '../../../src/funcs/core/create-migrator';
import { createUser } from '../../../src/funcs/core/create-user';
import { RdsDataTarget } from '../../../src/funcs/core/read-rds-data-target';
import {
  RESOURCE_PROPERTY_MASTER_USERNAME,
  RESOURCE_PROPERTY_MIGRATOR_USER_SECRET_ARN,
  RESOURCE_PROPERTY_OWNER_USERNAME,
  RESOURCE_PROPERTY_SCHEMA_NAME,
  RESOURCE_PROPERTY_TARGET_USER_SECRET_ARN,
} from '../../../src/settings/consts';

const target: RdsDataTarget = {
  resourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:app',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:master',
  database: 'appdb',
};

const createClients = () => {
  const sql: Array<string | undefined> = [];
  const rdsSend = jest.fn(async (command: { input: { sql?: string } }) => {
    sql.push(command.input.sql);
    if (sql.length === 1) {
      return { transactionId: 'tx-1' };
    }
    if (command.input.sql?.startsWith('SELECT')) {
      return { records: [] };
    }
    return {};
  });
  const secretsSend = jest.fn(async () => ({
    SecretString: JSON.stringify({ username: 'app_login', password: 'secret' }),
  }));

  return {
    rdsDataClient: asRdsDataClient({ send: rdsSend }),
    secretsClient: asSecretsManagerClient({ send: secretsSend }),
    sql,
  };
};

describe('login role operations', () => {
  test('grants application user DML and default privileges', async () => {
    const { rdsDataClient, secretsClient, sql } = createClients();

    await createUser({
      [RESOURCE_PROPERTY_MASTER_USERNAME]: 'postgres',
      [RESOURCE_PROPERTY_OWNER_USERNAME]: 'app_owner',
      [RESOURCE_PROPERTY_SCHEMA_NAME]: 'app_schema',
      [RESOURCE_PROPERTY_TARGET_USER_SECRET_ARN]: 'arn:target',
    }, rdsDataClient, secretsClient, target);

    expect(sql).toEqual([
      undefined,
      'SELECT 1 FROM pg_roles WHERE rolname = :r',
      'CREATE ROLE "app_login" LOGIN PASSWORD \'secret\'',
      'GRANT CONNECT ON DATABASE "appdb" TO "app_login"',
      'GRANT USAGE ON SCHEMA "app_schema" TO "app_login"',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "app_schema" TO "app_login"',
      'ALTER DEFAULT PRIVILEGES FOR ROLE "app_owner" IN SCHEMA "app_schema" '
        + 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "app_login"',
      undefined,
    ]);
  });

  test.each([
    ['user', createUser, { [RESOURCE_PROPERTY_TARGET_USER_SECRET_ARN]: 'arn:target' }],
    ['migrator', createMigrator, { [RESOURCE_PROPERTY_MIGRATOR_USER_SECRET_ARN]: 'arn:migrator' }],
  ] as const)('commits without grants when the %s role already exists', async (_label, operation, secretProperty) => {
    const sql: Array<string | undefined> = [];
    const rdsSend = jest.fn(async (command: { input: { sql?: string } }) => {
      sql.push(command.input.sql);
      if (sql.length === 1) {
        return { transactionId: 'tx-1' };
      }
      if (command.input.sql?.startsWith('SELECT')) {
        return { records: [[{ booleanValue: true }]] };
      }
      return {};
    });

    await operation({
      [RESOURCE_PROPERTY_MASTER_USERNAME]: 'postgres',
      [RESOURCE_PROPERTY_OWNER_USERNAME]: 'app_owner',
      [RESOURCE_PROPERTY_SCHEMA_NAME]: 'app_schema',
      ...secretProperty,
    }, asRdsDataClient({ send: rdsSend }), asSecretsManagerClient({
      send: jest.fn(async () => ({
        SecretString: JSON.stringify({ username: 'app_login', password: 'secret' }),
      })),
    }), target);

    expect(sql).toEqual([
      undefined,
      'SELECT 1 FROM pg_roles WHERE rolname = :r',
      undefined,
    ]);
  });

  test('grants the migrator the owner role and sets search_path', async () => {
    const { rdsDataClient, secretsClient, sql } = createClients();

    await createMigrator({
      [RESOURCE_PROPERTY_MASTER_USERNAME]: 'postgres',
      [RESOURCE_PROPERTY_OWNER_USERNAME]: 'app_owner',
      [RESOURCE_PROPERTY_SCHEMA_NAME]: 'app_schema',
      [RESOURCE_PROPERTY_MIGRATOR_USER_SECRET_ARN]: 'arn:migrator',
    }, rdsDataClient, secretsClient, target);

    expect(sql).toEqual([
      undefined,
      'SELECT 1 FROM pg_roles WHERE rolname = :r',
      'CREATE ROLE "app_login" LOGIN PASSWORD \'secret\'',
      'GRANT CONNECT ON DATABASE "appdb" TO "app_login"',
      'GRANT "app_owner" TO "app_login"',
      'ALTER ROLE "app_login" IN DATABASE "appdb" SET search_path = "app_schema"',
      undefined,
    ]);
  });
});