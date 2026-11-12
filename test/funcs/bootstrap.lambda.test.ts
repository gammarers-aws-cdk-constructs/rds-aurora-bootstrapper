import { CdkCustomResourceEvent, Context } from 'aws-lambda';
import { handler } from '../../src/funcs/bootstrap.lambda';
import { createMigrator } from '../../src/funcs/core/create-migrator';
import { createOwner } from '../../src/funcs/core/create-owner';
import { createSchema } from '../../src/funcs/core/create-schema';
import { createUser } from '../../src/funcs/core/create-user';
import { RdsAuroraBootstrapperValidateError } from '../../src/funcs/core/validate-errors';

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

const context = {} as Context;

const createEvent = (
  requestType: CdkCustomResourceEvent['RequestType'],
  properties: Record<string, string> = {},
): CdkCustomResourceEvent => ({
  RequestType: requestType,
  ServiceToken: 'token',
  ResponseURL: 'https://example.com',
  StackId: 'stack',
  RequestId: 'request',
  LogicalResourceId: 'logical',
  ResourceType: 'Custom::Bootstrap',
  ResourceProperties: {
    ServiceToken: 'token',
    ...properties,
  },
  PhysicalResourceId: requestType === 'Create' ? undefined : 'existing-id',
} as CdkCustomResourceEvent);

describe('bootstrap handler', () => {
  beforeEach(() => {
    jest.mocked(createOwner).mockResolvedValue({ PhysicalResourceId: 'owner-id' });
    jest.mocked(createSchema).mockResolvedValue({ PhysicalResourceId: 'schema-id' });
    jest.mocked(createUser).mockResolvedValue({ PhysicalResourceId: 'user-id' });
    jest.mocked(createMigrator).mockResolvedValue({ PhysicalResourceId: 'migrator-id' });
  });

  test.each([
    ['CREATE_OWNER', createOwner, 'owner-id'],
    ['CREATE_SCHEMA', createSchema, 'schema-id'],
    ['CREATE_USER', createUser, 'user-id'],
    ['CREATE_MIGRATOR', createMigrator, 'migrator-id'],
  ] as const)('runs %s', async (operation, operationFn, physicalResourceId) => {
    await expect(handler(createEvent('Create', {
      Operation: operation,
      MasterUserSecretArn: 'arn:secret',
      DatabaseName: 'appdb',
      ClusterArn: 'arn:cluster',
    }), context)).resolves.toEqual({ PhysicalResourceId: physicalResourceId });

    expect(operationFn).toHaveBeenCalledTimes(1);
  });

  test('rejects an unknown operation', async () => {
    await expect(handler(createEvent('Create', {
      Operation: 'OTHER',
      MasterUserSecretArn: 'arn:secret',
      DatabaseName: 'appdb',
      ClusterArn: 'arn:cluster',
    }), context)).rejects.toThrow(RdsAuroraBootstrapperValidateError);

    expect(createOwner).not.toHaveBeenCalled();
  });

  test.each(['Update', 'Delete'] as const)('keeps the physical resource id on %s', async (requestType) => {
    await expect(handler(createEvent(requestType), context)).resolves.toEqual({
      PhysicalResourceId: 'existing-id',
    });

    expect(createOwner).not.toHaveBeenCalled();
  });
});
