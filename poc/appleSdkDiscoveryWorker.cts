interface WorkerRecord {
	deviceType: unknown;
	hasModelName: boolean;
	services: {
		airplay: boolean;
		companion: boolean;
		raop: boolean;
	};
}

interface DiscoveredDeviceShape {
	deviceType: unknown;
	modelName?: unknown;
	services: {
		airplay?: unknown;
		companionLink?: unknown;
		raop?: unknown;
	};
}

type WorkerMessage =
	| { type: 'result'; records: WorkerRecord[] }
	| {
			type: 'error';
			reason: 'sdk-import-failed' | 'discovery-failed';
	  };

/** Runs one high-level SDK discovery and emits only minimized records. */
async function main(): Promise<void> {
	let discover: () => Promise<DiscoveredDeviceShape[]>;
	try {
		const sdk = await import('@basmilius/apple-sdk');
		discover = sdk.discover;
	} catch {
		send({ type: 'error', reason: 'sdk-import-failed' });
		return;
	}

	try {
		const devices = await discover();
		const records: WorkerRecord[] = devices.map(device => ({
			deviceType: device.deviceType,
			hasModelName: typeof device.modelName === 'string' && device.modelName.length > 0,
			services: {
				airplay: device.services.airplay !== undefined,
				companion: device.services.companionLink !== undefined,
				raop: device.services.raop !== undefined,
			},
		}));
		send({ type: 'result', records });
	} catch {
		send({ type: 'error', reason: 'discovery-failed' });
	}
}

/**
 * @param message - Privacy-safe IPC message for the supervising process.
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
