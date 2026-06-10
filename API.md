# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### AuroraDatabaseCreateOwner <a name="AuroraDatabaseCreateOwner" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner"></a>

CDK construct that provisions a PostgreSQL owner role on an Aurora cluster using a custom resource backed by the RDS Data API.

The master username is derived from the `username` field of
{@link AuroraDatabaseCreateOwnerProps.dbMasterUserCredentials} through a
Secrets Manager dynamic reference; callers do not pass it explicitly.

#### Initializers <a name="Initializers" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.Initializer"></a>

```typescript
import { AuroraDatabaseCreateOwner } from 'rds-aurora-bootstrapper'

new AuroraDatabaseCreateOwner(scope: Construct, id: string, props: AuroraDatabaseCreateOwnerProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | - Parent construct. |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.Initializer.parameter.id">id</a></code> | <code>string</code> | - Construct identifier. |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.Initializer.parameter.props">props</a></code> | <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps">AuroraDatabaseCreateOwnerProps</a></code> | - Configuration for the database owner role. |

---

##### `scope`<sup>Required</sup> <a name="scope" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

Parent construct.

---

##### `id`<sup>Required</sup> <a name="id" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.Initializer.parameter.id"></a>

- *Type:* string

Construct identifier.

---

##### `props`<sup>Required</sup> <a name="props" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.Initializer.parameter.props"></a>

- *Type:* <a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps">AuroraDatabaseCreateOwnerProps</a>

Configuration for the database owner role.

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.with">with</a></code> | Applies one or more mixins to this construct. |

---

##### `toString` <a name="toString" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.isConstruct"></a>

```typescript
import { AuroraDatabaseCreateOwner } from 'rds-aurora-bootstrapper'

AuroraDatabaseCreateOwner.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |

---

##### `node`<sup>Required</sup> <a name="node" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwner.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---


## Structs <a name="Structs" id="Structs"></a>

### AuroraDatabaseCreateOwnerProps <a name="AuroraDatabaseCreateOwnerProps" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps"></a>

Properties for {@link AuroraDatabaseCreateOwner}.

#### Initializer <a name="Initializer" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.Initializer"></a>

```typescript
import { AuroraDatabaseCreateOwnerProps } from 'rds-aurora-bootstrapper'

const auroraDatabaseCreateOwnerProps: AuroraDatabaseCreateOwnerProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.property.dbCluster">dbCluster</a></code> | <code>aws-cdk-lib.aws_rds.DatabaseCluster</code> | Aurora database cluster where the owner role is created. |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.property.dbMasterUserCredentials">dbMasterUserCredentials</a></code> | <code>aws-cdk-lib.aws_secretsmanager.Secret</code> | Secrets Manager secret holding the Aurora master user credentials. |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.property.dbName">dbName</a></code> | <code>string</code> | Name of the PostgreSQL database targeted by the custom resource. |
| <code><a href="#rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.property.ownerUsername">ownerUsername</a></code> | <code>string</code> | Username of the owner role to create (`NOLOGIN`, `NOINHERIT`). |

---

##### `dbCluster`<sup>Required</sup> <a name="dbCluster" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.property.dbCluster"></a>

```typescript
public readonly dbCluster: DatabaseCluster;
```

- *Type:* aws-cdk-lib.aws_rds.DatabaseCluster

Aurora database cluster where the owner role is created.

---

##### `dbMasterUserCredentials`<sup>Required</sup> <a name="dbMasterUserCredentials" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.property.dbMasterUserCredentials"></a>

```typescript
public readonly dbMasterUserCredentials: Secret;
```

- *Type:* aws-cdk-lib.aws_secretsmanager.Secret

Secrets Manager secret holding the Aurora master user credentials.

The `username` field is passed to the custom resource via a dynamic reference.

---

##### `dbName`<sup>Required</sup> <a name="dbName" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.property.dbName"></a>

```typescript
public readonly dbName: string;
```

- *Type:* string

Name of the PostgreSQL database targeted by the custom resource.

---

##### `ownerUsername`<sup>Required</sup> <a name="ownerUsername" id="rds-aurora-bootstrapper.AuroraDatabaseCreateOwnerProps.property.ownerUsername"></a>

```typescript
public readonly ownerUsername: string;
```

- *Type:* string

Username of the owner role to create (`NOLOGIN`, `NOINHERIT`).

---



