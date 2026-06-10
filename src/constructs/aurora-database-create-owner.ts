import { CustomResource, Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, LoggingFormat, SystemLogLevel, ApplicationLogLevel } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { AuroraDatabaseCreateOwnerFunction } from '../funcs/aurora-database-create-owner-function';

export interface AuroraDatabaseCreateOwnerProps {
  dbMasterUserCredentials: Secret;
  dbCluster: DatabaseCluster;
  dbName: string;
  ownerUserName: string;
  masterUsername: string;
}

export class AuroraDatabaseCreateOwner extends Construct {
  constructor(scope: Construct, id: string, props: AuroraDatabaseCreateOwnerProps) {
    super(scope, id);

    const { dbMasterUserCredentials, dbCluster, dbName, ownerUserName, masterUsername } = props;

    // 👇 Create database owner.
    const createOwnerFunction = new AuroraDatabaseCreateOwnerFunction(this, 'AuroraDatabaseCreateOwnerFunction', {
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      loggingFormat: LoggingFormat.JSON,
      systemLogLevelV2: SystemLogLevel.INFO,
      applicationLogLevelV2: ApplicationLogLevel.INFO,
    });
    dbMasterUserCredentials.grantRead(createOwnerFunction);
    createOwnerFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [dbCluster.clusterArn],
    }));
    createOwnerFunction.addToRolePolicy(new PolicyStatement({
      actions: ['rds-data:ExecuteStatement'],
      resources: [dbCluster.clusterArn],
    }));

    const auroraDatabaseCreateOwnerProvider = new Provider(this, 'AuroraDatabaseCreateOwnerProvider', {
      onEventHandler: createOwnerFunction,
    });

    const createOwner = new CustomResource(this, 'AuroraDatabaseCreateOwnerCustomResource', {
      serviceToken: auroraDatabaseCreateOwnerProvider.serviceToken,
      serviceTimeout: Duration.seconds(10),
      properties: {
        MasterUserSecretArn: dbMasterUserCredentials.secretArn,
        MasterUsername: masterUsername,
        DatabaseName: dbName,
        ClusterArn: dbCluster.clusterArn,
        OwnerUsername: ownerUserName,
      },
    });
    createOwner.node.addDependency(dbCluster);
  }
}