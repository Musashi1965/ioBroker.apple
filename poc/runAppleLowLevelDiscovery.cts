import { resolve } from 'node:path';

import { runIsolatedDiscovery } from './appleSdkDiscovery.cjs';

/** Runs the correlated low-level PoC and prints one privacy-safe JSON result. */
async function main(): Promise<void> {
	const result = await runIsolatedDiscovery({
		workerPath: resolve(__dirname, 'appleLowLevelDiscoveryWorker.cjs'),
	});
	process.stdout.write(`${JSON.stringify(result)}\n`);
	process.exitCode = result.outcome === 'completed' ? 0 : 1;
}

void main();
