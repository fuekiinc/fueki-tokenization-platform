/**
 * Vitest v4 compatibility workspace entrypoint.
 *
 * Vitest 4 removed `defineWorkspace`; projects now live under `test.projects`
 * in vitest.config.ts. This file remains as a stable alias for tooling that
 * expects a workspace config path.
 */
import config from './vitest.config';

export default config;
