import { CustomResource, Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, LoggingFormat, SystemLogLevel, ApplicationLogLevel } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { CreateSchemaFunction } from '../funcs/create-schema-function';
import { assertSafePostgresqlIdentifier } from './libs/postgresql/assert-identifier';

/**
 * Properties for {@link AuroraDatabaseCreateSchema}.
 */
export interface AuroraDatabaseCreateSchemaProps {
  /**
   * Secrets Manager secret holding the Aurora master user credentials.
   * The `username` field is passed to the custom resource via a dynamic reference.
   */
  readonly dbMasterUserCredentials: Secret;
  /** Aurora database cluster where the schema is created. */
  readonly dbCluster: DatabaseCluster;
  /** Name of the PostgreSQL database targeted by the custom resource. */
  readonly dbName: string;
  /**
   * Username of the existing owner role that will own the new schema.
   * Must match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
   */
  readonly ownerUsername: string;
  /**
   * Name of the PostgreSQL schema to create.
   * Must match {@link SAFE_POSTGRESQL_IDENTIFIER_PATTERN}.
   */
  readonly schemaName: string;
  /** When `true`, drops the `public` schema with `CASCADE` after creating the target schema. */
  readonly isDropPublicSchema: boolean;
}

/**
 * CDK construct that provisions a PostgreSQL schema on an Aurora cluster
 * using a custom resource backed by the RDS Data API.
 *
 * On Create, the handler creates the schema (if missing), assigns ownership to
 * {@link AuroraDatabaseCreateSchemaProps.ownerUsername}, and optionally drops
 * the `public` schema. The master username is derived from the `username` field
 * of {@link AuroraDatabaseCreateSchemaProps.dbMasterUserCredentials} through a
 * Secrets Manager dynamic reference; callers do not pass it explicitly.
 *
 * Ensure {@link AuroraDatabaseCreateSchemaProps.ownerUsername} already exists
 * (for example via {@link AuroraDatabaseCreateOwner}) before this resource runs.
 */
export class AuroraDatabaseCreateSchema extends Construct {
  /**
   * @param scope - Parent construct.
   * @param id - Construct identifier.
   * @param props - Configuration for the database schema.
   * @throws Error when `ownerUsername` or `schemaName` fails identifier validation.
   */
  constructor(scope: Construct, id: string, props: AuroraDatabaseCreateSchemaProps) {
    super(scope, id);

    const { dbMasterUserCredentials, dbCluster, dbName, ownerUsername, schemaName, isDropPublicSchema } = props;
    assertSafePostgresqlIdentifier(ownerUsername, 'ownerUsername');
    assertSafePostgresqlIdentifier(schemaName, 'schemaName');

    // 👇 Create database owner.
    const createSchemaFunction = new CreateSchemaFunction(this, 'CreateSchemaFunction', {
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      loggingFormat: LoggingFormat.JSON,
      systemLogLevelV2: SystemLogLevel.INFO,
      applicationLogLevelV2: ApplicationLogLevel.INFO,
    });
    dbMasterUserCredentials.grantRead(createSchemaFunction);
    createSchemaFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [dbCluster.clusterArn],
    }));

    const createSchemaProvider = new Provider(this, 'CreateSchemaProvider', {
      onEventHandler: createSchemaFunction,
    });

    const createSchema = new CustomResource(this, 'CreateSchemaCustomResource', {
      serviceToken: createSchemaProvider.serviceToken,
      serviceTimeout: Duration.seconds(10),
      properties: {
        MasterUserSecretArn: dbMasterUserCredentials.secretArn,
        MasterUsername: dbMasterUserCredentials.secretValueFromJson('username').unsafeUnwrap(),
        DatabaseName: dbName,
        ClusterArn: dbCluster.clusterArn,
        OwnerUsername: ownerUsername,
        SchemaName: schemaName,
        IsDropPublicSchema: isDropPublicSchema,
      },
    });
    createSchema.node.addDependency(dbCluster);
  }
}