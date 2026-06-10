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
import { AuroraDatabaseCreateOwner } from '../src';

describe('AuroraDatabaseCreateOwner', () => {
  test('matches snapshot', () => {
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

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
