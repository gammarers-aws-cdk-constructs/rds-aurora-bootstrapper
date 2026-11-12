import { ProjenCdkConstructLibrary } from '@gammarers/projen-projects';
import { LambdaRuntime } from 'projen/lib/awscdk';
const project = new ProjenCdkConstructLibrary({
  projenrcTs: true,
  releaseToNpm: true,
  npmTrustedPublishing: true,
  cdkVersion: '2.232.0',
  description: 'AWS CDK constructs for bootstrapping Aurora PostgreSQL databases via the RDS Data API.',
  name: 'rds-aurora-bootstrapper',
  repositoryUrl: 'https://github.com/gammarers-aws-cdk-constructs/rds-aurora-bootstrapper.git',
  devDeps: [
    '@gammarers/projen-projects@^0.8.0',
    '@aws-sdk/client-rds-data@^3.743.0',
    '@aws-sdk/client-secrets-manager@^3.743.0',
    '@types/aws-lambda@^8.10.161',
  ],
  lambdaOptions: {
    runtime: LambdaRuntime.NODEJS_24_X,
    singleton: true,
    singletonUuid: '33651113-eb08-454f-8694-942e703e4193',
  },
});
// Handler dependencies are bundled and stay devDependencies. Core modules
// imported by the handler entrypoint use the same packages.
project.eslint?.allowDevDeps('src/funcs/core/**/*.ts');
project.synth();