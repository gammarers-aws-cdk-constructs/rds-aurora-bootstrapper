import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createMigrator } from '../../../src/funcs/core/create-migrator';
import { createUser } from '../../../src/funcs/core/create-user';
import { RdsDataTarget } from '../../../src/funcs/core/read-rds-data-target';

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
    rdsDataClient: { send: rdsSend } as unknown as RDSDataClient,
    secretsClient: { send: secretsSend } as unknown as SecretsManagerClient,
    sql,
  };
};

describe('login role operations', () => {
  test('grants application user DML and default privileges', async () => {
    const { rdsDataClient, secretsClient, sql } = createClients();

    await createUser({
      MasterUsername: 'postgres',
      OwnerUsername: 'app_owner',
      SchemaName: 'app_schema',
      TargetUserSecretArn: 'arn:target',
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
    ['user', createUser, { TargetUserSecretArn: 'arn:target' }],
    ['migrator', createMigrator, { MigratorUserSecretArn: 'arn:migrator' }],
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
      MasterUsername: 'postgres',
      OwnerUsername: 'app_owner',
      SchemaName: 'app_schema',
      ...secretProperty,
    }, { send: rdsSend } as unknown as RDSDataClient, {
      send: jest.fn(async () => ({
        SecretString: JSON.stringify({ username: 'app_login', password: 'secret' }),
      })),
    } as unknown as SecretsManagerClient, target);

    expect(sql).toEqual([
      undefined,
      'SELECT 1 FROM pg_roles WHERE rolname = :r',
      undefined,
    ]);
  });

  test('grants the migrator the owner role and sets search_path', async () => {
    const { rdsDataClient, secretsClient, sql } = createClients();

    await createMigrator({
      MasterUsername: 'postgres',
      OwnerUsername: 'app_owner',
      SchemaName: 'app_schema',
      MigratorUserSecretArn: 'arn:migrator',
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