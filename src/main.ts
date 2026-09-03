/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import { join } from 'node:path';

import * as utils from '@iobroker/adapter-core';

import {
	pairedDeviceItems,
	pairedDeviceStatus,
	pairingCandidateItems,
	pairingStatusPayload,
} from './admin/appleTvAdminApi';
import { AppleTvBackendError } from './backends/apple/appleTvBackend';
import { HomePodBackendError } from './backends/apple/homePodBackend';
import type { AppleDeviceClass } from './backends/apple/discoveryTypes';
import { AppleTvProjection } from './objects/appleTvProjection';
import { createIoBrokerTimerScheduler } from './platform/timerScheduler';
import { DeviceSettingsStore, DeviceSettingsStoreError } from './persistence/deviceSettingsStore';
import {
	ManagedDeviceStore,
	ManagedDeviceStoreError,
	type ManagedDiscoveryDeviceClass,
} from './persistence/managedDeviceStore';
import {
	AppleRuntime,
	DeviceManagementError,
	parseAppleTvCommandWrite,
	parseAppWrite,
	parseHomePodWrite,
} from './runtime/appleRuntime';
import { CredentialStoreError, PairingCredentialStore } from './security/pairingCredentialStore';

class Apple extends utils.Adapter {
	private runtime: AppleRuntime | undefined;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({ ...options, name: 'apple' });
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/** Initializes the encrypted store and complete Apple TV runtime. */
	private async onReady(): Promise<void> {
		const instanceDataDirectory = utils.getAbsoluteInstanceDataDir(this);
		const timers = createIoBrokerTimerScheduler(this);
		const credentialStore = new PairingCredentialStore(join(instanceDataDirectory, 'pairings.v1.json'), {
			encrypt: value => this.encrypt(value),
			decrypt: value => this.decrypt(value),
		});
		const deviceSettings = new DeviceSettingsStore(join(instanceDataDirectory, 'device-settings.v1.json'));
		const managedDeviceStore = new ManagedDeviceStore(join(instanceDataDirectory, 'managed-devices.v1.json'));
		this.runtime = new AppleRuntime(
			new AppleTvProjection(this),
			credentialStore,
			{
				info: message => this.log.info(message),
				warn: message => this.log.warn(message),
				debug: message => this.log.debug(message),
			},
			discoveryIntervalMs(this.config.discoveryInterval),
			timers,
			undefined,
			undefined,
			undefined,
			deviceSettings,
			undefined,
			managedDeviceStore,
		);

		try {
			await this.subscribeStatesAsync('devices.appletv.*.remote.*');
			await this.subscribeStatesAsync('devices.appletv.*.playback.*');
			await this.subscribeStatesAsync('devices.appletv.*.power.*');
			await this.subscribeStatesAsync('devices.appletv.*.apps.*');
			await this.subscribeStatesAsync('devices.homepod.*.playback.*');
			await this.subscribeStatesAsync('devices.homepod.*.volume.*');
			await this.runtime.start();
			this.log.info('Apple adapter runtime started');
		} catch (error) {
			const code = startupErrorCode(error);
			this.log.error(`Apple adapter startup failed: ${code}`);
			await this.setStateAsync('info.connection', false, true).catch(() => undefined);
			await this.setStateAsync('info.lastError', code, true).catch(() => undefined);
			await this.runtime.stop().catch(() => undefined);
			this.runtime = undefined;
		}
	}

	/**
	 * Handles only true, unacknowledged, capability-created button writes.
	 *
	 * @param id - Fully qualified ioBroker state ID.
	 * @param state - New state value.
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (this.runtime === undefined) {
			return;
		}
		const command = parseAppleTvCommandWrite(id, state);
		if (command !== undefined) {
			void this.runtime.executeRemote(command.deviceId, command.command).catch(error => {
				const code = error instanceof AppleTvBackendError ? error.code : 'protocol_error';
				this.log.warn(`Apple TV command failed: ${code}`);
			});
			return;
		}
		const homePod = parseHomePodWrite(id, state);
		if (homePod !== undefined) {
			const operation =
				homePod.action === 'playback'
					? this.runtime.executeHomePodPlayback(homePod.deviceId, homePod.command)
					: homePod.action === 'volume'
						? this.runtime.setHomePodVolume(homePod.deviceId, homePod.percent)
						: this.runtime.setHomePodMuted(homePod.deviceId, homePod.muted);
			void operation.catch(error => {
				const code = error instanceof HomePodBackendError ? error.code : 'protocol_error';
				this.log.warn(`HomePod command failed: ${code}`);
			});
			return;
		}
		const app = parseAppWrite(id, state);
		if (app === undefined) {
			return;
		}
		const operation =
			app.action === 'refresh'
				? this.runtime.refreshApps(app.deviceId)
				: app.action === 'launchEntry'
					? this.runtime.launchAppEntry(app.deviceId, app.entryKey)
					: this.runtime.openUrl(app.deviceId, app.url);
		void operation.catch(error => {
			const code = error instanceof AppleTvBackendError ? error.code : 'protocol_error';
			this.log.warn(`App command failed: ${code}`);
		});
	}

	/**
	 * Serves the non-secret Admin pairing API.
	 *
	 * @param message - ioBroker adapter message.
	 */
	private async onMessage(message: ioBroker.Message): Promise<void> {
		if (message.callback === undefined) {
			return;
		}
		let response: unknown;
		try {
			const runtime = this.runtime;
			if (runtime === undefined) {
				throw new AppleTvBackendError('unavailable');
			}
			switch (message.command) {
				case 'getAppleTvDiscoveryOverview':
					response = {
						...discoveryOverview(runtime, 'appletv', 'Apple TV'),
						style: { fontSize: '1.125rem', fontWeight: 500, lineHeight: 1.6 },
					};
					break;
				case 'getHomePodDiscoveryOverview':
					response = discoveryOverview(runtime, 'homepod', 'HomePod');
					break;
				case 'getAirPlayReceiverDiscoveryOverview':
					response = discoveryOverview(runtime, 'airplayReceiver', 'AirPlay Receiver');
					break;
				case 'listPairingCandidates':
					response = pairingCandidateItems(runtime.pairingCandidates());
					break;
				case 'listPairedDevices':
					response = pairedDeviceItems(runtime.pairedDevices());
					break;
				case 'listManagedDeviceCandidates':
					response = runtime.managedDeviceCandidates(requiredManagedDeviceClass(message.message));
					break;
				case 'listManagedDiscoveryDevices':
					response = runtime.managedDiscoveryDevices(requiredManagedDeviceClass(message.message));
					break;
				case 'manageDiscoveredDevice':
					await runtime.manageDiscoveredDevice(
						requiredManagedDeviceClass(message.message),
						requiredString(message.message, 'deviceId'),
					);
					response = { result: 'managed', reloadBrowser: true };
					break;
				case 'setManagedDiscoveryDeviceEnabled':
					await runtime.setManagedDiscoveryDeviceEnabled(
						requiredManagedDeviceClass(message.message),
						requiredString(message.message, 'deviceId'),
						requiredBoolean(message.message, 'enabled'),
					);
					response = { result: 'updated', reloadBrowser: true };
					break;
				case 'removeManagedDiscoveryDevice':
					await runtime.removeManagedDiscoveryDevice(
						requiredManagedDeviceClass(message.message),
						requiredString(message.message, 'deviceId'),
					);
					response = { result: 'removed', reloadBrowser: true };
					break;
				case 'getPairedDevicesOverview':
					{
						const devices = runtime.pairedDevices();
						response = {
							text:
								devices.length === 0
									? 'No paired Apple TV devices'
									: devices
											.map(
												device =>
													`${device.name}${device.model ? ` (${device.model})` : ''}: ${pairedDeviceStatus(device)}, ${device.appCount} app(s)`,
											)
											.join('\n'),
						};
					}
					break;
				case 'removePairedDevice':
					await runtime.removePairedDevice(requiredString(message.message, 'deviceId'));
					response = { result: 'removed', reloadBrowser: true };
					break;
				case 'setPairedDeviceEnabled':
					await runtime.setPairedDeviceEnabled(
						requiredString(message.message, 'deviceId'),
						requiredBoolean(message.message, 'enabled'),
					);
					response = { result: 'updated', reloadBrowser: true };
					break;
				case 'startPairing':
					response = {
						result: (await runtime.startPairing(requiredString(message.message, 'deviceId'))).status,
					};
					break;
				case 'finishPairing':
					response = {
						result: (
							await runtime.finishPairing(
								requiredString(message.message, 'deviceId'),
								requiredString(message.message, 'pin'),
							)
						).status,
					};
					break;
				case 'cancelPairing':
					response = { result: runtime.cancelPairing().status };
					break;
				case 'getPairingStatus':
					response = pairingStatusPayload(runtime.pairingStatus());
					break;
				default:
					response = { error: 'unsupported' };
			}
		} catch (error) {
			response = { error: messageErrorCode(error) };
		}
		this.sendTo(message.from, message.command, response, message.callback);
	}

	/**
	 * Stops discovery, pairing, protocol sessions, and pending projections.
	 *
	 * @param callback - ioBroker unload completion callback.
	 */
	private async onUnload(callback: () => void): Promise<void> {
		try {
			await this.runtime?.stop();
			await this.setStateAsync('info.connection', false, true);
		} catch {
			this.log.warn('Adapter cleanup failed: unavailable');
		} finally {
			callback();
		}
	}
}

/**
 * Returns the latest redacted Admin discovery overview for one device class.
 *
 * @param runtime - Current initialized adapter runtime.
 * @param deviceClass - Exclusive device class to summarize.
 * @param label - Human-readable class label for the response.
 */
function discoveryOverview(runtime: AppleRuntime, deviceClass: AppleDeviceClass, label: string): { text: string } {
	const devices = runtime.discoveredDevices(deviceClass);
	return {
		text:
			devices.length === 0
				? `0 ${label} device(s) detected`
				: `${devices.length} ${label} device(s) detected\n${devices
						.map(device => `${device.name}${device.model ? ` (${device.model})` : ''}`)
						.join('\n')}`,
	};
}

/**
 * Converts configured seconds into a safe refresh interval.
 *
 * @param configured - Unknown native configuration value.
 */
function discoveryIntervalMs(configured: unknown): number {
	const seconds = typeof configured === 'number' && Number.isFinite(configured) ? configured : 60;
	return Math.min(3600, Math.max(30, Math.round(seconds))) * 1000;
}

/**
 * Reads one required string from an untrusted Admin request.
 *
 * @param value - Unknown request payload.
 * @param property - Required property name.
 */
function requiredString(value: unknown, property: string): string {
	if (typeof value !== 'object' || value === null) {
		throw new AppleTvBackendError('unavailable');
	}
	const result = (value as Record<string, unknown>)[property];
	if (typeof result !== 'string' || result.length === 0) {
		throw new AppleTvBackendError('unavailable');
	}
	return result;
}

/**
 * Reads one required boolean from an untrusted Admin request.
 *
 * @param value - Unknown request payload.
 * @param property - Required property name.
 */
function requiredBoolean(value: unknown, property: string): boolean {
	if (typeof value !== 'object' || value === null) {
		throw new AppleTvBackendError('unavailable');
	}
	const result = (value as Record<string, unknown>)[property];
	if (typeof result !== 'boolean') {
		throw new AppleTvBackendError('unavailable');
	}
	return result;
}

/**
 * Reads the two explicitly manageable discovery classes from an Admin request.
 *
 * @param value
 */
function requiredManagedDeviceClass(value: unknown): ManagedDiscoveryDeviceClass {
	if (typeof value !== 'object' || value === null) {
		throw new DeviceManagementError('managed_device_not_found');
	}
	const deviceClass = (value as Record<string, unknown>).deviceClass;
	if (deviceClass !== 'homepod' && deviceClass !== 'airplayReceiver') {
		throw new DeviceManagementError('managed_device_not_found');
	}
	return deviceClass;
}

/**
 * Maps startup failures without exposing credential or upstream data.
 *
 * @param error - Unknown startup failure.
 */
function startupErrorCode(error: unknown): string {
	if (
		error instanceof CredentialStoreError ||
		error instanceof DeviceSettingsStoreError ||
		error instanceof ManagedDeviceStoreError
	) {
		return error.code;
	}
	return messageErrorCode(error);
}

/**
 * Maps Admin-operation failures to non-secret stable codes.
 *
 * @param error - Unknown message-processing failure.
 */
function messageErrorCode(error: unknown): string {
	if (
		error instanceof AppleTvBackendError ||
		error instanceof HomePodBackendError ||
		error instanceof DeviceManagementError
	) {
		return error.code;
	}
	if (error instanceof DeviceSettingsStoreError) {
		return error.code;
	}
	if (error instanceof ManagedDeviceStoreError) {
		return error.code;
	}
	if (error instanceof Error && ['pairing_pin_invalid', 'pairing_not_active'].includes(error.message)) {
		return 'unavailable';
	}
	return 'protocol_error';
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Apple(options);
} else {
	(() => new Apple())();
}
