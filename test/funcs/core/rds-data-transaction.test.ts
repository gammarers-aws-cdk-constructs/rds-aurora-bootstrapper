import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { runInTransaction } from '../../../src/funcs/core/rds-data-transaction';
import { RdsDataTarget } from '../../../src/funcs/core/read-rds-data-target';

const target: RdsDataTarget = {
  resourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:app',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:master',
  database: 'appdb',
};

/**
 * RDS Data API client double. The SDK client is a class, so the test substitutes
 * the only method the transaction helper calls.
 */
const createClient = (results: unknown[]) => {
  const commands: Array<{ name: string; sql?: string }> = [];
  const send = jest.fn(async (command: { constructor: { name: string }; input: { sql?: string } }) => {
    commands.push({ name: command.constructor.name, sql: command.input.sql });
    const next = results.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next ?? {};
  });

  return {
    client: { send } as unknown as RDSDataClient,
    commands,
  };
};

describe('runInTransaction', () => {
  test('commits after the statements succeed', async () => {
    const { client, commands } = createClient([
      { transactionId: 'tx-1' },
      {},
      {},
    ]);

    await runInTransaction(client, target, async (transactionId) => {
      await client.send(new ExecuteStatementCommand({
        ...target,
        transactionId,
        sql: 'SELECT 1',
      }));
    });

    expect(commands.map((command) => command.name)).toEqual([
      BeginTransactionCommand.name,
      ExecuteStatementCommand.name,
      CommitTransactionCommand.name,
    ]);
  });

  test('rolls back and rethrows when a statement fails', async () => {
    const { client, commands } = createClient([
      { transactionId: 'tx-1' },
      new Error('statement failed'),
      {},
    ]);

    await expect(runInTransaction(client, target, async (transactionId) => {
      await client.send(new ExecuteStatementCommand({
        ...target,
        transactionId,
        sql: 'SELECT 1',
      }));
    })).rejects.toThrow('statement failed');

    expect(commands.map((command) => command.name)).toEqual([
      BeginTransactionCommand.name,
      ExecuteStatementCommand.name,
      RollbackTransactionCommand.name,
    ]);
  });
});
