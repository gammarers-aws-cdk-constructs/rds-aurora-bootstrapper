import { CustomResource, Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, LoggingFormat, SystemLogLevel, ApplicationLogLevel } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { CreateSchemaFunction } from './funcs/create-schema-function';
import {
  RESOURCE_PROPERTY_CLUSTER_ARN,
  RESOURCE_PROPERTY_DATABASE_NAME,
  RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN,
  RESOURCE_PROPERTY_MASTER_USERNAME,
  RESOURCE_PROPERTY_OWNER_USERNAME,
  RESOURCE_PROPERTY_PUBLIC_SCHEMA,
  RESOURCE_PROPERTY_SCHEMA_NAME,
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
 * What to do with the PostgreSQL `public` schema after the target schema is created.
 */
export enum PublicSchema {
  /** Leave the `public` schema in place. */
  KEEP = 'KEEP',
  /** Drop the `public` schema with `CASCADE`. */
  DROP = 'DROP',
}

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
  /**
   * Whether to leave or drop the PostgreSQL `public` schema after the target schema is created.
   * {@link PublicSchema.DROP} runs `DROP SCHEMA IF EXISTS public CASCADE`.
   */
  readonly publicSchema: PublicSchema;
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
   * Creates the custom resource that provisions the database schema.
   *
   * @param scope - Parent construct.
   * @param id - Construct identifier.
   * @param props - Configuration for the database schema.
   * @throws Error when `ownerUsername` or `schemaName` fails identifier validation.
   */
  constructor(scope: Construct, id: string, props: AuroraDatabaseCreateSchemaProps) {
    super(scope, id);

    const { dbMasterUserCredentials, dbCluster, dbName, ownerUsername, schemaName, publicSchema } = props;
    assertSafePostgresqlIdentifier(ownerUsername, 'ownerUsername');
    assertSafePostgresqlIdentifier(schemaName, 'schemaName');

    // 👇 Create database schema.
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
        [RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN]: dbMasterUserCredentials.secretArn,
        [RESOURCE_PROPERTY_MASTER_USERNAME]: dbMasterUserCredentials.secretValueFromJson('username').unsafeUnwrap(),
        [RESOURCE_PROPERTY_DATABASE_NAME]: dbName,
        [RESOURCE_PROPERTY_CLUSTER_ARN]: dbCluster.clusterArn,
        [RESOURCE_PROPERTY_OWNER_USERNAME]: ownerUsername,
        [RESOURCE_PROPERTY_SCHEMA_NAME]: schemaName,
        [RESOURCE_PROPERTY_PUBLIC_SCHEMA]: publicSchema,
      },
    });
    createSchema.node.addDependency(dbCluster);
  }
}