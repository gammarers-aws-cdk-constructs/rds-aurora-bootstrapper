import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  AuroraPostgresEngineVersion,
  ClusterInstance,
  DatabaseCluster,
  DatabaseClusterEngine,
} from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { AuroraDatabaseCreateOwner, AuroraDatabaseCreateSchema, PublicSchema } from '../src';

describe('bootstrap Lambda', () => {
  test('one function serves every bootstrap construct in the stack', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    const vpc = new Vpc(stack, 'Vpc', { maxAzs: 2 });
    const cluster = new DatabaseCluster(stack, 'Cluster', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_17_6,
      }),
      vpc,
      writer: ClusterInstance.provisioned('writer'),
    });
    const secret = new Secret(stack, 'MasterUserSecret');

    new AuroraDatabaseCreateOwner(stack, 'CreateOwner', {
      dbMasterUserCredentials: secret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'app_owner',
    });
    new AuroraDatabaseCreateSchema(stack, 'CreateSchema', {
      dbMasterUserCredentials: secret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'app_owner',
      schemaName: 'app_schema',
      publicSchema: PublicSchema.KEEP,
    });

    const functions = Template.fromStack(stack).findResources('AWS::Lambda::Function');
    const handlers = Object.values(functions).filter((resource) => {
      const properties: unknown = resource.Properties;
      if (typeof properties !== 'object' || properties === null || !('Handler' in properties)) {
        return false;
      }

      return properties.Handler === 'index.handler';
    });

    expect(handlers).toHaveLength(1);
  });
});