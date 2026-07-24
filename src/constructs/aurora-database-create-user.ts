import { CustomResource, Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, LoggingFormat, SystemLogLevel, ApplicationLogLevel } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { CreateUserFunction } from '../funcs/create-user-function';
import { assertSafePostgresqlIdentifier } from './libs/postgresql/assert-identifier';

/**
 * Properties for {@link AuroraDatabaseCreateUser}.
 */
export interface AuroraDatabaseCreateUserProps {
  /**
   * Secrets Manager secret holding the Aurora master user credentials.
   * The `username` field is passed to the custom resource via a dynamic reference.
   */
  readonly dbMasterUserCredentials: Secret;
  /**
   * Secrets Manager secret holding the target application user credentials.
   * The handler reads `username` and `password` at runtime to create the role.
   */
  readonly targetUserCredentials: Secret;
  /** Aurora database cluster where the user role is created. */
  readonly dbCluster: DatabaseCluster;
  /** Name of the PostgreSQL database targeted by the custom resource. */
  readonly dbName: string;
  /**
   * Username of the existing owner role used for default privileges.
   * Must match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
   */
  readonly ownerUsername: string;
  /**
   * Name of the PostgreSQL schema that the new user is granted access to.
   * Must match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
   */
  readonly schemaName: string;
}

/**
 * CDK construct that provisions a PostgreSQL application user on an Aurora
 * cluster using a custom resource backed by the RDS Data API.
 *
 * On Create, the handler creates a `LOGIN` role from
 * {@link AuroraDatabaseCreateUserProps.targetUserCredentials} when the role is
 * missing, grants `CONNECT` on the database, `USAGE` on the schema, DML on
 * existing tables, and default privileges for future tables owned by
 * {@link AuroraDatabaseCreateUserProps.ownerUsername}. Role creation is
 * idempotent when the username already exists.
 *
 * The master username is derived from the `username` field of
 * {@link AuroraDatabaseCreateUserProps.dbMasterUserCredentials} through a
 * Secrets Manager dynamic reference; callers do not pass it explicitly.
 *
 * Ensure {@link AuroraDatabaseCreateUserProps.ownerUsername} and
 * {@link AuroraDatabaseCreateUserProps.schemaName} already exist (for example
 * via {@link AuroraDatabaseCreateOwner} and {@link AuroraDatabaseCreateSchema})
 * before this resource runs.
 */
export class AuroraDatabaseCreateUser extends Construct {
  /**
   * Creates the custom resource that provisions the application database user.
   *
   * @param scope - Parent construct.
   * @param id - Construct identifier.
   * @param props - Configuration for the database user.
   * @throws Error when `ownerUsername` or `schemaName` fails identifier validation.
   */
  constructor(scope: Construct, id: string, props: AuroraDatabaseCreateUserProps) {
    super(scope, id);

    const {
      dbMasterUserCredentials,
      targetUserCredentials,
      dbCluster,
      dbName,
      ownerUsername,
      schemaName,
    } = props;
    assertSafePostgresqlIdentifier(ownerUsername, 'ownerUsername');
    assertSafePostgresqlIdentifier(schemaName, 'schemaName');

    // 👇 Create database user.
    const createUserFunction = new CreateUserFunction(this, 'CreateUserFunction', {
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      loggingFormat: LoggingFormat.JSON,
      systemLogLevelV2: SystemLogLevel.INFO,
      applicationLogLevelV2: ApplicationLogLevel.INFO,
    });
    dbMasterUserCredentials.grantRead(createUserFunction);
    targetUserCredentials.grantRead(createUserFunction);
    createUserFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [dbCluster.clusterArn],
    }));

    const createUserProvider = new Provider(this, 'CreateUserProvider', {
      onEventHandler: createUserFunction,
    });

    const createUser = new CustomResource(this, 'CreateUserCustomResource', {
      serviceToken: createUserProvider.serviceToken,
      serviceTimeout: Duration.seconds(10),
      properties: {
        MasterUserSecretArn: dbMasterUserCredentials.secretArn,
        MasterUsername: dbMasterUserCredentials.secretValueFromJson('username').unsafeUnwrap(),
        DatabaseName: dbName,
        ClusterArn: dbCluster.clusterArn,
        TargetUserSecretArn: targetUserCredentials.secretArn,
        OwnerUsername: ownerUsername,
        SchemaName: schemaName,
      },
    });
    createUser.node.addDependency(dbCluster);
  }
}
