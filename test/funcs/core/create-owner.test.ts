import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
} from '@aws-sdk/client-rds-data';
import { asRdsDataClient } from './sdk-client-double';
import { createOwner } from '../../../src/funcs/core/create-owner';
import { RdsDataTarget } from '../../../src/funcs/core/read-rds-data-target';
import { RESOURCE_PROPERTY_MASTER_USERNAME, RESOURCE_PROPERTY_OWNER_USERNAME } from '../../../src/settings/consts';

const target: RdsDataTarget = {
  resourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:app',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:master',
  database: 'appdb',
};

const properties = {
  [RESOURCE_PROPERTY_MASTER_USERNAME]: 'postgres',
  [RESOURCE_PROPERTY_OWNER_USERNAME]: 'app_owner',
};

const createClient = (results: unknown[]) => {
  const sql: Array<string | undefined> = [];
  const names: string[] = [];
  const send = jest.fn(async (command: { constructor: { name: string }; input: { sql?: string } }) => {
    names.push(command.constructor.name);
    sql.push(command.input.sql);
    return results.shift() ?? {};
  });

  return {
    client: asRdsDataClient({ send }),
    names,
    sql,
  };
};

describe('createOwner', () => {
  test('creates the role when it is missing and commits', async () => {
    const { client, names, sql } = createClient([
      { transactionId: 'tx-1' },
      { records: [] },
      {},
      {},
      {},
    ]);

    await expect(createOwner(properties, client, target)).resolves.toEqual({
      PhysicalResourceId: `${target.resourceArn}:appdb:app_owner`,
      Data: { created: true },
    });

    expect(names).toEqual([
      BeginTransactionCommand.name,
      ExecuteStatementCommand.name,
      ExecuteStatementCommand.name,
      ExecuteStatementCommand.name,
      CommitTransactionCommand.name,
    ]);
    expect(sql).toEqual([
      undefined,
      'SELECT 1 FROM pg_roles WHERE rolname = :r',
      'CREATE ROLE "app_owner" NOLOGIN NOINHERIT',
      'GRANT "app_owner" TO "postgres"',
      undefined,
    ]);
  });

  test('commits without creating the role when it already exists', async () => {
    const { client, names, sql } = createClient([
      { transactionId: 'tx-1' },
      { records: [[{ booleanValue: true }]] },
      {},
    ]);

    await createOwner(properties, client, target);

    expect(names).toEqual([
      BeginTransactionCommand.name,
      ExecuteStatementCommand.name,
      CommitTransactionCommand.name,
    ]);
    expect(sql[1]).toBe('SELECT 1 FROM pg_roles WHERE rolname = :r');
  });
});
