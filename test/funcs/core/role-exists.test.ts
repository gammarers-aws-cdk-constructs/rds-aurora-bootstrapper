import { asRdsDataClient } from './sdk-client-double';
import { RdsDataTarget } from '../../../src/funcs/core/read-rds-data-target';
import { roleExists } from '../../../src/funcs/core/role-exists';

const target: RdsDataTarget = {
  resourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:app',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:master',
  database: 'appdb',
};

describe('roleExists', () => {
  test.each([
    [{ records: [[{ booleanValue: true }]] }, true],
    [{ records: [] }, false],
    [{}, false],
  ])('returns %j as %s', async (response, expected) => {
    const send = jest.fn(async () => response);
    const client = asRdsDataClient({ send });

    await expect(roleExists(client, target, 'tx-1', 'app_owner')).resolves.toBe(expected);
    expect(send.mock.calls[0][0].input).toMatchObject({
      sql: 'SELECT 1 FROM pg_roles WHERE rolname = :r',
      transactionId: 'tx-1',
      parameters: [{ name: 'r', value: { stringValue: 'app_owner' } }],
    });
  });
});
