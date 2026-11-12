import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  CdkCustomResourceEvent,
  CdkCustomResourceHandler,
  CdkCustomResourceResponse,
  Context,
} from 'aws-lambda';
import { createMigrator } from './core/create-migrator';
import { createOwner } from './core/create-owner';
import { createSchema } from './core/create-schema';
import { createUser } from './core/create-user';
import { readRdsDataTarget } from './core/read-rds-data-target';
import { readStringProperty } from './core/read-string-property';
import { RdsAuroraBootstrapperValidateError } from './core/validate-errors';
import {
  BOOTSTRAP_OPERATION_CREATE_MIGRATOR,
  BOOTSTRAP_OPERATION_CREATE_OWNER,
  BOOTSTRAP_OPERATION_CREATE_SCHEMA,
  BOOTSTRAP_OPERATION_CREATE_USER,
  RESOURCE_PROPERTY_OPERATION,
} from '../settings/consts';

/** Reused Secrets Manager client for the Lambda execution environment. */
const secretsClient = new SecretsManagerClient({});
/** Reused RDS Data API client for the Lambda execution environment. */
const rdsDataClient = new RDSDataClient({});

/**
 * Custom resource handler shared by the Aurora bootstrap constructs.
 *
 * On Create, reads `Operation` and runs the matching bootstrap step: owner role,
 * schema, application user, or migrator user. Update and Delete are no-ops that
 * preserve the physical resource ID. The same function backs every construct in
 * a stack.
 *
 * @param event - CloudFormation custom resource event.
 * @param context - Lambda execution context.
 * @returns Custom resource response with a physical resource ID and optional data.
 * @throws RdsAuroraBootstrapperValidateError when `Operation` or another property is invalid.
 * @throws Rethrows any error after rolling back an open transaction on Create.
 */
export const handler: CdkCustomResourceHandler = async (
  event: CdkCustomResourceEvent,
  context: Context,
): Promise<CdkCustomResourceResponse> => {
  console.log({ event, context });

  // Update and Delete leave the database objects in place.
  if (event.RequestType === 'Update' || event.RequestType === 'Delete') {
    return {
      PhysicalResourceId: event.PhysicalResourceId,
    };
  }

  // CloudFormation only sends Create, Update, or Delete.
  if (event.RequestType !== 'Create') {
    throw new Error('unreachable');
  }

  const operation = readStringProperty(event.ResourceProperties, RESOURCE_PROPERTY_OPERATION);
  const target = readRdsDataTarget(event.ResourceProperties);

  if (operation === BOOTSTRAP_OPERATION_CREATE_OWNER) {
    return createOwner(event.ResourceProperties, rdsDataClient, target);
  }

  if (operation === BOOTSTRAP_OPERATION_CREATE_SCHEMA) {
    return createSchema(event.ResourceProperties, rdsDataClient, target);
  }

  if (operation === BOOTSTRAP_OPERATION_CREATE_USER) {
    return createUser(event.ResourceProperties, rdsDataClient, secretsClient, target);
  }

  if (operation === BOOTSTRAP_OPERATION_CREATE_MIGRATOR) {
    return createMigrator(event.ResourceProperties, rdsDataClient, secretsClient, target);
  }

  throw new RdsAuroraBootstrapperValidateError(
    `${RESOURCE_PROPERTY_OPERATION} must be ${BOOTSTRAP_OPERATION_CREATE_OWNER}, `
    + `${BOOTSTRAP_OPERATION_CREATE_SCHEMA}, ${BOOTSTRAP_OPERATION_CREATE_USER}, `
    + `or ${BOOTSTRAP_OPERATION_CREATE_MIGRATOR}`,
  );
};
