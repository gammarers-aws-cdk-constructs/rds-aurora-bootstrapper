import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

interface SendOnlyClient {
  readonly send: unknown;
}

/**
 * Builds an RDS Data API double from a `send` stand-in.
 *
 * The SDK client is a class with private state, so a send-only object cannot
 * satisfy the type without a cast. The cast stays at this boundary.
 *
 * @param client - Object that records or answers `send` calls.
 * @returns Client accepted by the handler helpers.
 */
export const asRdsDataClient = (client: SendOnlyClient): RDSDataClient => {
  // Class clients cannot be constructed from a send-only stand-in.
  return client as unknown as RDSDataClient;
};

/**
 * Builds a Secrets Manager double from a `send` stand-in.
 *
 * The SDK client is a class with private state, so a send-only object cannot
 * satisfy the type without a cast. The cast stays at this boundary.
 *
 * @param client - Object that records or answers `send` calls.
 * @returns Client accepted by the credential helper.
 */
export const asSecretsManagerClient = (client: SendOnlyClient): SecretsManagerClient => {
  // Class clients cannot be constructed from a send-only stand-in.
  return client as unknown as SecretsManagerClient;
};
