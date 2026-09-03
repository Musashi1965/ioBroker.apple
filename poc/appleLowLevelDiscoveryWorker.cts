import {
	normalizeLowLevelDiscovery,
	selectAppleDeviceRecords,
	type CombinedDiscoveryResultShape,
} from './appleLowLevelDiscovery.cjs';
import type { DiscoveryRecord } from './appleSdkDiscovery.cjs';

type WorkerMessage =
	| { type: 'result'; records: DiscoveryRecord[] }
	| { type: 'error'; reason: 'sdk-import-failed' | 'discovery-failed' };

/** Runs one low-level three-protocol discovery and emits minimized records. */
async function main(): Promise<void> {
	let discoverAll: () => Promise<CombinedDiscoveryResultShape[]>;
	try {
		const common = await import('@basmilius/apple-common');
		discoverAll = () => common.Discovery.discoverAll();
	} catch {
		send({ type: 'error', reason: 'sdk-import-failed' });
		return;
	}

	try {
		const results = await discoverAll();
		const candidates = normalizeLowLevelDiscovery(results);
		send({ type: 'result', records: selectAppleDeviceRecords(candidates) });
	} catch {
		send({ type: 'error', reason: 'discovery-failed' });
	}
}

/**
 * Sends one privacy-safe message to the supervising process.
 * @param message - Minimized IPC result or stable failure code.
 */
function send(message: WorkerMessage): void {
	if (process.send === undefined) {
		process.exitCode = 1;
		return;
	}

	process.send(message, error => {
		process.exitCode = error === null ? 0 : 1;
		process.disconnect();
	});
}

void main();
