import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['src/**/*.test.ts'],globalSetup:['../../scripts/test-gameplay.mjs'],env:{BRAINROT_SKIP_ENV:'1'}}});
