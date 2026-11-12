import { readStringProperty, ResourceProperties } from './read-string-property';
import {
  RESOURCE_PROPERTY_CLUSTER_ARN,
  RESOURCE_PROPERTY_DATABASE_NAME,
  RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN,
} from '../../settings/consts';

/**
 * RDS Data API connection target shared by every bootstrap statement.
 */
export interface RdsDataTarget {
  /** Aurora cluster ARN. */
  readonly resourceArn: string;
  /** Master user secret ARN. */
  readonly secretArn: string;
  /** PostgreSQL database name. */
  readonly database: string;
}

/**
 * Reads the cluster, database, and master secret that every operation needs.
 *
 * @param properties - CloudFormation resource properties.
 * @returns Connection target for the RDS Data API.
 * @throws RdsAuroraBootstrapperValidateError when a required property is missing or not a string.
 */
export const readRdsDataTarget = (properties: ResourceProperties): RdsDataTarget => {
  return {
    secretArn: readStringProperty(properties, RESOURCE_PROPERTY_MASTER_USER_SECRET_ARN),
    database: readStringProperty(properties, RESOURCE_PROPERTY_DATABASE_NAME),
    resourceArn: readStringProperty(properties, RESOURCE_PROPERTY_CLUSTER_ARN),
  };
};
