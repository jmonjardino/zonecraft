// SPDX-License-Identifier: GPL-3.0-or-later

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stub = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    // GJS resolves `gi://` imports inside GNOME Shell; Node cannot. Aliasing them
    // to local stubs makes `src/runtime/**` importable from plain vitest specs.
    // Add one entry per namespace as more runtime modules become testable.
    alias: [{ find: /^gi:\/\/Meta(\?.*)?$/, replacement: stub('./tests/stubs/gi/meta.ts') }],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      // Only code that can genuinely run under Node is measured.
      include: ['src/core/**/*.ts', 'src/runtime/**/*.ts'],
      exclude: [
        // Need a live GNOME Shell / GTK4 process, so they cannot be unit tested.
        'src/ui/**',
        'src/extension.ts',
        'src/prefs.ts',
        // Not product code.
        'scripts/**',
        'tests/**',
        'types/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '**/*.config.{ts,js,mjs}',
        '**/*.d.ts',
      ],
      // Measured against src/core/** + src/runtime/**: 81.06% statements, 70.22%
      // branches, 86.51% functions, 83.58% lines. The thresholds sit just under
      // those numbers, so the gate catches a regression today.
      // src/runtime/repository.ts is still untested at 0% because it needs a live
      // GSettings object; once a spec lands for it, re-run
      // `npm run test:coverage` and raise these again.
      thresholds: {
        statements: 79,
        branches: 68,
        functions: 84,
        lines: 81,
      },
    },
  },
});
