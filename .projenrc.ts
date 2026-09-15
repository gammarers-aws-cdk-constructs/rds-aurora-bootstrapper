import { ProjenCdkConstructLibrary } from '@gammarers/projen-projects';
import { awscdk } from 'projen';
const project = new ProjenCdkConstructLibrary({
  projenrcTs: true,
  releaseToNpm: true,
  npmTrustedPublishing: true,
  cdkVersion: '2.232.0',
  name: 'rds-aurora-bootstrapper',
  repository: 'https://github.com/gammarers-aws-cdk-constructs/rds-aurora-bootstrapper.git',
  devDeps: [
    '@gammarers/projen-projects@^0.2.4',
    '@aws-sdk/client-rds-data@^3.743.0',
    '@aws-sdk/client-secrets-manager@^3.743.0',
    '@types/aws-lambda@^8.10.161',
  ],
  jestOptions: {
    extraCliOptions: ['--silent'],
  },
  tsconfigDev: {
    compilerOptions: {
      strict: true,
    },
  },
  lambdaOptions: {
    // target node.js runtime
    runtime: awscdk.LambdaRuntime.NODEJS_24_X,
    bundlingOptions: {
      // list of node modules to exclude from the bundle
      externals: ['@aws-sdk/*'],
      sourcemap: true,
    },
  },
});
project.addPackageIgnore('/.devcontainer');
project.synth();