import { ProjenCdkConstructLibrary } from '@gammarers/projen-projects';
const project = new ProjenCdkConstructLibrary({
  projenrcTs: true,
  releaseToNpm: true,
  npmTrustedPublishing: true,
  cdkVersion: '2.232.0',
  description: 'AWS CDK constructs for bootstrapping Aurora PostgreSQL databases via the RDS Data API.',
  name: 'rds-aurora-bootstrapper',
  repositoryUrl: 'https://github.com/gammarers-aws-cdk-constructs/rds-aurora-bootstrapper.git',
  devDeps: [
    '@gammarers/projen-projects@^0.5.8',
    '@aws-sdk/client-rds-data@^3.743.0',
    '@aws-sdk/client-secrets-manager@^3.743.0',
    '@types/aws-lambda@^8.10.161',
  ],
});
project.synth();