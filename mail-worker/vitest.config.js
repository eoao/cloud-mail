import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		include: ['test/**/*.spec.js'],
		poolOptions: {
			workers: {
				singleWorker: true,
				// The suite truncates the job table itself; isolated storage cannot
				// snapshot Durable Object alarm state cleanly across these tests.
				isolatedStorage: false,
				wrangler: { configPath: './wrangler-vitest.toml' },
			},
		},
	},
});
