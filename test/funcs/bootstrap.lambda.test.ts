import { CdkCustomResourceEvent, Context } from 'aws-lambda';
import { handler } from '../../src/funcs/bootstrap.lambda';
import { createMigrator } from '../../src/funcs/core/create-migrator';
import { createOwner } from '../../src/funcs/core/create-owner';
import { createSchema } from '../../src/funcs/core/create-schema';
import { createUser } from '../../src/funcs/core/create-user';
import { RdsAuroraBootstrapperValidateError } from '../../src/funcs/core/validate-errors';
import {
  BOOTSTRAP_OPERATION_CREATE_MIGRATOR,
  BOOTSTRAP_OPERATION_CREATE_OWNER,
  BOOTSTRAP_OPERATION_CREATE_SCHEMA,
  BOOTSTRAP_OPERATION_CREATE_USER,
  RESOURCE_PROPERTY_CLUSTER_ARN,
  RESOURCE_PROPERTY_DATABASE_NAME,
  RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN,
  RESOURCE_PROPERTY_OPERATION,
} from '../../src/settings/consts';

jest.mock('../../src/funcs/core/create-owner', () => ({
  createOwner: jest.fn(),
}));
jest.mock('../../src/funcs/core/create-schema', () => ({
  createSchema: jest.fn(),
}));
jest.mock('../../src/funcs/core/create-user', () => ({
  createUser: jest.fn(),
}));
jest.mock('../../src/funcs/core/create-migrator', () => ({
  createMigrator: jest.fn(),
}));

// The handler only logs the context, so the remaining Context fields are unused.
const context = {} as Context;

const sharedEvent = {
  ServiceToken: 'token',
  ResponseURL: 'https://example.com',
  StackId: 'stack',
  RequestId: 'request',
  LogicalResourceId: 'logical',
  ResourceType: 'Custom::Bootstrap',
};

const createEvent = (properties: Record<string, string>): CdkCustomResourceEvent => ({
  ...sharedEvent,
  RequestType: 'Create',
  ResourceProperties: {
    ServiceToken: 'token',
    ...properties,
  },
});

const keepEvent = (requestType: 'Update' | 'Delete'): CdkCustomResourceEvent => ({
  ...sharedEvent,
  RequestType: requestType,
  PhysicalResourceId: 'existing-id',
  ResourceProperties: {
    ServiceToken: 'token',
  },
});

describe('bootstrap handler', () => {
  beforeEach(() => {
    jest.mocked(createOwner).mockResolvedValue({ PhysicalResourceId: 'owner-id' });
    jest.mocked(createSchema).mockResolvedValue({ PhysicalResourceId: 'schema-id' });
    jest.mocked(createUser).mockResolvedValue({ PhysicalResourceId: 'user-id' });
    jest.mocked(createMigrator).mockResolvedValue({ PhysicalResourceId: 'migrator-id' });
  });

  test.each([
    [BOOTSTRAP_OPERATION_CREATE_OWNER, createOwner, 'owner-id'],
    [BOOTSTRAP_OPERATION_CREATE_SCHEMA, createSchema, 'schema-id'],
    [BOOTSTRAP_OPERATION_CREATE_USER, createUser, 'user-id'],
    [BOOTSTRAP_OPERATION_CREATE_MIGRATOR, createMigrator, 'migrator-id'],
  ] as const)('runs %s', async (operation, operationFn, physicalResourceId) => {
    await expect(handler(createEvent({
      [RESOURCE_PROPERTY_OPERATION]: operation,
      [RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN]: 'arn:secret',
      [RESOURCE_PROPERTY_DATABASE_NAME]: 'appdb',
      [RESOURCE_PROPERTY_CLUSTER_ARN]: 'arn:cluster',
    }), context)).resolves.toEqual({ PhysicalResourceId: physicalResourceId });

    expect(operationFn).toHaveBeenCalledTimes(1);
  });

  test('rejects an unknown operation', async () => {
    await expect(handler(createEvent({
      [RESOURCE_PROPERTY_OPERATION]: 'OTHER',
      [RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN]: 'arn:secret',
      [RESOURCE_PROPERTY_DATABASE_NAME]: 'appdb',
      [RESOURCE_PROPERTY_CLUSTER_ARN]: 'arn:cluster',
    }), context)).rejects.toThrow(RdsAuroraBootstrapperValidateError);

    expect(createOwner).not.toHaveBeenCalled();
  });

  test('rejects a request type outside Create, Update, and Delete', async () => {
    // CloudFormation's event union has no other request type, so the test reaches the guard with a cast.
    const event = {
      ...createEvent({}),
      RequestType: 'Replace',
    } as CdkCustomResourceEvent;

    await expect(handler(event, context)).rejects.toThrow('unreachable');
  });

  test.each(['Update', 'Delete'] as const)('keeps the physical resource id on %s', async (requestType) => {
    await expect(handler(keepEvent(requestType), context)).resolves.toEqual({
      PhysicalResourceId: 'existing-id',
    });

    expect(createOwner).not.toHaveBeenCalled();
  });
});
