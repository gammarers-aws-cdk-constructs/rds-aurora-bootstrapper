# RDS Aurora Bootstrapper (CDK v2)

[![npm version](https://img.shields.io/npm/v/rds-aurora-bootstrapper?style=flat-square)](https://www.npmjs.com/package/rds-aurora-bootstrapper)
[![license](https://img.shields.io/npm/l/rds-aurora-bootstrapper?style=flat-square)](https://www.npmjs.com/package/rds-aurora-bootstrapper)
[![Node.js](https://img.shields.io/node/v/rds-aurora-bootstrapper?style=flat-square)](https://www.npmjs.com/package/rds-aurora-bootstrapper)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/rds-aurora-bootstrapper/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/rds-aurora-bootstrapper/actions/workflows/build.yml)

[![View on Construct Hub](https://constructs.dev/badge?package=rds-aurora-bootstrapper)](https://constructs.dev/packages/rds-aurora-bootstrapper)

AWS CDK constructs for bootstrapping Aurora PostgreSQL databases via the RDS Data API.

## Features

- **`AuroraDatabaseCreateOwner`** — creates a `NOLOGIN NOINHERIT` owner role and grants it to the master user
- **`AuroraDatabaseCreateSchema`** — creates a schema, assigns ownership to an existing owner role, and drops the `public` schema with `CASCADE` when `PublicSchema.DROP` is set
- **`AuroraDatabaseCreateUser`** — creates a `LOGIN` application user from a Secrets Manager credential secret, grants `CONNECT` / schema `USAGE` / table DML, and sets default privileges for the owner role
- **`AuroraDatabaseCreateMigrator`** — creates a `LOGIN` migrator user from a Secrets Manager credential secret, grants `CONNECT`, grants membership in the owner role, and sets `search_path` to the target schema
- Idempotent owner, user, and migrator role creation — skips creation when the role already exists
- Validates PostgreSQL identifiers at synthesis time (`ownerUsername`, `schemaName`)
- Resolves the master username from the credentials secret through a CloudFormation dynamic reference

## How it works

Add the constructs to a stack in order: owner role, schema, migrator user, then application user. On deploy, each construct calls the Aurora RDS Data API with the master credentials.

The owner construct creates a `NOLOGIN NOINHERIT` role and grants it to the master user. The schema construct creates the schema, assigns that owner, and either leaves or drops the `public` schema. The migrator construct creates a `LOGIN` role that belongs to the owner and uses the schema as `search_path`. The application user construct creates a `LOGIN` role with connect, schema usage, and table DML privileges. When a role already exists, creation is skipped.

## Installation

### npm

```bash
npm install rds-aurora-bootstrapper
```

### yarn

```bash
yarn add rds-aurora-bootstrapper
```

### pnpm

```bash
pnpm add rds-aurora-bootstrapper
```

## Usage

Provision resources in order: owner role → schema → migrator user → application user.

```typescript
import { Stack } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  AuroraPostgresEngineVersion,
  ClusterInstance,
  DatabaseCluster,
  DatabaseClusterEngine,
} from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import {
  AuroraDatabaseCreateOwner,
  AuroraDatabaseCreateSchema,
  AuroraDatabaseCreateMigrator,
  AuroraDatabaseCreateUser,
  PublicSchema,
} from 'rds-aurora-bootstrapper';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const vpc = new Vpc(this, 'Vpc', { maxAzs: 2 });
    const cluster = new DatabaseCluster(this, 'Cluster', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_17_6,
      }),
      vpc,
      writer: ClusterInstance.provisioned('writer'),
    });
    const masterUserSecret = new Secret(this, 'MasterUserSecret');
    const migratorUserSecret = new Secret(this, 'MigratorUserSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'app_migrator' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });
    const appUserSecret = new Secret(this, 'AppUserSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'app_user' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const createOwner = new AuroraDatabaseCreateOwner(this, 'CreateOwner', {
      dbMasterUserCredentials: masterUserSecret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'app_owner',
    });

    const createSchema = new AuroraDatabaseCreateSchema(this, 'CreateSchema', {
      dbMasterUserCredentials: masterUserSecret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'app_owner',
      schemaName: 'app_schema',
      publicSchema: PublicSchema.DROP,
    });
    createSchema.node.addDependency(createOwner);

    const createMigrator = new AuroraDatabaseCreateMigrator(this, 'CreateMigrator', {
      dbMasterUserCredentials: masterUserSecret,
      migratorUserCredentials: migratorUserSecret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'app_owner',
      schemaName: 'app_schema',
    });
    createMigrator.node.addDependency(createSchema);

    const createUser = new AuroraDatabaseCreateUser(this, 'CreateUser', {
      dbMasterUserCredentials: masterUserSecret,
      targetUserCredentials: appUserSecret,
      dbCluster: cluster,
      dbName: 'appdb',
      ownerUsername: 'app_owner',
      schemaName: 'app_schema',
    });
    createUser.node.addDependency(createSchema);
  }
}
```

Set `publicSchema` to `PublicSchema.KEEP` to leave the `public` schema in place.

## Options

### `AuroraDatabaseCreateOwnerProps`

| Property | Type | Description |
| --- | --- | --- |
| `dbMasterUserCredentials` | `Secret` | Secrets Manager secret with Aurora master credentials. The `username` field is passed to the custom resource via a dynamic reference. |
| `dbCluster` | `DatabaseCluster` | Aurora database cluster where the owner role is created. |
| `dbName` | `string` | PostgreSQL database name targeted by the custom resource. |
| `ownerUsername` | `string` | Username of the owner role to create (`NOLOGIN`, `NOINHERIT`). Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. |

### `AuroraDatabaseCreateSchemaProps`

| Property | Type | Description |
| --- | --- | --- |
| `dbMasterUserCredentials` | `Secret` | Secrets Manager secret with Aurora master credentials. The `username` field is passed to the custom resource via a dynamic reference. |
| `dbCluster` | `DatabaseCluster` | Aurora database cluster where the schema is created. |
| `dbName` | `string` | PostgreSQL database name targeted by the custom resource. |
| `ownerUsername` | `string` | Username of the existing owner role that will own the new schema. Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. |
| `schemaName` | `string` | Name of the PostgreSQL schema to create. Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. |
| `publicSchema` | `PublicSchema` | `KEEP` leaves the `public` schema in place. `DROP` drops it with `CASCADE` after creating the target schema. |

### `AuroraDatabaseCreateMigratorProps`

| Property | Type | Description |
| --- | --- | --- |
| `dbMasterUserCredentials` | `Secret` | Secrets Manager secret with Aurora master credentials. The `username` field is passed to the custom resource via a dynamic reference. |
| `migratorUserCredentials` | `Secret` | Secrets Manager secret with the migrator user credentials (`username` and `password`). Used at runtime to create the `LOGIN` role. |
| `dbCluster` | `DatabaseCluster` | Aurora database cluster where the migrator role is created. |
| `dbName` | `string` | PostgreSQL database name targeted by the custom resource. |
| `ownerUsername` | `string` | Username of the existing owner role granted to the migrator. Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. |
| `schemaName` | `string` | Name of the PostgreSQL schema used as the migrator's `search_path`. Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. |

### `AuroraDatabaseCreateUserProps`

| Property | Type | Description |
| --- | --- | --- |
| `dbMasterUserCredentials` | `Secret` | Secrets Manager secret with Aurora master credentials. The `username` field is passed to the custom resource via a dynamic reference. |
| `targetUserCredentials` | `Secret` | Secrets Manager secret with the application user credentials (`username` and `password`). Used at runtime to create the `LOGIN` role. |
| `dbCluster` | `DatabaseCluster` | Aurora database cluster where the user role is created. |
| `dbName` | `string` | PostgreSQL database name targeted by the custom resource. |
| `ownerUsername` | `string` | Username of the existing owner role used for default privileges. Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. |
| `schemaName` | `string` | Name of the PostgreSQL schema the new user is granted access to. Must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. |

## API

See [API.md](API.md).

## Requirements

- Node.js `>= 20.0.0`
- `aws-cdk-lib` `^2.232.0`
- `constructs` `^10.5.1`
- Aurora PostgreSQL cluster with the [RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html) enabled
- Secrets Manager secrets containing `username` and `password` fields (master credentials, and application / migrator user credentials for `AuroraDatabaseCreateUser` / `AuroraDatabaseCreateMigrator`)

## License

This project is licensed under the Apache-2.0 License.
