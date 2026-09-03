import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

import type { TimerHandle, TimerScheduler } from '../../platform/timerScheduler';
import type { AppleDeviceClass, AppleDiscoverySnapshot, DiscoveredDeviceSummary } from './discoveryTypes';

type DiscoveryErrorCode = 'busy' | 'cancelled' | 'discovery_failed' | 'timeout';

interface WorkerResultMessage {
	type: 'result';
	discovery: AppleDiscoverySnapshot;
}

interface WorkerErrorMessage {
	type: 'error';
	code: 'discovery_failed';
}

/** Stable isolated-discovery failure. */
export class AppleDiscoveryError extends Error {
	/**
	 * Creates one redacted discovery error.
	 *
	 * @param code - Stable error code.
	 */
	public constructor(public readonly code: DiscoveryErrorCode) {
		super(code);
		this.name = 'AppleDiscoveryError';
	}
}

/** Cancellable child-process boundary around the non-cancellable upstream scan. */
export class AppleDiscoveryProcess {
	private activeChild: ChildProcess | undefined;
	private activeCancel: (() => void) | undefined;

	/** @param timers - Adapter-owned scheduling boundary. */
	public constructor(private readonly timers: TimerScheduler) {}

	/**
	 * Runs one bounded discovery scan.
	 *
	 * @param timeoutMs - Hard process timeout.
	 * @returns Supported Apple TVs and exclusive device-class counts.
	 */
	public discover(timeoutMs = 9000): Promise<AppleDiscoverySnapshot> {
		if (this.activeChild !== undefined) {
			return Promise.reject(new AppleDiscoveryError('busy'));
		}

		return new Promise((resolvePromise, rejectPromise) => {
			const child = fork(resolve(__dirname, 'discoveryWorker.js'), [], {
				stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
			});
			this.activeChild = child;
			let settled = false;
			const handles: { timeout?: TimerHandle } = {};

			const finish = (discovery?: AppleDiscoverySnapshot, error?: AppleDiscoveryError): void => {
				if (settled) {
					return;
				}
				settled = true;
				if (handles.timeout !== undefined) {
					this.timers.clearTimeout(handles.timeout);
				}
				child.removeAllListeners();
				this.activeChild = undefined;
				this.activeCancel = undefined;
				terminate(child, this.timers);
				if (error !== undefined) {
					rejectPromise(error);
				} else {
					resolvePromise(discovery ?? emptyDiscoverySnapshot());
				}
			};
			this.activeCancel = () => finish(undefined, new AppleDiscoveryError('cancelled'));
			handles.timeout = this.timers.setTimeout(
				() => finish(undefined, new AppleDiscoveryError('timeout')),
				timeoutMs,
			);

			child.on('message', (message: unknown) => {
				if (isResultMessage(message)) {
					finish(message.discovery);
				} else if (isErrorMessage(message)) {
					finish(undefined, new AppleDiscoveryError(message.code));
				}
			});
			child.once('error', () => finish(undefined, new AppleDiscoveryError('discovery_failed')));
			child.once('exit', code => {
				if (code !== 0) {
					finish(undefined, new AppleDiscoveryError('discovery_failed'));
				}
			});
		});
	}

	/** Cancels the active worker during adapter unload. */
	public cancel(): void {
		this.activeCancel?.();
	}
}

/**
 * Terminates one owned worker and applies a bounded force-kill fallback.
 *
 * @param child - Owned discovery worker.
 * @param timers - Adapter-owned scheduling boundary.
 */
function terminate(child: ChildProcess, timers: TimerScheduler): void {
	if (child.connected) {
		child.disconnect();
	}
	if (child.exitCode === null && child.signalCode === null) {
		child.kill('SIGTERM');
		const forceKill = timers.setTimeout(() => {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill('SIGKILL');
			}
		}, 1000);
		child.once('exit', () => timers.clearTimeout(forceKill));
	}
}

/**
 * Validates the trusted worker result envelope.
 *
 * @param value - Unknown IPC message.
 */
function isResultMessage(value: unknown): value is WorkerResultMessage {
	if (!isRecord(value) || value.type !== 'result' || !isRecord(value.discovery)) {
		return false;
	}
	const counts = value.discovery.deviceCounts;
	const details = value.discovery.deviceDetails;
	return (
		Array.isArray(value.discovery.devices) &&
		isHomePods(value.discovery.homePods) &&
		isAirPlayReceivers(value.discovery.airplayReceivers) &&
		isRecord(counts) &&
		isNonNegativeInteger(counts.appletv) &&
		isNonNegativeInteger(counts.homepod) &&
		isNonNegativeInteger(counts.airplayReceiver) &&
		isRecord(details) &&
		isDeviceDetails(details.appletv, 'appletv') &&
		isDeviceDetails(details.homepod, 'homepod') &&
		isDeviceDetails(details.airplayReceiver, 'airplayReceiver') &&
		counts.appletv === details.appletv.length &&
		counts.homepod === details.homepod.length &&
		counts.airplayReceiver === details.airplayReceiver.length
	);
}

/**
 * Validates the stable non-secret HomePod transport shape.
 *
 * @param value - Unknown IPC HomePod list.
 */
function isHomePods(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every(
			homePod =>
				isRecord(homePod) &&
				typeof homePod.deviceId === 'string' &&
				/^[0-9A-F]{12}$/.test(homePod.deviceId) &&
				typeof homePod.name === 'string' &&
				typeof homePod.model === 'string' &&
				/^AudioAccessory\d+,\d+$/i.test(homePod.model) &&
				isDiscoveryService(homePod.airplay, '_airplay._tcp.local'),
		)
	);
}

/**
 * Validates only the service fields required across the worker boundary.
 *
 * @param value - Unknown IPC service value.
 * @param expectedType - Required DNS-SD type.
 */
function isDiscoveryService(value: unknown, expectedType: string): boolean {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.fqdn === 'string' &&
		typeof value.address === 'string' &&
		isRecord(value.service) &&
		value.service.type === expectedType &&
		typeof value.service.port === 'number'
	);
}

/**
 * Validates the stable, non-secret generic receiver transport shape.
 *
 * @param value - Unknown IPC receiver list.
 */
function isAirPlayReceivers(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every(
			receiver =>
				isRecord(receiver) &&
				typeof receiver.deviceId === 'string' &&
				/^[0-9A-F]{12}$/.test(receiver.deviceId) &&
				typeof receiver.name === 'string' &&
				typeof receiver.model === 'string',
		)
	);
}

/**
 * Validates one redacted per-class device summary array from IPC.
 *
 * @param value - Untrusted possible summary array.
 * @param deviceClass - Required exclusive class for every entry.
 */
function isDeviceDetails(value: unknown, deviceClass: AppleDeviceClass): value is DiscoveredDeviceSummary[] {
	return (
		Array.isArray(value) &&
		value.every(
			device =>
				isRecord(device) &&
				device.deviceClass === deviceClass &&
				typeof device.identity === 'string' &&
				device.identity.length > 0 &&
				typeof device.name === 'string' &&
				typeof device.model === 'string',
		)
	);
}

/**
 * Validates the trusted worker error envelope.
 *
 * @param value - Unknown IPC message.
 */
function isErrorMessage(value: unknown): value is WorkerErrorMessage {
	return isRecord(value) && value.type === 'error' && value.code === 'discovery_failed';
}

/**
 * Checks one unknown IPC value as a record.
 *
 * @param value - Unknown IPC message.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Checks one IPC count before it enters the public projection.
 *
 * @param value - Unknown IPC count.
 */
function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Returns a deterministic fallback used only when the worker exits without data. */
function emptyDiscoverySnapshot(): AppleDiscoverySnapshot {
	return {
		devices: [],
		homePods: [],
		airplayReceivers: [],
		deviceCounts: { appletv: 0, homepod: 0, airplayReceiver: 0 },
		deviceDetails: { appletv: [], homepod: [], airplayReceiver: [] },
	};
}
