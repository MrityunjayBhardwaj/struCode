import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Exclude Playwright specs (they live under packages/app/tests/) — they
    // import from `@playwright/test` and are not vitest-runnable.
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'tests', '.next'],
    // App-package projection helpers are pure functions that import
    // PatternIR types from @stave/editor. Real Strudel parsing in tests
    // means we still need the @strudel transitive imports to resolve via
    // vite-node — mirror the editor's stub + inline pattern.
    server: {
      deps: {
        inline: [/@strudel\//],
      },
    },
  },
  resolve: {
    alias: {
      '@kabelsalat/web': new URL(
        '../editor/test/stubs/kabelsalat-web.mjs',
        import.meta.url,
      ).pathname,
    },
  },
})
