import type {
	AppleErrorCode,
	AppleTvApp,
	AppleTvConnectionStatus,
	AppleTvRemoteCommand,
	AppleTvSnapshot,
} from '../domain/appleTv';
import {
	appEntryKeys,
	HOME_POD_PLAYBACK_COMMANDS,
	isAppEntryKey,
	NAVIGATION_COMMANDS,
	PLAYBACK_COMMANDS,
	POWER_COMMANDS,
} from '../objects/objectDefinitions';
import type { PairingCredentials } from '../security/pairingCredentialStore';
import { AppleDiscoveryError, AppleDiscoveryProcess } from '../backends/apple/discoveryProcess';
import type {
	AppleDeviceClass,
	AppleDeviceCounts,
	AppleDiscoverySnapshot,
	DiscoveredAirPlayReceiver,
	DiscoveredAppleTv,
	DiscoveredDeviceSummary,
	DiscoveredHomePod,
} from '../backends/apple/discoveryTypes';
import { AppleTvBackend, AppleTvBackendError, isBundleId, normalizeOpenUrl } from '../backends/apple/appleTvBackend';
import { AppleTvPairing, type PairingStatusResult } from '../backends/apple/appleTvPairing';
import { HomePodBackend, HomePodBackendError } from '../backends/apple/homePodBackend';
import type {
	HomePodCommand,
	HomePodConnectionStatus,
	HomePodPlaybackCommand,
	HomePodSnapshot,
} from '../domain/homePod';
import { emptyHomePodSnapshot } from '../domain/homePod';
import type { ManagedDiscoveryDeviceClass, ManagedDiscoveryDeviceRecord } from '../persistence/managedDeviceStore';
import type { TimerHandle, TimerScheduler } from '../platform/timerScheduler';

/** Non-secret device item returned to the Admin pairing selector. */
export interface PairingCandidate {
	/** Stable protocol identifier. */
	deviceId: string;
	/** Current human-readable display name. */
	name: string;
	/** Reported hardware model. */
	model: string;
	/** Whether long-term credentials already exist. */
	paired: boolean;
}

/** Non-secret summary of one persistently paired Apple TV. */
export interface PairedDevice {
	/** Stable protocol identifier used by Admin actions. */
	deviceId: string;
	/** Current display name or a neutral fallback while offline. */
	name: string;
	/** Reported hardware model when the device is currently known. */
	model: string;
	/** Whether the latest discovery contains the device. */
	discovered: boolean;
	/** Whether the backend currently reports a usable connection. */
	connected: boolean;
	/** Size of the current in-memory launchable-app catalog. */
	appCount: number;
	/** Whether the device is allowed to connect and receive a public object tree. */
	enabled: boolean;
}

/** Strongly identified current target not yet adopted into local management. */
export interface ManagedDeviceCandidate {
	deviceClass: ManagedDiscoveryDeviceClass;
	deviceId: string;
	name: string;
	model: string;
}

/** Non-secret Admin summary of one adopted HomePod or AirPlay Receiver. */
export interface ManagedDiscoveryDevice extends ManagedDiscoveryDeviceRecord {
	discovered: boolean;
	connected: boolean;
	connectionState: string;
}

/** Stable Admin-facing error for explicit device-management operations. */
export class DeviceManagementError extends Error {
	public constructor(public readonly code: 'not_discovered' | 'managed_device_not_found') {
		super(code);
		this.name = 'DeviceManagementError';
	}
}

/** Minimal redacted logging boundary. */
export interface AppleRuntimeLogger {
	/** Logs an informational lifecycle event. */
	info(message: string): void;
	/** Logs a stable warning without upstream payloads. */
	warn(message: string): void;
	/** Logs detailed non-secret diagnostics when ioBroker debug logging is enabled. */
	debug(message: string): void;
}

interface RuntimeDevice {
	target: DiscoveredAppleTv;
	backend: AppleTvBackendPort;
	status: AppleTvConnectionStatus;
	connectPromise?: Promise<void>;
	commandQueue: Promise<void>;
	appsCapable: boolean;
}

interface RuntimeHomePod {
	target: DiscoveredHomePod;
	backend: HomePodBackendPort;
	status: HomePodConnectionStatus;
	connectPromise?: Promise<void>;
	commandQueue: Promise<void>;
	snapshot: HomePodSnapshot;
}

interface ProjectionPort {
	initialize(): Promise<void>;
	airPlayReceivers(targets: readonly DiscoveredAirPlayReceiver[], seenAt: number): Promise<void>;
	homePods(targets: readonly DiscoveredHomePod[], seenAt: number): Promise<void>;
	initializeHomePod(deviceId: string): Promise<void>;
	homePodConnection(deviceId: string, status: HomePodConnectionStatus): Promise<void>;
	homePodSnapshot(deviceId: string, snapshot: HomePodSnapshot): Promise<void>;
	homePodCommandStarted(deviceId: string, command: HomePodCommand): Promise<void>;
	homePodCommandResult(
		deviceId: string,
		command: HomePodCommand,
		status: 'success' | 'error',
		error?: string,
		acknowledgedValue?: number | boolean,
	): Promise<void>;
	discoveryRunning(running: boolean): Promise<void>;
	discovered(target: DiscoveredAppleTv, paired: boolean, remoteAvailable: boolean): Promise<void>;
	initializeDevice(deviceId: string, state: 'discovered' | 'pairingRequired'): Promise<void>;
	connection(deviceId: string, status: AppleTvConnectionStatus): Promise<void>;
	snapshot(deviceId: string, snapshot: AppleTvSnapshot): Promise<void>;
	apps(deviceId: string, apps: readonly AppleTvApp[]): Promise<void>;
	appCommandStarted(deviceId: string, action: 'refresh' | 'launch' | 'openurl', target?: string): Promise<void>;
	appCommandResult(
		deviceId: string,
		action: 'refresh' | 'launch' | 'openurl',
		status: 'success' | 'error',
		error?: string,
		entryKey?: string,
		target?: string,
	): Promise<void>;
	commandStarted(deviceId: string, command: AppleTvRemoteCommand): Promise<void>;
	commandResult(
		deviceId: string,
		command: AppleTvRemoteCommand,
		status: 'success' | 'error',
		error?: string,
	): Promise<void>;
	aggregate(deviceCounts: AppleDeviceCounts, connected: boolean, error?: string): Promise<void>;
	adapterConnection(connected: boolean): Promise<void>;
	removeDevice(deviceId: string): Promise<void>;
	removeUnpairedDevices(pairedDeviceIds: readonly string[]): Promise<void>;
	retainManagedHomePods(deviceIds: readonly string[]): Promise<void>;
	retainManagedAirPlayReceivers(deviceIds: readonly string[]): Promise<void>;
	removeHomePod(deviceId: string): Promise<void>;
	removeAirPlayReceiver(deviceId: string): Promise<void>;
}

interface CredentialStorePort {
	initialize(): Promise<void>;
	get(deviceId: string): PairingCredentials | undefined;
	deviceIds(): string[];
	set(deviceId: string, credentials: PairingCredentials): Promise<void>;
	remove(deviceId: string): Promise<boolean>;
}

interface DeviceSettingsPort {
	initialize(): Promise<void>;
	isEnabled(deviceId: string): boolean;
	setEnabled(deviceId: string, enabled: boolean): Promise<void>;
	remove(deviceId: string): Promise<void>;
}

interface ManagedDeviceStorePort {
	initialize(): Promise<void>;
	list(deviceClass: ManagedDiscoveryDeviceClass): ManagedDiscoveryDeviceRecord[];
	has(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): boolean;
	isEnabled(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): boolean;
	manage(
		deviceClass: ManagedDiscoveryDeviceClass,
		device: Pick<ManagedDiscoveryDeviceRecord, 'deviceId' | 'name' | 'model'>,
	): Promise<void>;
	observe(
		deviceClass: ManagedDiscoveryDeviceClass,
		device: Pick<ManagedDiscoveryDeviceRecord, 'deviceId' | 'name' | 'model'>,
	): Promise<void>;
	setEnabled(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string, enabled: boolean): Promise<void>;
	remove(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): Promise<boolean>;
}

interface DiscoveryPort {
	discover(timeoutMs?: number): Promise<AppleDiscoverySnapshot>;
	cancel(): void;
}

interface PairingPort {
	start(target: DiscoveredAppleTv): Promise<void>;
	finish(deviceId: string, pin: string): Promise<PairingCredentials>;
	cancel(): void;
	status(): PairingStatusResult;
}

interface AppleTvBackendPort {
	updateTarget(target: DiscoveredAppleTv): void;
	connect(credentials: PairingCredentials): Promise<void>;
	executeRemote(command: AppleTvRemoteCommand): Promise<void>;
	listApps(): Promise<AppleTvApp[]>;
	launchApp(bundleId: string): Promise<void>;
	openUrl(url: string): Promise<void>;
	disconnect(): Promise<void>;
}

interface HomePodBackendPort {
	updateTarget(target: DiscoveredHomePod): void;
	connect(): Promise<void>;
	executePlayback(command: HomePodPlaybackCommand): Promise<void>;
	setVolume(percent: number): Promise<void>;
	setMuted(muted: boolean): Promise<void>;
	disconnect(): Promise<void>;
}

/** Creates one protocol backend behind the runtime test boundary. */
export type AppleTvBackendFactory = (
	target: DiscoveredAppleTv,
	callbacks: {
		onSnapshot(snapshot: AppleTvSnapshot): void;
		onConnection(status: AppleTvConnectionStatus): void;
	},
) => AppleTvBackendPort;

/** Creates one HomePod transient backend behind the runtime test boundary. */
export type HomePodBackendFactory = (
	target: DiscoveredHomePod,
	callbacks: {
		onSnapshot(snapshot: HomePodSnapshot): void;
		onConnection(status: HomePodConnectionStatus): void;
	},
) => HomePodBackendPort;

/** Coordinates discovery, pairing, protocol backends, and ioBroker projection. */
export class AppleRuntime {
	private readonly devices = new Map<string, RuntimeDevice>();
	private readonly homePods = new Map<string, RuntimeHomePod>();
	private currentDiscovery = new Map<string, DiscoveredAppleTv>();
	private currentHomePods = new Map<string, DiscoveredHomePod>();
	private currentAirPlayReceivers = new Map<string, DiscoveredAirPlayReceiver>();
	private currentDeviceCounts: AppleDeviceCounts = { appletv: 0, homepod: 0, airplayReceiver: 0 };
	private currentDeviceDetails: Record<AppleDeviceClass, DiscoveredDeviceSummary[]> = {
		appletv: [],
		homepod: [],
		airplayReceiver: [],
	};
	private readonly connectionStates = new Map<string, AppleTvConnectionStatus>();
	private readonly homePodConnectionStates = new Map<string, HomePodConnectionStatus>();
	private readonly appCatalogs = new Map<string, Map<string, AppleTvApp>>();
	private readonly automaticAppRefreshes = new Set<string>();
	private timer: TimerHandle;
	private scanPromise: Promise<void> | undefined;
	private projectionQueue: Promise<void> = Promise.resolve();
	private managementQueue: Promise<void> = Promise.resolve();
	private stopping = false;

	/**
	 * Creates one adapter runtime.
	 *
	 * @param projection - Public object/state projection.
	 * @param credentialStore - Encrypted instance credential store.
	 * @param logger - Redacted adapter logger.
	 * @param discoveryIntervalMs - Bounded discovery interval.
	 * @param timers - Adapter-owned scheduling boundary.
	 * @param discovery - Isolated discovery process.
	 * @param pairing - Bounded pairing coordinator.
	 * @param backendFactory - Project-owned protocol backend factory.
	 * @param deviceSettings - Durable non-secret device enablement boundary.
	 * @param homePodBackendFactory - Project-owned transient HomePod backend factory.
	 * @param managedDeviceStore - Explicit HomePod and AirPlay Receiver adoption inventory.
	 */
	public constructor(
		private readonly projection: ProjectionPort,
		private readonly credentialStore: CredentialStorePort,
		private readonly logger: AppleRuntimeLogger,
		private readonly discoveryIntervalMs: number,
		private readonly timers: TimerScheduler,
		private readonly discovery: DiscoveryPort = new AppleDiscoveryProcess(timers),
		private readonly pairing: PairingPort = new AppleTvPairing(timers),
		private readonly backendFactory: AppleTvBackendFactory = (target, callbacks) =>
			new AppleTvBackend(target, callbacks),
		private readonly deviceSettings: DeviceSettingsPort = new DefaultDeviceSettings(),
		private readonly homePodBackendFactory: HomePodBackendFactory = (target, callbacks) =>
			new HomePodBackend(target, callbacks, this.logger, timers),
		private readonly managedDeviceStore: ManagedDeviceStorePort = new DefaultManagedDeviceStore(),
	) {}

	/** Initializes durable state, runs discovery, and starts bounded refreshes. */
	public async start(): Promise<void> {
		this.stopping = false;
		await this.credentialStore.initialize();
		await this.deviceSettings.initialize();
		await this.managedDeviceStore.initialize();
		await this.projection.initialize();
		await this.projection.removeUnpairedDevices(
			this.credentialStore.deviceIds().filter(deviceId => this.deviceSettings.isEnabled(deviceId)),
		);
		await this.projection.retainManagedHomePods(this.activeManagedDeviceIds('homepod'));
		await this.projection.retainManagedAirPlayReceivers(this.activeManagedDeviceIds('airplayReceiver'));
		await this.refresh();
		if (!this.stopping) {
			this.timer = this.timers.setInterval(() => void this.refresh(), this.discoveryIntervalMs);
		}
	}

	/** Runs one de-duplicated discovery cycle. */
	public refresh(): Promise<void> {
		if (this.scanPromise !== undefined) {
			this.logger.debug('Discovery refresh joined the active scan');
			return this.scanPromise;
		}
		const operation = this.runDiscovery().finally(() => {
			if (this.scanPromise === operation) {
				this.scanPromise = undefined;
			}
		});
		this.scanPromise = operation;
		return operation;
	}

	/** Lists only currently discovered, non-secret pairing candidates. */
	public pairingCandidates(): PairingCandidate[] {
		return [...this.currentDiscovery.values()]
			.map(target => ({
				deviceId: target.deviceId,
				name: target.name,
				model: target.model,
				paired: this.credentialStore.get(target.deviceId) !== undefined,
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	/**
	 * Lists redacted devices from the latest successful discovery for one class.
	 *
	 * @param deviceClass - Exclusive device class from the discovery contract.
	 */
	public discoveredDevices(deviceClass: AppleDeviceClass): DiscoveredDeviceSummary[] {
		return this.currentDeviceDetails[deviceClass].map(device => ({ ...device }));
	}

	/** Lists all durable pairings, including devices that are currently offline. */
	public pairedDevices(): PairedDevice[] {
		return this.credentialStore
			.deviceIds()
			.map(deviceId => {
				const target = this.currentDiscovery.get(deviceId) ?? this.devices.get(deviceId)?.target;
				return {
					deviceId,
					name: target?.name ?? `Apple TV …${deviceId.slice(-4)}`,
					model: target?.model ?? '',
					discovered: this.currentDiscovery.has(deviceId),
					connected: this.devices.get(deviceId)?.status.online ?? false,
					appCount: this.appCatalogs.get(deviceId)?.size ?? 0,
					enabled: this.deviceSettings.isEnabled(deviceId),
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	/**
	 * Lists current strongly identified devices that have not yet been adopted.
	 *
	 * @param deviceClass
	 */
	public managedDeviceCandidates(deviceClass: ManagedDiscoveryDeviceClass): ManagedDeviceCandidate[] {
		return [...this.currentManagedTargets(deviceClass).values()]
			.filter(target => !this.managedDeviceStore.has(deviceClass, target.deviceId))
			.map(target => ({
				deviceClass,
				deviceId: target.deviceId,
				name: target.name,
				model: target.model,
			}))
			.sort((left, right) => left.name.localeCompare(right.name) || left.deviceId.localeCompare(right.deviceId));
	}

	/**
	 * Lists every adopted HomePod or receiver, including passive and offline devices.
	 *
	 * @param deviceClass
	 */
	public managedDiscoveryDevices(deviceClass: ManagedDiscoveryDeviceClass): ManagedDiscoveryDevice[] {
		const currentTargets = this.currentManagedTargets(deviceClass);
		return this.managedDeviceStore.list(deviceClass).map(record => {
			const current = currentTargets.get(record.deviceId);
			const homePodStatus = deviceClass === 'homepod' ? this.homePods.get(record.deviceId)?.status : undefined;
			return {
				...record,
				name: current?.name ?? record.name,
				model: current?.model ?? record.model,
				discovered: current !== undefined,
				connected: homePodStatus?.online ?? false,
				connectionState: homePodStatus?.state ?? (current === undefined ? 'unavailable' : 'discovered'),
			};
		});
	}

	/**
	 * Adopts one current strong-identity device and activates its projection.
	 *
	 * @param deviceClass
	 * @param deviceId
	 */
	public manageDiscoveredDevice(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): Promise<void> {
		return this.serializeManagement(async () => {
			const normalized = normalizeDeviceId(deviceId);
			const target = this.currentManagedTargets(deviceClass).get(normalized);
			if (target === undefined) {
				throw new DeviceManagementError('not_discovered');
			}
			await this.managedDeviceStore.manage(deviceClass, target);
			await this.reconcileManagedClass(deviceClass, Date.now());
		});
	}

	/**
	 * Changes an adopted HomePod or receiver between active and passive.
	 *
	 * @param deviceClass
	 * @param deviceId
	 * @param enabled
	 */
	public setManagedDiscoveryDeviceEnabled(
		deviceClass: ManagedDiscoveryDeviceClass,
		deviceId: string,
		enabled: boolean,
	): Promise<void> {
		return this.serializeManagement(async () => {
			const normalized = normalizeDeviceId(deviceId);
			if (!this.managedDeviceStore.has(deviceClass, normalized)) {
				throw new DeviceManagementError('managed_device_not_found');
			}
			await this.managedDeviceStore.setEnabled(deviceClass, normalized, enabled);
			await this.reconcileManagedClass(deviceClass, Date.now());
		});
	}

	/**
	 * Forgets one adopted device and removes its adapter-owned object tree.
	 *
	 * @param deviceClass
	 * @param deviceId
	 */
	public removeManagedDiscoveryDevice(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): Promise<void> {
		return this.serializeManagement(async () => {
			const normalized = normalizeDeviceId(deviceId);
			if (!this.managedDeviceStore.has(deviceClass, normalized)) {
				throw new DeviceManagementError('managed_device_not_found');
			}
			if (deviceClass === 'homepod') {
				await this.disconnectHomePod(normalized);
			}
			await this.managedDeviceStore.remove(deviceClass, normalized);
			await this.removeManagedProjection(deviceClass, normalized);
			await this.projection.adapterConnection(this.anyDeviceOnline());
		});
	}

	/**
	 * Starts pairing for a currently discovered target.
	 *
	 * @param deviceId - Selected stable device identifier.
	 */
	public async startPairing(deviceId: string): Promise<PairingStatusResult> {
		const target = this.currentDiscovery.get(normalizeDeviceId(deviceId));
		if (target === undefined) {
			throw new AppleTvBackendError('not_discovered');
		}
		await this.pairing.start(target);
		return this.pairing.status();
	}

	/**
	 * Completes pairing, atomically persists credentials, and connects the target.
	 *
	 * @param deviceId - Selected stable device identifier.
	 * @param pin - Ephemeral four-digit PIN.
	 */
	public async finishPairing(deviceId: string, pin: string): Promise<PairingStatusResult> {
		const normalized = normalizeDeviceId(deviceId);
		const credentials = await this.pairing.finish(normalized, pin);
		await this.deviceSettings.setEnabled(normalized, true);
		await this.credentialStore.set(normalized, credentials);
		const target = this.currentDiscovery.get(normalized);
		if (target !== undefined) {
			const firstDiscovery = !this.devices.has(normalized);
			await this.projection.discovered(target, true, false);
			if (firstDiscovery) {
				await this.projection.initializeDevice(normalized, 'discovered');
			}
			void this.connectDevice(this.getOrCreateDevice(target));
		}
		return this.pairing.status();
	}

	/**
	 * Enables or disables one paired Apple TV without changing its credentials.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param enabled - Whether runtime connection and public projection are allowed.
	 */
	public async setPairedDeviceEnabled(deviceId: string, enabled: boolean): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		if (this.credentialStore.get(normalized) === undefined) {
			throw new AppleTvBackendError('not_paired');
		}
		if (this.deviceSettings.isEnabled(normalized) === enabled) {
			return;
		}
		await this.deviceSettings.setEnabled(normalized, enabled);
		if (enabled) {
			const target = this.currentDiscovery.get(normalized);
			if (target === undefined) {
				return;
			}
			const firstDiscovery = !this.devices.has(normalized);
			const device = this.getOrCreateDevice(target);
			await this.projection.discovered(target, true, false);
			if (firstDiscovery) {
				await this.projection.initializeDevice(normalized, 'discovered');
			}
			void this.connectDevice(device);
			return;
		}

		const device = this.devices.get(normalized);
		const execution = (device?.commandQueue ?? Promise.resolve()).then(async () => {
			await device?.connectPromise?.catch(() => undefined);
			await device?.backend.disconnect().catch(() => {
				this.logger.warn('Apple TV disconnect during deactivation failed: unavailable');
			});
			this.devices.delete(normalized);
			this.connectionStates.delete(normalized);
			this.appCatalogs.delete(normalized);
			this.automaticAppRefreshes.delete(normalized);
			await this.projectionQueue;
			await this.projection.removeDevice(normalized);
			await this.projection.adapterConnection(this.anyDeviceOnline());
		});
		if (device !== undefined) {
			device.commandQueue = execution.catch(() => undefined);
		}
		await execution;
	}

	/**
	 * Forgets one local pairing and removes its complete public object tree.
	 *
	 * The Apple TV can still retain its controller record until the user removes
	 * it in tvOS settings; this operation deletes only adapter-owned data.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 */
	public async removePairedDevice(deviceId: string): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		if (this.credentialStore.get(normalized) === undefined) {
			throw new AppleTvBackendError('not_paired');
		}
		const device = this.devices.get(normalized);
		const execution = (device?.commandQueue ?? Promise.resolve()).then(async () => {
			const removed = await this.credentialStore.remove(normalized);
			if (!removed) {
				throw new AppleTvBackendError('not_paired');
			}
			let settingsFailure: Error | undefined;
			try {
				await this.deviceSettings.remove(normalized);
			} catch (error) {
				settingsFailure = error instanceof Error ? error : new Error('device_settings_write_failed');
			}
			await device?.connectPromise?.catch(() => undefined);
			await device?.backend.disconnect().catch(() => {
				this.logger.warn('Apple TV disconnect during local removal failed: unavailable');
			});
			this.devices.delete(normalized);
			this.connectionStates.delete(normalized);
			this.appCatalogs.delete(normalized);
			this.automaticAppRefreshes.delete(normalized);
			await this.projectionQueue;
			await this.projection.removeDevice(normalized);
			await this.projection.adapterConnection(this.anyDeviceOnline());
			if (settingsFailure !== undefined) {
				throw settingsFailure;
			}
		});
		if (device !== undefined) {
			device.commandQueue = execution.catch(() => undefined);
		}
		await execution;
	}

	/** Cancels an active pairing flow. */
	public cancelPairing(): PairingStatusResult {
		this.pairing.cancel();
		return this.pairing.status();
	}

	/** Returns only non-secret pairing lifecycle state. */
	public pairingStatus(): PairingStatusResult {
		return this.pairing.status();
	}

	/**
	 * Executes one capability-gated, per-device serialized remote command.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param command - Frozen public command name.
	 */
	public async executeRemote(deviceId: string, command: AppleTvRemoteCommand): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		const device = this.devices.get(normalized);
		if (device === undefined) {
			await this.projectCommandError(normalized, command, 'not_discovered');
			throw new AppleTvBackendError('not_discovered');
		}
		const execution = device.commandQueue.then(() => this.performRemote(device, normalized, command));
		device.commandQueue = execution.catch(() => undefined);
		return execution;
	}

	/**
	 * Executes one capability-gated HomePod transport command in target order.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param command - Supported transport operation.
	 */
	public async executeHomePodPlayback(deviceId: string, command: HomePodPlaybackCommand): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		const device = this.homePods.get(normalized);
		if (device === undefined) {
			if (this.managedDeviceStore.isEnabled('homepod', normalized)) {
				await this.projectHomePodCommandError(normalized, command, 'not_discovered');
			}
			throw new HomePodBackendError('not_discovered');
		}
		const execution = device.commandQueue.then(() =>
			this.performHomePodCommand(device, normalized, command, () => device.backend.executePlayback(command)),
		);
		device.commandQueue = execution.catch(() => undefined);
		return execution;
	}

	/**
	 * Applies one validated absolute HomePod volume level.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param percent - Desired volume from 0 through 100.
	 */
	public async setHomePodVolume(deviceId: string, percent: number): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
			throw new HomePodBackendError('unsupported');
		}
		const device = this.homePods.get(normalized);
		if (device === undefined) {
			if (this.managedDeviceStore.isEnabled('homepod', normalized)) {
				await this.projectHomePodCommandError(normalized, 'setVolume', 'not_discovered', 0);
			}
			throw new HomePodBackendError('not_discovered');
		}
		const execution = device.commandQueue.then(() =>
			this.performHomePodCommand(
				device,
				normalized,
				'setVolume',
				() => device.backend.setVolume(percent),
				percent,
			),
		);
		device.commandQueue = execution.catch(() => undefined);
		return execution;
	}

	/**
	 * Applies one explicit HomePod mute value.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param muted - Desired mute state.
	 */
	public async setHomePodMuted(deviceId: string, muted: boolean): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		const device = this.homePods.get(normalized);
		if (device === undefined) {
			if (this.managedDeviceStore.isEnabled('homepod', normalized)) {
				await this.projectHomePodCommandError(normalized, 'setMuted', 'not_discovered', false);
			}
			throw new HomePodBackendError('not_discovered');
		}
		const execution = device.commandQueue.then(() =>
			this.performHomePodCommand(device, normalized, 'setMuted', () => device.backend.setMuted(muted), muted),
		);
		device.commandQueue = execution.catch(() => undefined);
		return execution;
	}

	/**
	 * Refreshes the launchable-app catalog in the same per-device command queue.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 */
	public async refreshApps(deviceId: string): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		const device = this.devices.get(normalized);
		if (device === undefined) {
			await this.projectAppCommandError(normalized, 'refresh', 'not_discovered');
			throw new AppleTvBackendError('not_discovered');
		}
		this.automaticAppRefreshes.add(normalized);
		const execution = device.commandQueue.then(() => this.performAppRefresh(device, normalized));
		device.commandQueue = execution.catch(() => undefined);
		return execution;
	}

	/**
	 * Launches one validated app bundle ID in the per-device command queue.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param bundleId - Bundle identifier from the current catalog.
	 */
	public async launchApp(deviceId: string, bundleId: string): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		if (!isBundleId(bundleId)) {
			await this.projectAppCommandError(normalized, 'launch', 'unsupported');
			throw new AppleTvBackendError('unsupported');
		}
		const device = this.devices.get(normalized);
		if (device === undefined) {
			await this.projectAppCommandError(normalized, 'launch', 'not_discovered', undefined, bundleId);
			throw new AppleTvBackendError('not_discovered');
		}
		if (![...(this.appCatalogs.get(normalized)?.values() ?? [])].some(app => app.bundleId === bundleId)) {
			await this.projectAppCommandError(normalized, 'launch', 'unsupported', undefined, bundleId);
			throw new AppleTvBackendError('unsupported');
		}
		const execution = device.commandQueue.then(() => this.performAppLaunch(device, normalized, bundleId));
		device.commandQueue = execution.catch(() => undefined);
		return execution;
	}

	/**
	 * Launches one app selected through its stable per-app object key.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param entryKey - Readable per-app object key from the current catalog.
	 */
	public async launchAppEntry(deviceId: string, entryKey: string): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		const app = this.appCatalogs.get(normalized)?.get(entryKey);
		if (app === undefined) {
			await this.projectAppCommandError(normalized, 'launch', 'unsupported', entryKey, entryKey);
			throw new AppleTvBackendError('unsupported');
		}
		const device = this.devices.get(normalized);
		if (device === undefined) {
			await this.projectAppCommandError(normalized, 'launch', 'not_discovered', entryKey, app.bundleId);
			throw new AppleTvBackendError('not_discovered');
		}
		const execution = device.commandQueue.then(() =>
			this.performAppLaunch(device, normalized, app.bundleId, entryKey),
		);
		device.commandQueue = execution.catch(() => undefined);
		return execution;
	}

	/**
	 * Opens one validated URL in the per-device command queue.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param value - Universal link or application-specific URL.
	 */
	public async openUrl(deviceId: string, value: string): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		let url: string;
		try {
			url = normalizeOpenUrl(value);
		} catch {
			await this.projectAppCommandError(normalized, 'openurl', 'unsupported');
			throw new AppleTvBackendError('unsupported');
		}
		const device = this.devices.get(normalized);
		if (device === undefined) {
			await this.projectAppCommandError(normalized, 'openurl', 'not_discovered');
			throw new AppleTvBackendError('not_discovered');
		}
		const execution = device.commandQueue.then(() => this.performOpenUrl(device, normalized, url));
		device.commandQueue = execution.catch(() => undefined);
		return execution;
	}

	/**
	 * Executes and projects one HomePod operation within its per-target queue.
	 *
	 * @param device - Active transient runtime device.
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param command - Normalized command name.
	 * @param operation - Backend dispatch operation.
	 * @param requestedValue - Submitted writable scalar when the command owns one.
	 */
	private async performHomePodCommand(
		device: RuntimeHomePod,
		deviceId: string,
		command: HomePodCommand,
		operation: () => Promise<void>,
		requestedValue?: number | boolean,
	): Promise<void> {
		await this.projection.homePodCommandStarted(deviceId, command);
		this.logger.debug(`${homePodReference(deviceId)} command starting name=${command}`);
		try {
			if (!device.status.online) {
				throw new HomePodBackendError('not_connected');
			}
			await operation();
			await this.projection.homePodCommandResult(deviceId, command, 'success', '', requestedValue);
			this.logger.debug(`${homePodReference(deviceId)} command completed name=${command}`);
		} catch (error) {
			const code = runtimeErrorCode(error);
			const restoredValue =
				command === 'setVolume'
					? device.snapshot.volume
					: command === 'setMuted'
						? device.snapshot.muted
						: undefined;
			await this.projection.homePodCommandResult(deviceId, command, 'error', code, restoredValue);
			this.logger.debug(`${homePodReference(deviceId)} command failed name=${command} code=${code}`);
			throw new HomePodBackendError(code);
		}
	}

	/**
	 * Projects a HomePod write rejected before an active target queue exists.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param command - Rejected normalized command.
	 * @param code - Stable public error code.
	 * @param acknowledgedValue - Safe scalar used to clear an unacknowledged write.
	 */
	private async projectHomePodCommandError(
		deviceId: string,
		command: HomePodCommand,
		code: AppleErrorCode,
		acknowledgedValue?: number | boolean,
	): Promise<void> {
		await this.projection.homePodCommandStarted(deviceId, command);
		await this.projection.homePodCommandResult(deviceId, command, 'error', code, acknowledgedValue);
		this.logger.debug(`${homePodReference(deviceId)} command rejected name=${command} code=${code}`);
	}

	/**
	 * Executes and projects one command within its per-target queue.
	 *
	 * @param device - Target runtime record.
	 * @param deviceId - Stable normalized target ID.
	 * @param command - Frozen remote command.
	 */
	private async performRemote(device: RuntimeDevice, deviceId: string, command: AppleTvRemoteCommand): Promise<void> {
		await this.projection.commandStarted(deviceId, command);
		try {
			if (this.credentialStore.get(deviceId) === undefined) {
				throw new AppleTvBackendError('not_paired');
			}
			await device.backend.executeRemote(command);
			await this.projection.commandResult(deviceId, command, 'success');
		} catch (error) {
			const code = runtimeErrorCode(error);
			await this.projection.commandResult(deviceId, command, 'error', code);
			throw new AppleTvBackendError(code);
		}
	}

	/**
	 * Fetches, validates, and projects one app catalog refresh.
	 *
	 * @param device - Target runtime record.
	 * @param deviceId - Stable normalized device identifier.
	 */
	private async performAppRefresh(device: RuntimeDevice, deviceId: string): Promise<void> {
		await this.projection.appCommandStarted(deviceId, 'refresh');
		try {
			this.requirePairing(deviceId);
			const apps = await device.backend.listApps();
			await this.projection.apps(deviceId, apps);
			const entryKeys = appEntryKeys(apps);
			this.appCatalogs.set(
				deviceId,
				new Map(
					apps.map(app => {
						const entryKey = entryKeys.get(app.bundleId);
						if (entryKey === undefined) {
							throw new AppleTvBackendError('protocol_error');
						}
						return [entryKey, app];
					}),
				),
			);
			await this.projection.appCommandResult(deviceId, 'refresh', 'success');
		} catch (error) {
			const code = runtimeErrorCode(error);
			await this.projection.appCommandResult(deviceId, 'refresh', 'error', code);
			throw new AppleTvBackendError(code);
		}
	}

	/**
	 * Executes one validated app launch and projects its result.
	 *
	 * @param device - Target runtime record.
	 * @param deviceId - Stable normalized device identifier.
	 * @param bundleId - Validated bundle identifier.
	 * @param entryKey - Optional per-app control key to acknowledge.
	 */
	private async performAppLaunch(
		device: RuntimeDevice,
		deviceId: string,
		bundleId: string,
		entryKey?: string,
	): Promise<void> {
		await this.projection.appCommandStarted(deviceId, 'launch', bundleId);
		try {
			this.requirePairing(deviceId);
			await device.backend.launchApp(bundleId);
			await this.projection.appCommandResult(deviceId, 'launch', 'success', '', entryKey, bundleId);
		} catch (error) {
			const code = runtimeErrorCode(error);
			await this.projection.appCommandResult(deviceId, 'launch', 'error', code, entryKey, bundleId);
			throw new AppleTvBackendError(code);
		}
	}

	/**
	 * Executes one validated URL command without projecting the URL itself.
	 *
	 * @param device - Target runtime record.
	 * @param deviceId - Stable normalized device identifier.
	 * @param url - Validated URL kept only in memory for the command duration.
	 */
	private async performOpenUrl(device: RuntimeDevice, deviceId: string, url: string): Promise<void> {
		await this.projection.appCommandStarted(deviceId, 'openurl');
		try {
			this.requirePairing(deviceId);
			await device.backend.openUrl(url);
			await this.projection.appCommandResult(deviceId, 'openurl', 'success');
		} catch (error) {
			const code = runtimeErrorCode(error);
			await this.projection.appCommandResult(deviceId, 'openurl', 'error', code);
			throw new AppleTvBackendError(code);
		}
	}

	/**
	 * Rejects app operations that do not have persisted pairing credentials.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 */
	private requirePairing(deviceId: string): void {
		if (this.credentialStore.get(deviceId) === undefined) {
			throw new AppleTvBackendError('not_paired');
		}
	}

	/**
	 * Projects a rejected command whose target has no active queue.
	 *
	 * @param deviceId - Stable normalized target ID.
	 * @param command - Rejected remote command.
	 * @param code - Stable public error code.
	 */
	private async projectCommandError(
		deviceId: string,
		command: AppleTvRemoteCommand,
		code: AppleErrorCode,
	): Promise<void> {
		await this.projection.commandStarted(deviceId, command);
		await this.projection.commandResult(deviceId, command, 'error', code);
	}

	/**
	 * Projects an app command failure when no active device queue is available.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param action - Rejected app operation.
	 * @param code - Stable public error code.
	 * @param entryKey - Optional per-app control key to acknowledge.
	 * @param target - Optional non-secret command target.
	 */
	private async projectAppCommandError(
		deviceId: string,
		action: 'refresh' | 'launch' | 'openurl',
		code: AppleErrorCode,
		entryKey?: string,
		target = '',
	): Promise<void> {
		await this.projection.appCommandStarted(deviceId, action, target);
		await this.projection.appCommandResult(deviceId, action, 'error', code, entryKey, target);
	}

	/** Cancels work, disconnects devices, and flushes owned projections. */
	public async stop(): Promise<void> {
		this.stopping = true;
		if (this.timer !== undefined) {
			this.timers.clearInterval(this.timer);
			this.timer = undefined;
		}
		this.discovery.cancel();
		this.pairing.cancel();
		await this.scanPromise?.catch(() => undefined);
		await this.managementQueue.catch(() => undefined);
		this.logger.debug(
			`Runtime stop starting appleTv=${this.devices.size} homePod=${this.homePods.size} scanActive=${this.scanPromise !== undefined}`,
		);
		await Promise.allSettled([
			...[...this.devices.values()].map(device => device.backend.disconnect()),
			...[...this.homePods.values()].map(device => device.backend.disconnect()),
		]);
		await this.projectionQueue;
		await this.projection.discoveryRunning(false);
		await this.projection.adapterConnection(false);
		this.logger.debug('Runtime stop completed');
	}

	/**
	 * Serializes Admin management actions with discovery reconciliation.
	 *
	 * @param operation
	 */
	private serializeManagement<T>(operation: () => Promise<T>): Promise<T> {
		const execution = this.managementQueue.then(operation);
		this.managementQueue = execution.then(
			() => undefined,
			() => undefined,
		);
		return execution;
	}

	/**
	 * Returns the current strong-identity targets for one explicitly managed class.
	 *
	 * @param deviceClass
	 */
	private currentManagedTargets(
		deviceClass: ManagedDiscoveryDeviceClass,
	): ReadonlyMap<string, DiscoveredHomePod | DiscoveredAirPlayReceiver> {
		return deviceClass === 'homepod' ? this.currentHomePods : this.currentAirPlayReceivers;
	}

	/**
	 * Returns all active adopted IDs, including devices that are currently offline.
	 *
	 * @param deviceClass
	 */
	private activeManagedDeviceIds(deviceClass: ManagedDiscoveryDeviceClass): string[] {
		return this.managedDeviceStore
			.list(deviceClass)
			.filter(device => device.enabled)
			.map(device => device.deviceId);
	}

	/**
	 * Applies the complete active inventory of one managed discovery class.
	 *
	 * @param deviceClass
	 * @param seenAt
	 */
	private async reconcileManagedClass(deviceClass: ManagedDiscoveryDeviceClass, seenAt: number): Promise<void> {
		const activeIds = new Set(this.activeManagedDeviceIds(deviceClass));
		const currentTargets = [...this.currentManagedTargets(deviceClass).values()].filter(target =>
			activeIds.has(target.deviceId),
		);
		if (deviceClass === 'airplayReceiver') {
			await this.projection.retainManagedAirPlayReceivers([...activeIds]);
			await this.projection.airPlayReceivers(currentTargets, seenAt);
			return;
		}

		const homePods = currentTargets as DiscoveredHomePod[];
		await this.disconnectAbsentHomePods(new Set(homePods.map(target => target.deviceId)));
		await this.projectionQueue;
		await this.projection.retainManagedHomePods([...activeIds]);
		await this.projection.homePods(homePods, seenAt);
		for (const target of homePods) {
			const firstDiscovery = !this.homePods.has(target.deviceId);
			const device = this.getOrCreateHomePod(target);
			if (firstDiscovery) {
				await this.projection.initializeHomePod(target.deviceId);
			}
			if (!device.status.online) {
				void this.connectHomePod(device);
			}
		}
	}

	/**
	 * Disconnects one managed HomePod and waits for its final queued projections.
	 *
	 * @param deviceId
	 */
	private async disconnectHomePod(deviceId: string): Promise<void> {
		const device = this.homePods.get(deviceId);
		if (device === undefined) {
			return;
		}
		await device.commandQueue.catch(() => undefined);
		await device.connectPromise?.catch(() => undefined);
		await device.backend.disconnect().catch(() => {
			this.logger.warn(`${homePodReference(deviceId)} disconnect during management failed: unavailable`);
		});
		this.homePods.delete(deviceId);
		this.homePodConnectionStates.delete(deviceId);
		await this.projectionQueue;
	}

	/**
	 * Removes one managed class projection after deactivation or local forget.
	 *
	 * @param deviceClass
	 * @param deviceId
	 */
	private async removeManagedProjection(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): Promise<void> {
		if (deviceClass === 'homepod') {
			await this.projection.removeHomePod(deviceId);
			return;
		}
		await this.projection.removeAirPlayReceiver(deviceId);
	}

	/** Performs one isolated scan and reconciles its supported targets. */
	private async runDiscovery(): Promise<void> {
		if (this.stopping) {
			return;
		}
		await this.projection.discoveryRunning(true);
		this.logger.debug('Discovery scan starting in isolated worker');
		let error = '';
		try {
			const discovery = await this.discovery.discover();
			if (this.stopping) {
				return;
			}
			const discovered = discovery.devices;
			const seenAt = Date.now();
			this.currentDeviceCounts = discovery.deviceCounts;
			this.currentDeviceDetails = discovery.deviceDetails;
			this.currentDiscovery = new Map(discovered.map(target => [target.deviceId, target]));
			this.currentHomePods = new Map(discovery.homePods.map(target => [target.deviceId, target]));
			this.currentAirPlayReceivers = new Map(discovery.airplayReceivers.map(target => [target.deviceId, target]));
			await this.serializeManagement(async () => {
				for (const target of discovery.homePods) {
					await this.managedDeviceStore.observe('homepod', target);
				}
				for (const target of discovery.airplayReceivers) {
					await this.managedDeviceStore.observe('airplayReceiver', target);
				}
				await this.reconcileManagedClass('homepod', seenAt);
				await this.reconcileManagedClass('airplayReceiver', seenAt);
			});
			for (const target of discovered) {
				const credentials = this.credentialStore.get(target.deviceId);
				if (credentials === undefined || !this.deviceSettings.isEnabled(target.deviceId)) {
					continue;
				}
				const firstDiscovery = !this.devices.has(target.deviceId);
				const device = this.getOrCreateDevice(target);
				await this.projection.discovered(target, true, false);
				if (firstDiscovery) {
					await this.projection.initializeDevice(target.deviceId, 'discovered');
				}
				if (!device.status.online) {
					void this.connectDevice(device);
				}
			}
			this.logger.info(
				`Discovery completed: Apple TV=${discovery.deviceCounts.appletv}, HomePod=${discovery.deviceCounts.homepod}, AirPlay Receiver=${discovery.deviceCounts.airplayReceiver}`,
			);
			this.logger.debug(
				`Discovery controllable targets appleTv=${discovered.length} homePod=${discovery.homePods.length} airPlayReceiver=${discovery.airplayReceivers.length}`,
			);
			for (const target of discovery.homePods) {
				this.logger.debug(
					`${homePodReference(target.deviceId)} discovered model=${safeHomePodModel(target.model)} services=airplay${target.raop ? ',raop' : ''}`,
				);
			}
		} catch (cause) {
			if (!(this.stopping && cause instanceof AppleDiscoveryError && cause.code === 'cancelled')) {
				error = runtimeErrorCode(cause);
				this.logger.warn(`Discovery failed: ${error}`);
			}
		} finally {
			if (!this.stopping) {
				await this.projection.aggregate(this.currentDeviceCounts, this.anyDeviceOnline(), error);
				await this.projection.discoveryRunning(false);
			}
		}
	}

	/**
	 * Creates or refreshes one device backend.
	 *
	 * @param target - Latest correlated target.
	 */
	private getOrCreateDevice(target: DiscoveredAppleTv): RuntimeDevice {
		const existing = this.devices.get(target.deviceId);
		if (existing !== undefined) {
			existing.target = target;
			existing.backend.updateTarget(target);
			return existing;
		}
		const backend = this.backendFactory(target, {
			onSnapshot: snapshot => {
				const current = this.devices.get(target.deviceId);
				if (current === undefined) {
					return;
				}
				current.appsCapable = snapshot.capabilities.apps;
				this.enqueueProjection(() => this.projection.snapshot(target.deviceId, snapshot));
				this.tryAutomaticAppRefresh(target.deviceId);
			},
			onConnection: status => {
				const current = this.devices.get(target.deviceId);
				if (current === undefined) {
					return;
				}
				const wasCompanionConnected = current.status.companion;
				current.status = status;
				if (wasCompanionConnected && !status.companion) {
					this.automaticAppRefreshes.delete(target.deviceId);
				}
				this.connectionStates.set(target.deviceId, status);
				this.enqueueProjection(async () => {
					await this.projection.connection(target.deviceId, status);
					await this.projection.adapterConnection(this.anyDeviceOnline());
				});
				this.tryAutomaticAppRefresh(target.deviceId);
			},
		});
		const device: RuntimeDevice = {
			target,
			status: {
				state: 'discovered',
				online: false,
				airplay: false,
				companion: false,
			},
			backend,
			commandQueue: Promise.resolve(),
			appsCapable: false,
		};
		this.devices.set(target.deviceId, device);
		this.connectionStates.set(target.deviceId, device.status);
		return device;
	}

	/**
	 * Creates or refreshes one transient HomePod backend.
	 *
	 * @param target - Latest strongly identified HomePod target.
	 */
	private getOrCreateHomePod(target: DiscoveredHomePod): RuntimeHomePod {
		const existing = this.homePods.get(target.deviceId);
		if (existing !== undefined) {
			existing.target = target;
			existing.backend.updateTarget(target);
			return existing;
		}
		const backend = this.homePodBackendFactory(target, {
			onSnapshot: snapshot => {
				const current = this.homePods.get(target.deviceId);
				if (current === undefined) {
					return;
				}
				current.snapshot = snapshot;
				this.enqueueProjection(() => this.projection.homePodSnapshot(target.deviceId, snapshot));
			},
			onConnection: status => {
				const current = this.homePods.get(target.deviceId);
				if (current === undefined) {
					return;
				}
				const previous = current.status;
				current.status = status;
				this.homePodConnectionStates.set(target.deviceId, status);
				this.logger.debug(
					`${homePodReference(target.deviceId)} connection ${previous.state}/${previous.pairing} -> ${status.state}/${status.pairing} online=${status.online} error=${status.error ?? 'none'}`,
				);
				this.enqueueProjection(async () => {
					await this.projection.homePodConnection(target.deviceId, status);
					await this.projection.adapterConnection(this.anyDeviceOnline());
				});
			},
		});
		const device: RuntimeHomePod = {
			target,
			backend,
			status: { state: 'discovered', online: false, pairing: 'idle' },
			commandQueue: Promise.resolve(),
			snapshot: emptyHomePodSnapshot(),
		};
		this.homePods.set(target.deviceId, device);
		this.homePodConnectionStates.set(target.deviceId, device.status);
		return device;
	}

	/**
	 * Starts at most one transient HomePod connection attempt.
	 *
	 * @param device - Current HomePod runtime record.
	 */
	private connectHomePod(device: RuntimeHomePod): Promise<void> {
		if (device.connectPromise !== undefined) {
			this.logger.debug(`${homePodReference(device.target.deviceId)} connect joined active attempt`);
			return device.connectPromise;
		}
		this.logger.debug(`${homePodReference(device.target.deviceId)} connect queued`);
		const operation = device.backend
			.connect()
			.catch(error => {
				this.logger.warn(
					`${homePodReference(device.target.deviceId)} connection failed: ${runtimeErrorCode(error)}`,
				);
			})
			.finally(() => {
				if (device.connectPromise === operation) {
					device.connectPromise = undefined;
				}
			});
		device.connectPromise = operation;
		return operation;
	}

	/**
	 * Disconnects transient sessions absent from one successful complete scan.
	 *
	 * @param currentDeviceIds - Complete HomePod IDs from that scan.
	 */
	private async disconnectAbsentHomePods(currentDeviceIds: ReadonlySet<string>): Promise<void> {
		for (const [deviceId, device] of this.homePods) {
			if (currentDeviceIds.has(deviceId)) {
				continue;
			}
			this.logger.debug(
				`${homePodReference(deviceId)} absent from successful scan; disconnecting transient session`,
			);
			await device.commandQueue.catch(() => undefined);
			await device.connectPromise?.catch(() => undefined);
			await device.backend.disconnect().catch(() => {
				this.logger.warn(`${homePodReference(deviceId)} disconnect after absence failed: unavailable`);
			});
			this.homePods.delete(deviceId);
			this.homePodConnectionStates.delete(deviceId);
		}
	}

	/** Returns aggregate health across Apple TV and HomePod sessions. */
	private anyDeviceOnline(): boolean {
		return (
			[...this.connectionStates.values()].some(status => status.online) ||
			[...this.homePodConnectionStates.values()].some(status => status.online)
		);
	}

	/**
	 * Starts at most one connection attempt per device.
	 *
	 * @param device - Runtime device record.
	 */
	private connectDevice(device: RuntimeDevice): Promise<void> {
		if (device.connectPromise !== undefined) {
			return device.connectPromise;
		}
		const credentials = this.credentialStore.get(device.target.deviceId);
		if (credentials === undefined) {
			return Promise.reject(new AppleTvBackendError('not_paired'));
		}
		const operation = device.backend
			.connect(credentials)
			.catch(error => {
				this.logger.warn(`Apple TV connection failed: ${runtimeErrorCode(error)}`);
			})
			.finally(() => {
				if (device.connectPromise === operation) {
					device.connectPromise = undefined;
				}
			});
		device.connectPromise = operation;
		return operation;
	}

	/**
	 * Queues one best-effort catalog load after Companion app capability appears.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 */
	private tryAutomaticAppRefresh(deviceId: string): void {
		const device = this.devices.get(deviceId);
		if (
			device === undefined ||
			!device.appsCapable ||
			!device.status.companion ||
			this.credentialStore.get(deviceId) === undefined ||
			this.automaticAppRefreshes.has(deviceId)
		) {
			return;
		}
		this.automaticAppRefreshes.add(deviceId);
		const execution = device.commandQueue.then(() => this.performAppRefresh(device, deviceId));
		device.commandQueue = execution.catch(() => undefined);
		void execution.catch(error => {
			this.logger.warn(`Automatic app catalog refresh failed: ${runtimeErrorCode(error)}`);
		});
	}

	/**
	 * Serializes async projections emitted by synchronous SDK events.
	 *
	 * @param operation - Async state update emitted by an SDK callback.
	 */
	private enqueueProjection(operation: () => Promise<void>): void {
		if (this.stopping) {
			return;
		}
		this.projectionQueue = this.projectionQueue.then(operation).catch(() => {
			this.logger.warn('State projection failed: unavailable');
		});
	}
}

/**
 * Parses one adapter-relative writable Apple TV control state ID.
 *
 * @param id - Adapter-relative or namespaced state ID.
 * @returns Stable target and command, or undefined for unrelated states.
 */
export function parseAppleTvCommandStateId(
	id: string,
): { deviceId: string; command: AppleTvRemoteCommand } | undefined {
	const match = /(?:^|\.)devices\.appletv\.([0-9a-f]{12})\.(remote|playback|power)\.([A-Za-z]+)$/.exec(id);
	if (match === null) {
		return undefined;
	}
	const command = match[3] as AppleTvRemoteCommand;
	const allowed =
		match[2] === 'remote' ? NAVIGATION_COMMANDS : match[2] === 'playback' ? PLAYBACK_COMMANDS : POWER_COMMANDS;
	if (!(allowed as readonly AppleTvRemoteCommand[]).includes(command)) {
		return undefined;
	}
	return { deviceId: match[1].toUpperCase(), command };
}

/**
 * Accepts only one true, unacknowledged write to a frozen remote state.
 *
 * @param id - Adapter-relative or namespaced state ID.
 * @param state - Minimal untrusted ioBroker write envelope.
 */
export function parseAppleTvCommandWrite(
	id: string,
	state: Pick<ioBroker.State, 'ack' | 'val'> | null | undefined,
): { deviceId: string; command: AppleTvRemoteCommand } | undefined {
	if (state === null || state === undefined || state.ack || state.val !== true) {
		return undefined;
	}
	return parseAppleTvCommandStateId(id);
}

/** Normalized writable HomePod state accepted from ioBroker. */
export type HomePodWrite =
	| { deviceId: string; action: 'playback'; command: HomePodPlaybackCommand }
	| { deviceId: string; action: 'volume'; percent: number }
	| { deviceId: string; action: 'muted'; muted: boolean };

/**
 * Accepts only bounded, unacknowledged writes to the HomePod contract.
 *
 * @param id - Adapter-relative or namespaced state ID.
 * @param state - Minimal untrusted ioBroker write envelope.
 */
export function parseHomePodWrite(
	id: string,
	state: Pick<ioBroker.State, 'ack' | 'val'> | null | undefined,
): HomePodWrite | undefined {
	if (state === null || state === undefined || state.ack) {
		return undefined;
	}
	const playback = /(?:^|\.)devices\.homepod\.([0-9a-f]{12})\.playback\.([A-Za-z]+)$/.exec(id);
	if (playback !== null) {
		const command = playback[2] as HomePodPlaybackCommand;
		return state.val === true && HOME_POD_PLAYBACK_COMMANDS.includes(command)
			? { deviceId: playback[1].toUpperCase(), action: 'playback', command }
			: undefined;
	}
	const volume = /(?:^|\.)devices\.homepod\.([0-9a-f]{12})\.volume\.(level|muted)$/.exec(id);
	if (volume === null) {
		return undefined;
	}
	const deviceId = volume[1].toUpperCase();
	if (volume[2] === 'level') {
		return typeof state.val === 'number' && Number.isFinite(state.val) && state.val >= 0 && state.val <= 100
			? { deviceId, action: 'volume', percent: state.val }
			: undefined;
	}
	return typeof state.val === 'boolean' ? { deviceId, action: 'muted', muted: state.val } : undefined;
}

/** Public normalized app write accepted from ioBroker state changes. */
export type AppleTvAppWrite =
	| { deviceId: string; action: 'refresh' }
	| { deviceId: string; action: 'launchEntry'; entryKey: string }
	| { deviceId: string; action: 'openurl'; url: string };

/**
 * Accepts only unacknowledged writes to capability-created app controls.
 *
 * @param id - Adapter-relative or namespaced app control state ID.
 * @param state - Minimal untrusted ioBroker write envelope.
 */
export function parseAppWrite(
	id: string,
	state: Pick<ioBroker.State, 'ack' | 'val'> | null | undefined,
): AppleTvAppWrite | undefined {
	if (state === null || state === undefined || state.ack) {
		return undefined;
	}
	const entryMatch = /(?:^|\.)devices\.appletv\.([0-9a-f]{12})\.apps\.entries\.([^.]+)\.launch$/u.exec(id);
	if (entryMatch !== null && isAppEntryKey(entryMatch[2])) {
		return state.val === true
			? { deviceId: entryMatch[1].toUpperCase(), action: 'launchEntry', entryKey: entryMatch[2] }
			: undefined;
	}
	const openUrlMatch = /(?:^|\.)devices\.appletv\.([0-9a-f]{12})\.apps\.openurl$/.exec(id);
	if (openUrlMatch !== null) {
		return typeof state.val === 'string' && state.val.trim().length > 0
			? { deviceId: openUrlMatch[1].toUpperCase(), action: 'openurl', url: state.val }
			: undefined;
	}
	const match = /(?:^|\.)devices\.appletv\.([0-9a-f]{12})\.apps\.refresh$/.exec(id);
	if (match === null) {
		return undefined;
	}
	const deviceId = match[1].toUpperCase();
	return state.val === true ? { deviceId, action: 'refresh' } : undefined;
}

/**
 * Converts external IDs to the canonical registry key.
 *
 * @param deviceId - External device identifier.
 */
function normalizeDeviceId(deviceId: string): string {
	const normalized = deviceId.replaceAll(':', '').replaceAll('-', '').toUpperCase();
	if (!/^[0-9A-F]{12}$/.test(normalized)) {
		throw new AppleTvBackendError('not_discovered');
	}
	return normalized;
}

/**
 * Maps all internal failures to the frozen public vocabulary.
 *
 * @param error - Unknown internal failure.
 */
function runtimeErrorCode(error: unknown): AppleErrorCode {
	if (error instanceof AppleTvBackendError || error instanceof HomePodBackendError) {
		return error.code;
	}
	if (error instanceof AppleDiscoveryError) {
		if (error.code === 'timeout') {
			return 'timeout';
		}
		if (error.code === 'busy') {
			return 'busy';
		}
		return 'unavailable';
	}
	return 'protocol_error';
}

/**
 * Returns a privacy-preserving device reference for diagnostics.
 *
 * @param deviceId - Stable normalized device identifier.
 */
function homePodReference(deviceId: string): string {
	return `HomePod/…${deviceId.slice(-4)}`;
}

/**
 * Emits only the recognized public hardware-model grammar.
 *
 * @param model - Untrusted discovered model value.
 */
function safeHomePodModel(model: string): string {
	return /^AudioAccessory\d+,\d+$/i.test(model) ? model : 'unknown';
}

/** Default-active in-memory settings boundary used by isolated runtime tests. */
class DefaultDeviceSettings implements DeviceSettingsPort {
	private readonly disabled = new Set<string>();

	public initialize(): Promise<void> {
		return Promise.resolve();
	}

	public isEnabled(deviceId: string): boolean {
		return !this.disabled.has(normalizeDeviceId(deviceId));
	}

	public setEnabled(deviceId: string, enabled: boolean): Promise<void> {
		const normalized = normalizeDeviceId(deviceId);
		if (enabled) {
			this.disabled.delete(normalized);
		} else {
			this.disabled.add(normalized);
		}
		return Promise.resolve();
	}

	public remove(deviceId: string): Promise<void> {
		this.disabled.delete(normalizeDeviceId(deviceId));
		return Promise.resolve();
	}
}

/** Empty in-memory adoption boundary used when no persistent store is supplied. */
class DefaultManagedDeviceStore implements ManagedDeviceStorePort {
	private readonly devices = new Map<string, ManagedDiscoveryDeviceRecord>();

	public initialize(): Promise<void> {
		return Promise.resolve();
	}

	public list(deviceClass: ManagedDiscoveryDeviceClass): ManagedDiscoveryDeviceRecord[] {
		return [...this.devices.values()]
			.filter(device => device.deviceClass === deviceClass)
			.map(device => ({ ...device }));
	}

	public has(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): boolean {
		return this.devices.has(`${deviceClass}:${normalizeDeviceId(deviceId)}`);
	}

	public isEnabled(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): boolean {
		return this.devices.get(`${deviceClass}:${normalizeDeviceId(deviceId)}`)?.enabled ?? false;
	}

	public manage(
		deviceClass: ManagedDiscoveryDeviceClass,
		device: Pick<ManagedDiscoveryDeviceRecord, 'deviceId' | 'name' | 'model'>,
	): Promise<void> {
		const deviceId = normalizeDeviceId(device.deviceId);
		this.devices.set(`${deviceClass}:${deviceId}`, { ...device, deviceClass, deviceId, enabled: true });
		return Promise.resolve();
	}

	public observe(
		deviceClass: ManagedDiscoveryDeviceClass,
		device: Pick<ManagedDiscoveryDeviceRecord, 'deviceId' | 'name' | 'model'>,
	): Promise<void> {
		const key = `${deviceClass}:${normalizeDeviceId(device.deviceId)}`;
		const current = this.devices.get(key);
		if (current !== undefined) {
			this.devices.set(key, { ...current, name: device.name, model: device.model });
		}
		return Promise.resolve();
	}

	public setEnabled(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string, enabled: boolean): Promise<void> {
		const key = `${deviceClass}:${normalizeDeviceId(deviceId)}`;
		const current = this.devices.get(key);
		if (current === undefined) {
			return Promise.reject(new DeviceManagementError('managed_device_not_found'));
		}
		this.devices.set(key, { ...current, enabled });
		return Promise.resolve();
	}

	public remove(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): Promise<boolean> {
		return Promise.resolve(this.devices.delete(`${deviceClass}:${normalizeDeviceId(deviceId)}`));
	}
}
