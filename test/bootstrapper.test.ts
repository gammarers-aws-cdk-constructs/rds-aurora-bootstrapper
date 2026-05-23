import { RDSAuroraBootstrapper } from '../src';

test('bootstrap', () => {
  expect(new RDSAuroraBootstrapper().bootstrap()).toBe('bootstrap');
});