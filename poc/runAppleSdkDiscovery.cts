import { runIsolatedDiscovery } from './appleSdkDiscovery.cjs';

/** Runs the supervised PoC and writes exactly one privacy-safe JSON result. */
async function main(): Promise<void> {
	const result = await runIsolatedDiscovery();
	process.stdout.write(`${JSON.stringify(result)}\n`);
	process.exitCode = result.outcome === 'completed' ? 0 : 1;
}

void main();
