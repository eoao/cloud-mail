import { defineConfig } from 'vitest/config';
import path from 'path';

// The frontend had no test setup at all. This covers the pure logic that is
// easy to get subtly wrong and impossible to notice in a browser: polling
// backoff, quiet hours, shortcut gating, i18n completeness.
export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src')
		}
	},
	test: {
		include: ['test/**/*.test.js'],
		environment: 'jsdom'
	}
});
