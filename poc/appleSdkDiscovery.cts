import { fork } from 'node:child_process';
import { resolve } from 'node:path';

const KNOWN_DEVICE_TYPES = ['appletv', 'homepod', 'homepod-mini'] as const;
const SERVICE_NAMES = ['airplay', 'companion', 'raop'] as const;

type KnownDeviceType = (typeof KNOWN_DEVICE_TYPES)[number];
type NormalizedDeviceType = KnownDeviceType | 'unknown';
type ServiceName = (typeof SERVICE_NAMES)[number];

export interface DiscoveryRecord {
	deviceType: unknown;
	hasModelName: boolean;
	services: Partial<Record<ServiceName, boolean>>;
}

export interface DiscoverySummary {
	deviceCount: number;
	deviceTypes: Record<NormalizedDeviceType, number>;
	modelNameAvailable: number;
	services: Record<ServiceName, number>;
}

interface WorkerResultMessage {
	type: 'result';
	records: DiscoveryRecord[];
}

interface WorkerErrorMessage {
	type: 'error';
	reason: 'sdk-import-failed' | 'discovery-failed';
}

type WorkerMessage = WorkerResultMessage | WorkerErrorMessage;
type FailureReason = WorkerErrorMessage['reason'] | 'worker-exited-without-result';

export type DiscoveryRunResult =
	| {
			outcome: 'completed';
			durationMs: number;
			summary: DiscoverySummary;
	  }
	| {
			outcome: 'failed';
			durationMs: number;
			reason: FailureReason;
	  }
	| {
			outcome: 'timeout';
			durationMs: number;
	  };

export interface DiscoveryRunOptions {
	timeoutMs?: number;
	terminationGraceMs?: number;
	workerPath?: string;
}

/**
 * Creates a privacy-safe aggregate. Device names, identifiers, addresses,
 * ports, and arbitrary upstream device-type strings cannot reach the output.
 * @param records - Already minimized records received from the worker.
 * @returns Aggregate counts safe to print or retain with PoC results.
 */
export function summarizeDiscovery(records: readonly DiscoveryRecord[]): DiscoverySummary {
	const deviceTypes: DiscoverySummary['deviceTypes'] = {
		appletv: 0,
		homepod: 0,
		'homepod-mini': 0,
		unknown: 0,
	};
	const services: DiscoverySummary['services'] = {
		airplay: 0,
		companion: 0,
		raop: 0,
	};
	let modelNameAvailable = 0;

	for (const record of records) {
		const deviceType = isKnownDeviceType(record.deviceType) ? record.deviceType : 'unknown';
		deviceTypes[deviceType] += 1;
		if (record.hasModelName) {
			modelNameAvailable += 1;
		}

		for (const service of SERVICE_NAMES) {
			if (record.services[service] === true) {
				services[service] += 1;
			}
		}
	}

	return {
		deviceCount: records.length,
		deviceTypes,
		modelNameAvailable,
		services,
	};
}

/**
 * Runs the upstream discovery in a disposable process. The process boundary is
 * required because the reviewed SDK API has no AbortSignal or cancellation API.
 * @param options - Optional worker path and bounded lifecycle timings.
 * @returns The completed aggregate or a privacy-safe failure outcome.
 */
export function runIsolatedDiscovery(options: DiscoveryRunOptions = {}): Promise<DiscoveryRunResult> {
	const timeoutMs = options.timeoutMs ?? 12_000;
	const terminationGraceMs = options.terminationGraceMs ?? 500;
	const workerPath = options.workerPath ?? resolve(__dirname, 'appleSdkDiscoveryWorker.cjs');

	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		throw new RangeError('timeoutMs must be a positive safe integer');
	}
	if (!Number.isSafeInteger(terminationGraceMs) || terminationGraceMs < 0) {
		throw new RangeError('terminationGraceMs must be a non-negative safe integer');
	}

	return new Promise(resolveResult => {
		const startedAt = Date.now();
		const child = fork(workerPath, [], {
			execArgv: [],
			serialization: 'json',
			stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
		});
		let resultMessage: WorkerResultMessage | undefined;
		let failureReason: FailureReason | undefined;
		let timedOut = false;
		let settled = false;

		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill('SIGTERM');
		}, timeoutMs);
		const forceTermination = setTimeout(() => {
			if (timedOut && child.exitCode === null && child.signalCode === null) {
				child.kill('SIGKILL');
			}
		}, timeoutMs + terminationGraceMs);

		child.on('message', (message: unknown) => {
			if (!isWorkerMessage(message)) {
				return;
			}

			if (message.type === 'result') {
				resultMessage = message;
			} else {
				failureReason = message.reason;
				child.kill('SIGTERM');
			}
		});

		child.once('error', () => {
			failureReason = 'worker-exited-without-result';
		});

		child.once('close', () => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			clearTimeout(forceTermination);
			const durationMs = Date.now() - startedAt;

			if (timedOut) {
				resolveResult({ outcome: 'timeout', durationMs });
			} else if (failureReason !== undefined) {
				resolveResult({ outcome: 'failed', durationMs, reason: failureReason });
			} else if (resultMessage !== undefined) {
				resolveResult({
					outcome: 'completed',
					durationMs,
					summary: summarizeDiscovery(resultMessage.records),
				});
			} else {
				resolveResult({
					outcome: 'failed',
					durationMs,
					reason: 'worker-exited-without-result',
				});
			}
		});
	});
}

/**
 * @param value - Untrusted device type reported by the upstream SDK.
 * @returns Whether the value belongs to the narrow accepted vocabulary.
 */
function isKnownDeviceType(value: unknown): value is KnownDeviceType {
	return typeof value === 'string' && KNOWN_DEVICE_TYPES.includes(value as KnownDeviceType);
}

/**
 * @param value - Untrusted IPC value received from the worker process.
 * @returns Whether the value has the minimal expected message shape.
 */
function isWorkerMessage(value: unknown): value is WorkerMessage {
	if (typeof value !== 'object' || value === null || !('type' in value)) {
		return false;
	}

	if (value.type === 'result') {
		return 'records' in value && Array.isArray(value.records);
	}

	return (
		value.type === 'error' &&
		'reason' in value &&
		(value.reason === 'sdk-import-failed' || value.reason === 'discovery-failed')
	);
}
