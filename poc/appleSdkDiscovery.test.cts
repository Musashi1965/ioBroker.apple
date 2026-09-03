import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { runIsolatedDiscovery, summarizeDiscovery } from './appleSdkDiscovery.cjs';

void test('loads the ESM-only SDK through dynamic import from compiled CommonJS', async () => {
	const sdk = await import('@basmilius/apple-sdk');

	assert.equal(typeof sdk.discover, 'function');
	assert.equal(typeof sdk.createDevice, 'function');
});

void test('creates only privacy-safe discovery aggregates', () => {
	const privateAddress = '192.0.2.123';
	const privateName = 'Private living-room device';
	const records = [
		{
			deviceType: 'appletv',
			hasModelName: true,
			services: { airplay: true, companion: true, raop: false },
			address: privateAddress,
			name: privateName,
		},
		{
			deviceType: privateName,
			hasModelName: false,
			services: { airplay: true, raop: true },
		},
	];
	const summary = summarizeDiscovery(records);
	const serialized = JSON.stringify(summary);

	assert.deepEqual(summary, {
		deviceCount: 2,
		deviceTypes: { appletv: 1, homepod: 0, 'homepod-mini': 0, unknown: 1 },
		modelNameAvailable: 1,
		services: { airplay: 2, companion: 1, raop: 1 },
	});
	assert.equal(serialized.includes(privateAddress), false);
	assert.equal(serialized.includes(privateName), false);
});

void test('terminates a worker that does not honor graceful shutdown', async () => {
	const result = await runIsolatedDiscovery({
		timeoutMs: 100,
		terminationGraceMs: 100,
		workerPath: resolve(__dirname, 'fixtures/hangingWorker.cjs'),
	});

	assert.equal(result.outcome, 'timeout');
	assert.ok(result.durationMs < 2_000);
});
