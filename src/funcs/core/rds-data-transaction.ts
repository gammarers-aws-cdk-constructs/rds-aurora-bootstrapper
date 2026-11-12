import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { RdsDataTarget } from './read-rds-data-target';

/**
 * Runs statements inside one RDS Data API transaction.
 *
 * Commits after `statements` returns. Rolls back and rethrows when a statement fails.
 * The transaction is committed even when `statements` performs no SQL, so an
 * already-open transaction is not left idle.
 *
 * @param client - RDS Data API client.
 * @param target - Cluster, secret, and database.
 * @param statements - Work to run with the transaction id.
 * @throws Rethrows the original error after attempting a rollback.
 */
export const runInTransaction = async (
  client: RDSDataClient,
  target: RdsDataTarget,
  statements: (transactionId: string) => Promise<void>,
): Promise<void> => {
  const { transactionId } = await client.send(new BeginTransactionCommand(target));

  try {
    await statements(transactionId ?? '');

    await client.send(new CommitTransactionCommand({
      resourceArn: target.resourceArn,
      secretArn: target.secretArn,
      transactionId,
    }));
  } catch (error) {
    if (transactionId) {
      await client.send(new RollbackTransactionCommand({
        resourceArn: target.resourceArn,
        secretArn: target.secretArn,
        transactionId,
      })).catch(() => {});
    }
    throw error;
  }
};
