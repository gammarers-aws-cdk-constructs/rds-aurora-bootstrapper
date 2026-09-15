import { CustomResource, Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, LoggingFormat, SystemLogLevel, ApplicationLogLevel } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { CreateMigratorFunction } from '../funcs/create-migrator-function';
import { assertSafePostgresqlIdentifier } from './libs/postgresql/assert-identifier';

/**
 * Properties for {@link AuroraDatabaseCreateMigrator}.
 */
export interface AuroraDatabaseCreateMigratorProps {
  /**
   * Secrets Manager secret holding the Aurora master user credentials.
   * The `username` field is passed to the custom resource via a dynamic reference.
   */
  readonly dbMasterUserCredentials: Secret;
  /**
   * Secrets Manager secret holding the migrator user credentials.
   * The handler reads `username` and `password` at runtime to create the role.
   */
  readonly migratorUserCredentials: Secret;
  /** Aurora database cluster where the migrator role is created. */
  readonly dbCluster: DatabaseCluster;
  /** Name of the PostgreSQL database targeted by the custom resource. */
  readonly dbName: string;
  /**
   * Username of the existing owner role granted to the migrator.
   * Must match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
   */
  readonly ownerUsername: string;
  /**
   * Name of the PostgreSQL schema used as the migrator's `search_path`.
   * Must match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
   */
  readonly schemaName: string;
}

/**
 * CDK construct that provisions a PostgreSQL migrator user on an Aurora
 * cluster using a custom resource backed by the RDS Data API.
 *
 * On Create, the handler creates a `LOGIN` role from
 * {@link AuroraDatabaseCreateMigratorProps.migratorUserCredentials} when the
 * role is missing, grants `CONNECT` on the database, grants membership in
 * {@link AuroraDatabaseCreateMigratorProps.ownerUsername}, and sets
 * `search_path` to {@link AuroraDatabaseCreateMigratorProps.schemaName}. Role
 * creation is idempotent when the username already exists.
 *
 * The master username is derived from the `username` field of
 * {@link AuroraDatabaseCreateMigratorProps.dbMasterUserCredentials} through a
 * Secrets Manager dynamic reference; callers do not pass it explicitly.
 *
 * Ensure {@link AuroraDatabaseCreateMigratorProps.ownerUsername} and
 * {@link AuroraDatabaseCreateMigratorProps.schemaName} already exist (for
 * example via {@link AuroraDatabaseCreateOwner} and
 * {@link AuroraDatabaseCreateSchema}) before this resource runs.
 */
export class AuroraDatabaseCreateMigrator extends Construct {
  /**
   * Creates the custom resource that provisions the migrator database user.
   *
   * @param scope - Parent construct.
   * @param id - Construct identifier.
   * @param props - Configuration for the migrator user.
   * @throws Error when `ownerUsername` or `schemaName` fails identifier validation.
   */
  constructor(scope: Construct, id: string, props: AuroraDatabaseCreateMigratorProps) {
    super(scope, id);

    const {
      dbMasterUserCredentials,
      migratorUserCredentials,
      dbCluster,
      dbName,
      ownerUsername,
      schemaName,
    } = props;
    assertSafePostgresqlIdentifier(ownerUsername, 'ownerUsername');
    assertSafePostgresqlIdentifier(schemaName, 'schemaName');

    // 👇 Create database migrator.
    const createMigratorFunction = new CreateMigratorFunction(this, 'CreateMigratorFunction', {
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      loggingFormat: LoggingFormat.JSON,
      systemLogLevelV2: SystemLogLevel.INFO,
      applicationLogLevelV2: ApplicationLogLevel.INFO,
    });
    dbMasterUserCredentials.grantRead(createMigratorFunction);
    migratorUserCredentials.grantRead(createMigratorFunction);
    createMigratorFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [dbCluster.clusterArn],
    }));

    const createMigratorProvider = new Provider(this, 'CreateMigratorProvider', {
      onEventHandler: createMigratorFunction,
    });

    const createMigrator = new CustomResource(this, 'CreateMigratorCustomResource', {
      serviceToken: createMigratorProvider.serviceToken,
      serviceTimeout: Duration.seconds(10),
      properties: {
        MasterUserSecretArn: dbMasterUserCredentials.secretArn,
        MasterUsername: dbMasterUserCredentials.secretValueFromJson('username').unsafeUnwrap(),
        DatabaseName: dbName,
        ClusterArn: dbCluster.clusterArn,
        MigratorUserSecretArn: migratorUserCredentials.secretArn,
        OwnerUsername: ownerUsername,
        SchemaName: schemaName,
      },
    });
    createMigrator.node.addDependency(dbCluster);
  }
}
