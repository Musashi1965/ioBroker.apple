import type { AppleTV } from '@basmilius/apple-sdk' with { 'resolution-mode': 'import' };

import {
	emptyAppleTvSnapshot,
	type AppleTvApp,
	type AppleErrorCode,
	type AppleTvConnectionStatus,
	type AppleTvPowerCommand,
	type AppleTvRemoteCommand,
	type AppleTvSnapshot,
} from '../../domain/appleTv';
import type { PairingCredentials } from '../../security/pairingCredentialStore';
import type { DiscoveredAppleTv } from './discoveryTypes';
import { toSdkDiscoveryResult } from './sdkConversion';

/** Adapter-facing normalized backend callbacks. */
export interface AppleTvBackendCallbacks {
	/** Receives protocol-independent scalar state. */
	onSnapshot(snapshot: AppleTvSnapshot): void;
	/** Receives independent protocol health. */
	onConnection(status: AppleTvConnectionStatus): void;
}

/** Stable backend error without raw protocol details. */
export class AppleTvBackendError extends Error {
	/**
	 * Creates one normalized backend error.
	 *
	 * @param code - Stable public error code.
	 */
	public constructor(public readonly code: AppleErrorCode) {
		super(code);
		this.name = 'AppleTvBackendError';
	}
}

/** Narrow facade around one SDK Apple TV instance. */
export class AppleTvBackend {
	private device: AppleTV | undefined;
	private hasCompanion = false;
	private stopping = false;
	private snapshot = emptyAppleTvSnapshot();

	/**
	 * Creates one target facade.
	 *
	 * @param target - Current correlated target.
	 * @param callbacks - Normalized adapter callbacks.
	 */
	public constructor(
		private target: DiscoveredAppleTv,
		private readonly callbacks: AppleTvBackendCallbacks,
	) {}

	/**
	 * Updates non-durable service endpoints after every discovery.
	 *
	 * @param target - Newly correlated target with the same stable ID.
	 */
	public updateTarget(target: DiscoveredAppleTv): void {
		if (target.deviceId !== this.target.deviceId) {
			throw new AppleTvBackendError('not_discovered');
		}
		this.target = target;
		if (this.device !== undefined) {
			this.device.discoveryResult = toSdkDiscoveryResult(target.airplay);
			if (this.device.companionLink !== undefined && target.companionLink !== undefined) {
				this.device.companionLink.discoveryResult = toSdkDiscoveryResult(target.companionLink);
			}
		}
	}

	/**
	 * Connects both available protocols using persisted credentials.
	 *
	 * @param credentials - Validated long-term credentials.
	 */
	public async connect(credentials: PairingCredentials): Promise<void> {
		if (this.device?.airplay.isConnected) {
			this.publishConnection();
			return;
		}
		this.stopping = false;
		this.callbacks.onConnection({
			state: 'connecting',
			online: false,
			airplay: false,
			companion: false,
		});

		try {
			if (this.device === undefined || this.hasCompanion !== (this.target.companionLink !== undefined)) {
				await this.disposeDevice();
				await this.createDevice();
			}
			await this.device?.connect(credentials);
			if (!this.device?.airplay.isConnected) {
				throw new AppleTvBackendError('protocol_error');
			}
			this.snapshot.powerState = (await this.device.power?.getState().catch(() => 'unknown')) ?? 'unknown';
			this.publishSnapshot();
			this.publishConnection();
		} catch (error) {
			await this.disposeDevice();
			const normalized = normalizeBackendError(error);
			this.callbacks.onConnection({
				state: 'unavailable',
				online: false,
				airplay: false,
				companion: false,
				error: normalized.code,
			});
			throw normalized;
		}
	}

	/**
	 * Serializes one capability-checked remote command.
	 *
	 * @param command - Normalized public command.
	 */
	public async executeRemote(command: AppleTvRemoteCommand): Promise<void> {
		const device = this.device;
		if (device === undefined || !device.airplay.isConnected) {
			throw new AppleTvBackendError('not_connected');
		}
		try {
			if (command === 'powerOn' || command === 'powerOff') {
				if (!this.snapshot.capabilities.power || device.power === undefined) {
					throw new AppleTvBackendError('unsupported');
				}
				await executePowerCommand(device.power, command);
				return;
			}
			if (!this.snapshot.capabilities.remote) {
				throw new AppleTvBackendError('unsupported');
			}
			await device.remote[command]();
		} catch (error) {
			throw normalizeBackendError(error);
		}
	}

	/** Returns the current launchable-app catalog through Companion Link. */
	public async listApps(): Promise<AppleTvApp[]> {
		const apps = this.connectedApps();
		try {
			return normalizeLaunchableApps(await apps.list());
		} catch (error) {
			throw normalizeBackendError(error);
		}
	}

	/**
	 * Launches one app by its validated bundle identifier through Companion Link.
	 *
	 * @param bundleId - Validated application bundle identifier.
	 */
	public async launchApp(bundleId: string): Promise<void> {
		const apps = this.connectedApps();
		try {
			await apps.launch(bundleId);
		} catch (error) {
			throw normalizeBackendError(error);
		}
	}

	/**
	 * Opens one validated URL through Companion Link without retaining it.
	 *
	 * @param url - Validated universal link or application-specific URL.
	 */
	public async openUrl(url: string): Promise<void> {
		const apps = this.connectedApps();
		try {
			await apps.openUrl(url);
		} catch (error) {
			throw normalizeBackendError(error);
		}
	}

	/** Disconnects protocols and removes every external event listener. */
	public async disconnect(): Promise<void> {
		this.stopping = true;
		await this.disposeDevice();
		this.callbacks.onConnection({
			state: 'unavailable',
			online: false,
			airplay: false,
			companion: false,
		});
	}

	/** Creates and subscribes one fresh SDK device. */
	private async createDevice(): Promise<void> {
		const sdk = await import('@basmilius/apple-sdk');
		const device = new sdk.AppleTV({
			airplay: toSdkDiscoveryResult(this.target.airplay),
			companionLink:
				this.target.companionLink === undefined ? undefined : toSdkDiscoveryResult(this.target.companionLink),
		});
		this.hasCompanion = this.target.companionLink !== undefined;
		this.device = device;

		device.on('disconnected', (unexpected: boolean) => {
			if (!this.stopping) {
				this.callbacks.onConnection({
					state: unexpected ? 'recovering' : 'unavailable',
					online: false,
					airplay: false,
					companion: device.companionLink?.isConnected ?? false,
					error: unexpected ? 'protocol_error' : undefined,
				});
			}
		});
		device.on('power', (state: string) => {
			this.snapshot.powerState = state;
			this.publishSnapshot();
		});
		device.state.on('nowPlayingChanged', () => this.publishSnapshot());
		device.state.on('playbackStateChanged', () => this.publishSnapshot());
		device.state.on('volumeChanged', () => this.publishSnapshot());
		device.state.on('volumeMutedChanged', () => this.publishSnapshot());
		device.state.on('activeAppChanged', () => this.publishSnapshot());
		device.state.on('supportedCommandsChanged', () => this.publishSnapshot());
	}

	/** Captures current SDK getters as normalized scalars. */
	private publishSnapshot(): void {
		const device = this.device;
		if (device === undefined) {
			return;
		}
		const capabilities = device.capabilities;
		const state = device.state;
		const remoteAvailable = capabilities.supportsUnifiedMediaControl || capabilities.supportsHangdogRemoteControl;
		this.snapshot = {
			powerState: this.snapshot.powerState,
			title: state.title || '',
			artist: state.artist || '',
			album: state.album || '',
			app: state.activeApp?.displayName ?? '',
			appBundleId: state.activeApp?.bundleIdentifier ?? '',
			duration: finiteNonNegative(state.duration),
			position: finiteNonNegative(state.elapsedTime),
			isPlaying: state.isPlaying,
			volumeAvailable: state.volumeAvailable,
			volume: normalizeVolume(state.volume),
			muted: state.isMuted,
			capabilities: {
				remote: remoteAvailable,
				playback: remoteAvailable,
				power: device.power !== undefined,
				nowPlaying: device.airplay.isConnected,
				volume: state.volumeAvailable,
				apps: device.apps !== undefined && (device.companionLink?.isConnected ?? false),
			},
		};
		this.callbacks.onSnapshot({ ...this.snapshot, capabilities: { ...this.snapshot.capabilities } });
	}

	/** Returns the currently usable Companion Link app controller. */
	private connectedApps(): NonNullable<AppleTV['apps']> {
		const device = this.device;
		if (device === undefined || !device.airplay.isConnected || !(device.companionLink?.isConnected ?? false)) {
			throw new AppleTvBackendError('not_connected');
		}
		if (device.apps === undefined) {
			throw new AppleTvBackendError('unsupported');
		}
		return device.apps;
	}

	/** Publishes independent AirPlay and Companion health. */
	private publishConnection(): void {
		const airplay = this.device?.airplay.isConnected ?? false;
		const companion = this.device?.companionLink?.isConnected ?? false;
		this.callbacks.onConnection({
			state:
				airplay && (this.target.companionLink === undefined || companion)
					? 'online'
					: airplay
						? 'degraded'
						: 'unavailable',
			online: airplay,
			airplay,
			companion,
		});
	}

	/** Disconnects and releases one SDK instance. */
	private async disposeDevice(): Promise<void> {
		const device = this.device;
		this.device = undefined;
		if (device === undefined) {
			return;
		}
		device.removeAllListeners();
		device.state.removeAllListeners();
		device.disconnect();
		await device.companionLink?.disconnectSafely();
		this.snapshot = emptyAppleTvSnapshot();
	}
}

/** Narrow project-owned power-controller boundary used for dispatch tests. */
export interface AppleTvPowerControllerPort {
	/** Sends the SDK wake command. */
	on(): Promise<void>;
	/** Sends the SDK suspend command. */
	off(): Promise<void>;
}

/**
 * Maps one public explicit power command to the SDK controller operation.
 *
 * @param controller - Connected power controller.
 * @param command - Validated public power command.
 */
export async function executePowerCommand(
	controller: AppleTvPowerControllerPort,
	command: AppleTvPowerCommand,
): Promise<void> {
	if (command === 'powerOn') {
		await controller.on();
		return;
	}
	await controller.off();
}

/**
 * Validates, de-duplicates, bounds, and deterministically sorts an upstream app catalog.
 *
 * @param values - Untrusted SDK app records.
 */
export function normalizeLaunchableApps(values: readonly unknown[]): AppleTvApp[] {
	if (values.length > 500) {
		throw new AppleTvBackendError('protocol_error');
	}
	const apps = new Map<string, AppleTvApp>();
	for (const value of values) {
		if (typeof value !== 'object' || value === null) {
			throw new AppleTvBackendError('protocol_error');
		}
		const bundleId = (value as Record<string, unknown>).bundleId;
		const name = (value as Record<string, unknown>).name;
		if (
			typeof bundleId !== 'string' ||
			!isBundleId(bundleId) ||
			typeof name !== 'string' ||
			name.trim().length === 0 ||
			name.length > 256
		) {
			throw new AppleTvBackendError('protocol_error');
		}
		apps.set(bundleId, { bundleId, name: name.trim() });
	}
	return [...apps.values()].sort(
		(left, right) => left.name.localeCompare(right.name) || left.bundleId.localeCompare(right.bundleId),
	);
}

/**
 * Accepts the conservative bundle-ID grammar supported by Apple launch requests.
 *
 * @param value - Candidate bundle identifier.
 */
export function isBundleId(value: string): boolean {
	return value.length <= 255 && /[.-]/.test(value) && /^[A-Za-z0-9.-]+$/.test(value);
}

/**
 * Validates and normalizes one URL command without dereferencing or retaining it.
 *
 * HTTP(S) universal links and application-specific schemes are accepted. Local
 * file, executable-data, and credential-bearing URLs are rejected.
 *
 * @param value - Untrusted state value.
 */
export function normalizeOpenUrl(value: string): string {
	const candidate = value.trim();
	if (candidate.length === 0 || candidate.length > 2048) {
		throw new AppleTvBackendError('unsupported');
	}
	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		throw new AppleTvBackendError('unsupported');
	}
	if (
		!/[A-Za-z]/.test(parsed.protocol[0] ?? '') ||
		parsed.username !== '' ||
		parsed.password !== '' ||
		['about:', 'blob:', 'data:', 'file:', 'javascript:'].includes(parsed.protocol.toLowerCase())
	) {
		throw new AppleTvBackendError('unsupported');
	}
	return candidate;
}

/**
 * Maps an unknown upstream failure to the stable public vocabulary.
 *
 * @param error - Unknown upstream failure.
 */
export function normalizeBackendError(error: unknown): AppleTvBackendError {
	if (error instanceof AppleTvBackendError) {
		return error;
	}
	if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
		return new AppleTvBackendError('timeout');
	}
	return new AppleTvBackendError('protocol_error');
}

/**
 * Clamps unknown SDK timing values to a safe non-negative scalar.
 *
 * @param value - Unknown SDK timing scalar.
 */
function finiteNonNegative(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Converts SDK volume into the public 0..100 percentage range.
 *
 * @param value - Unknown SDK volume scalar.
 */
function normalizeVolume(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	const percent = Math.abs(value) <= 1 ? value * 100 : value;
	return Math.min(100, Math.max(0, percent));
}
