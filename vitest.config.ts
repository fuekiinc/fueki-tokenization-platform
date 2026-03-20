import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const enforceCoverageThresholds = process.env.VITEST_ENFORCE_COVERAGE === 'true';
const vitestJsonOutputFile =
  process.env.VITEST_JSON_OUTPUT_FILE ?? './tests/reports/vitest-results.json';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/stores': path.resolve(__dirname, './src/store'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/api/**/*.test.ts',
      'tests/security/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**', 'tests/contracts/**', 'node_modules/**', 'dist/**', 'backend/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/types/**', 'src/**/*.test.*'],
      thresholds: {
        lines: enforceCoverageThresholds ? 80 : 0,
        branches: enforceCoverageThresholds ? 75 : 0,
        functions: enforceCoverageThresholds ? 80 : 0,
        statements: enforceCoverageThresholds ? 80 : 0,
      },
    },
    reporters: ['default', 'json'],
    outputFile: {
      json: vitestJsonOutputFile,
    },
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
    },
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'happy-dom',
          setupFiles: ['./tests/setup.ts'],
          include: [
            'tests/unit/**/*.test.{ts,tsx}',
          ],
        },
      },
      {
        test: {
          name: 'api',
          environment: 'node',
          setupFiles: ['./tests/api/setup.ts'],
          include: ['tests/api/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'security',
          environment: 'node',
          include: ['tests/security/**/*.test.ts'],
        },
      },
    ],
  },
});
