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
import { AuroraDatabaseCreateUser } from '../src';

describe('AuroraDatabaseCreateUser', () => {
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
    const masterUserSecret = new Secret(stack, 'MasterUserSecret');
    const targetUserSecret = new Secret(stack, 'TargetUserSecret');

    new AuroraDatabaseCreateUser(stack, 'CreateUser', {
      dbMasterUserCredentials: masterUserSecret,
      targetUserCredentials: targetUserSecret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'app_owner',
      schemaName: 'app_schema',
    });

    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('throws when ownerUsername is invalid', () => {
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
    const masterUserSecret = new Secret(stack, 'MasterUserSecret');
    const targetUserSecret = new Secret(stack, 'TargetUserSecret');

    expect(() => new AuroraDatabaseCreateUser(stack, 'CreateUser', {
      dbMasterUserCredentials: masterUserSecret,
      targetUserCredentials: targetUserSecret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'invalid name',
      schemaName: 'app_schema',
    })).toThrow(/ownerUsername must match/);
  });

  test('throws when schemaName is invalid', () => {
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
    const masterUserSecret = new Secret(stack, 'MasterUserSecret');
    const targetUserSecret = new Secret(stack, 'TargetUserSecret');

    expect(() => new AuroraDatabaseCreateUser(stack, 'CreateUser', {
      dbMasterUserCredentials: masterUserSecret,
      targetUserCredentials: targetUserSecret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'app_owner',
      schemaName: 'invalid;name',
    })).toThrow(/schemaName must match/);
  });
});
