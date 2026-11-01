import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['src/**/*.test.ts'],env:{BRAINROT_SKIP_ENV:'1'}}});
