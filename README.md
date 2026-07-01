# RDS Aurora Bootstrapper (AWS CDK V2)

[![npm version](https://img.shields.io/npm/v/rds-aurora-bootstrapper)](https://www.npmjs.com/package/rds-aurora-bootstrapper)
[![npm license](https://img.shields.io/npm/l/rds-aurora-bootstrapper)](https://www.npmjs.com/package/rds-aurora-bootstrapper)
[![Node.js](https://img.shields.io/node/v/rds-aurora-bootstrapper)](https://www.npmjs.com/package/rds-aurora-bootstrapper)

AWS CDK constructs for bootstrapping Aurora PostgreSQL databases.

## Features

- **`AuroraDatabaseCreateOwner`** — provisions a PostgreSQL owner role on an Aurora cluster via the RDS Data API
- **`AuroraDatabaseCreateSchema`** — creates a PostgreSQL schema, assigns ownership to an existing owner role, and optionally drops the `public` schema with `CASCADE`
- Creates a `NOLOGIN NOINHERIT` owner role and grants it to the master user inside a transaction
- Idempotent owner creation — skips role creation when the owner role already exists
- Validates PostgreSQL identifiers at synthesis time (`ownerUsername`, `schemaName`)
- Master username is resolved from the credentials secret through a CloudFormation dynamic reference
- Bundled Lambda custom resources with IAM permissions and Secrets Manager read access configured automatically

## Installation

```bash
npm install rds-aurora-bootstrapper aws-cdk-lib constructs
```

```bash
yarn add rds-aurora-bootstrapper aws-cdk-lib constructs
```

## Usage

Create the owner role first, then create the application schema:

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
      isDropPublicSchema: true,
    });
    createSchema.node.addDependency(createOwner);
  }
}
```

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
| `isDropPublicSchema` | `boolean` | When `true`, drops the `public` schema with `CASCADE` after creating the target schema. |

## Requirements

- Node.js `>= 20.0.0`
- `aws-cdk-lib` `^2.232.0`
- `constructs` `^10.5.1`
- Aurora PostgreSQL cluster with the [RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html) enabled
- Secrets Manager secret containing `username` and `password` fields (standard RDS master credential format)

## License

This project is licensed under the Apache-2.0 License.
