import { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data';
import { Context, CdkCustomResourceEvent, CdkCustomResourceResponse, CdkCustomResourceHandler } from 'aws-lambda';

const rdsDataClient = new RDSDataClient({});

export const handler: CdkCustomResourceHandler = async (event: CdkCustomResourceEvent, context: Context): Promise<CdkCustomResourceResponse> => {
  console.log({ event, context });

  switch (event.RequestType) {
    case 'Create':
      const masterUserSecretArn = event.ResourceProperties.MasterUserSecretArn as string;
      const masterUsername = event.ResourceProperties.MasterUsername as string;
      const databaseName = event.ResourceProperties.DatabaseName as string;
      const clusterArn = event.ResourceProperties.ClusterArn as string;
      const ownerUsername = event.ResourceProperties.OwnerUsername as string;

      const physicalResourceId = 'database-create-owner-1a';

      // 👇 Begin transaction.
      const { transactionId } = await rdsDataClient.send(new BeginTransactionCommand({
        resourceArn: clusterArn,
        secretArn: masterUserSecretArn,
        database: databaseName,
      }));

      try {

        const exists = await (async () => {
          const result = await rdsDataClient.send(new ExecuteStatementCommand({
            resourceArn: clusterArn,
            secretArn: masterUserSecretArn,
            database: databaseName,
            transactionId,
            formatRecordsAs: 'JSON',
            sql: 'SELECT 1 FROM pg_roles WHERE rolname = :r',
            parameters: [{ name: 'r', value: { stringValue: ownerUsername } }],
          }));
          return (result.records ?? []).length > 0;
        })();

        if (!exists) {
          // Create user
          await rdsDataClient.send(new ExecuteStatementCommand({
            resourceArn: clusterArn,
            secretArn: masterUserSecretArn,
            database: databaseName,
            transactionId,
            sql: `CREATE ROLE ${ownerUsername} NOLOGIN NOINHERIT`,
          }));

          // 👇 次の処理のために実行ロールを変更
          await rdsDataClient.send(new ExecuteStatementCommand({
            resourceArn: clusterArn,
            secretArn: masterUserSecretArn,
            database: databaseName,
            transactionId,
            sql: `GRANT ${ownerUsername} TO ${masterUsername}`,
          }));

          await rdsDataClient.send(new CommitTransactionCommand({
            resourceArn: clusterArn,
            secretArn: masterUserSecretArn,
            transactionId,
          }));
        }
        return {
          PhysicalResourceId: physicalResourceId,
          Data: {
            created: true,
          },
        };

      } catch (error) {
        if (transactionId) {
          await rdsDataClient.send(new RollbackTransactionCommand({
            resourceArn: clusterArn,
            secretArn: masterUserSecretArn,
            transactionId,
          })).catch(() => {});
        }
        throw error;
      }
    case 'Update':
    case 'Delete':
      return {
        PhysicalResourceId: event.PhysicalResourceId,
      };
    default:
      throw new Error('unreachable');
  }
};
