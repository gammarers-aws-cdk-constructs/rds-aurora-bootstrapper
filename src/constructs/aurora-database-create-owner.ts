import { CustomResource, Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, LoggingFormat, SystemLogLevel, ApplicationLogLevel } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { AuroraDatabaseCreateOwnerFunction } from '../funcs/aurora-database-create-owner-function';
import { assertSafePostgresqlIdentifier } from './libs/postgresql/assert-identifier';

/**
 * Properties for {@link AuroraDatabaseCreateOwner}.
 */
export interface AuroraDatabaseCreateOwnerProps {
  /**
   * Secrets Manager secret holding the Aurora master user credentials.
   * The `username` field is passed to the custom resource via a dynamic reference.
   */
  readonly dbMasterUserCredentials: Secret;
  /** Aurora database cluster where the owner role is created. */
  readonly dbCluster: DatabaseCluster;
  /** Name of the PostgreSQL database targeted by the custom resource. */
  readonly dbName: string;
  /**
   * Username of the owner role to create (`NOLOGIN`, `NOINHERIT`).
   * Must match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
   */
  readonly ownerUsername: string;
}

/**
 * CDK construct that provisions a PostgreSQL owner role on an Aurora cluster
 * using a custom resource backed by the RDS Data API.
 *
 * The master username is derived from the `username` field of
 * {@link AuroraDatabaseCreateOwnerProps.dbMasterUserCredentials} through a
 * Secrets Manager dynamic reference; callers do not pass it explicitly.
 */
export class AuroraDatabaseCreateOwner extends Construct {
  /**
   * @param scope - Parent construct.
   * @param id - Construct identifier.
   * @param props - Configuration for the database owner role.
   * @throws Error when `ownerUsername` fails identifier validation.
   */
  constructor(scope: Construct, id: string, props: AuroraDatabaseCreateOwnerProps) {
    super(scope, id);

    const { dbMasterUserCredentials, dbCluster, dbName, ownerUsername } = props;
    assertSafePostgresqlIdentifier(ownerUsername, 'ownerUsername');

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
        MasterUsername: dbMasterUserCredentials.secretValueFromJson('username').unsafeUnwrap(),
        DatabaseName: dbName,
        ClusterArn: dbCluster.clusterArn,
        OwnerUsername: ownerUsername,
      },
    });
    createOwner.node.addDependency(dbCluster);
  }
}