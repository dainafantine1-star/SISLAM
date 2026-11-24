import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 120000,
    env: {
      SISLAM_DEMO: '1',
      SISLAM_TEST: '1',
      VERCEL: '',
      BLOB_READ_WRITE_TOKEN: '',
      BLOB_STORE_ID: '',
      TEST_MEMORY: '1',
      DATABASE_URL: '',
      S3_ENDPOINT: '',
      S3_BUCKET: '',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
      ANTIVIRUS_URL: '',
      WEB_ORIGIN: 'http://localhost:3400',
      APP_ENCRYPTION_KEY: 'isolated-sislam-test-encryption-key-at-least-32',
      DATA_DIR: './runtime-tests',
    },
  },
});
