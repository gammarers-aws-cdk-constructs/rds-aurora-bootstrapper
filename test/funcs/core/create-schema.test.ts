import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { createSchema } from '../../../src/funcs/core/create-schema';
import { RdsDataTarget } from '../../../src/funcs/core/read-rds-data-target';
import { RdsAuroraBootstrapperValidateError } from '../../../src/funcs/core/validate-errors';

const target: RdsDataTarget = {
  resourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:app',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:master',
  database: 'appdb',
};

const createClient = () => {
  const sql: Array<string | undefined> = [];
  const send = jest.fn(async (command: { input: { sql?: string } }) => {
    sql.push(command.input.sql);
    if (sql.length === 1) {
      return { transactionId: 'tx-1' };
    }
    return {};
  });

  return {
    client: { send } as unknown as RDSDataClient,
    sql,
  };
};

describe('createSchema', () => {
  test('creates the schema, assigns the owner, and drops public', async () => {
    const { client, sql } = createClient();

    await expect(createSchema({
      OwnerUsername: 'app_owner',
      SchemaName: 'app_schema',
      PublicSchema: 'DROP',
    }, client, target)).resolves.toEqual({
      PhysicalResourceId: `${target.resourceArn}:appdb:app_owner:app_schema`,
      Data: { created: true },
    });

    expect(sql).toEqual([
      undefined,
      'CREATE SCHEMA IF NOT EXISTS "app_schema"',
      'ALTER SCHEMA "app_schema" OWNER TO "app_owner"',
      'DROP SCHEMA IF EXISTS public CASCADE',
      undefined,
    ]);
  });

  test('leaves public in place when PublicSchema is KEEP', async () => {
    const { client, sql } = createClient();

    await createSchema({
      OwnerUsername: 'app_owner',
      SchemaName: 'app_schema',
      PublicSchema: 'KEEP',
    }, client, target);

    expect(sql).not.toContain('DROP SCHEMA IF EXISTS public CASCADE');
  });

  test('rejects an unknown PublicSchema value before opening a transaction', async () => {
    const { client, sql } = createClient();

    await expect(createSchema({
      OwnerUsername: 'app_owner',
      SchemaName: 'app_schema',
      PublicSchema: 'OTHER',
    }, client, target)).rejects.toThrow(RdsAuroraBootstrapperValidateError);

    expect(sql).toEqual([]);
  });
});
