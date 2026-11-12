import { ExecuteStatementCommand, RDSDataClient } from '@aws-sdk/client-rds-data';
import { RdsDataTarget } from './read-rds-data-target';

/**
 * Returns whether a PostgreSQL role already exists.
 *
 * @param client - RDS Data API client.
 * @param target - Cluster, secret, and database.
 * @param transactionId - Open transaction id.
 * @param roleName - Role name to look up in `pg_roles`.
 * @returns `true` when `pg_roles` contains `roleName`.
 */
export const roleExists = async (
  client: RDSDataClient,
  target: RdsDataTarget,
  transactionId: string,
  roleName: string,
): Promise<boolean> => {
  const result = await client.send(new ExecuteStatementCommand({
    ...target,
    transactionId,
    sql: 'SELECT 1 FROM pg_roles WHERE rolname = :r',
    parameters: [{ name: 'r', value: { stringValue: roleName } }],
  }));

  return (result.records ?? []).length > 0;
};
