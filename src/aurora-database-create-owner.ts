import { CustomResource, Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, LoggingFormat, SystemLogLevel, ApplicationLogLevel } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { CreateOwnerFunction } from './funcs/create-owner-function';
import {
  RESOURCE_PROPERTY_CLUSTER_ARN,
  RESOURCE_PROPERTY_DATABASE_NAME,
  RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN,
  RESOURCE_PROPERTY_MASTER_USERNAME,
  RESOURCE_PROPERTY_OWNER_USERNAME,
  SAFE_POSTGRESQL_IDENTIFIER_PATTERN,
} from './settings/consts';

/**
 * Rejects identifiers that cannot be safely quoted into SQL.
 *
 * @param name - Candidate identifier.
 * @param label - Field name used in error messages.
 * @throws Error when `name` does not match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
 */
const assertSafePostgresqlIdentifier = (name: string, label: string): void => {
  if (SAFE_POSTGRESQL_IDENTIFIER_PATTERN.test(name)) {
    return;
  }

  throw new Error(
    `${label} must match ${SAFE_POSTGRESQL_IDENTIFIER_PATTERN}: got ${JSON.stringify(name)}`,
  );
};

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
   * Creates the custom resource that provisions the database owner role.
   *
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
    const createOwnerFunction = new CreateOwnerFunction(this, 'CreateOwnerFunction', {
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

    const createOwnerProvider = new Provider(this, 'CreateOwnerProvider', {
      onEventHandler: createOwnerFunction,
    });

    const createOwner = new CustomResource(this, 'CreateOwnerCustomResource', {
      serviceToken: createOwnerProvider.serviceToken,
      serviceTimeout: Duration.seconds(10),
      properties: {
        [RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN]: dbMasterUserCredentials.secretArn,
        [RESOURCE_PROPERTY_MASTER_USERNAME]: dbMasterUserCredentials.secretValueFromJson('username').unsafeUnwrap(),
        [RESOURCE_PROPERTY_DATABASE_NAME]: dbName,
        [RESOURCE_PROPERTY_CLUSTER_ARN]: dbCluster.clusterArn,
        [RESOURCE_PROPERTY_OWNER_USERNAME]: ownerUsername,
      },
    });
    createOwner.node.addDependency(dbCluster);
  }
}