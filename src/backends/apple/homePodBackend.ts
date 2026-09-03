import type { DiscoveryResult } from '@basmilius/apple-sdk' with { 'resolution-mode': 'import' };

import type { AppleErrorCode } from '../../domain/appleTv';
import {
	emptyHomePodSnapshot,
	type HomePodConnectionStatus,
	type HomePodPlaybackCommand,
	type HomePodSnapshot,
} from '../../domain/homePod';
import type { DiscoveredHomePod } from './discoveryTypes';
import { toSdkDiscoveryResult } from './sdkConversion';
import type { TimerScheduler } from '../../platform/timerScheduler';

/** HomePod backend diagnostics that deliberately exclude raw protocol values. */
export interface HomePodBackendLogger {
	/** Writes one privacy-preserving debug record. */
	debug(message: string): void;
}

/** Adapter-facing normalized HomePod callbacks. */
export interface HomePodBackendCallbacks {
	/** Receives normalized push-driven media state. */
	onSnapshot(snapshot: HomePodSnapshot): void;
	/** Receives normalized connection and transient-pairing state. */
	onConnection(status: HomePodConnectionStatus): void;
}

/** Stable HomePod backend failure without raw upstream details. */
export class HomePodBackendError extends Error {
	/** @param code - Stable public error code. */
	public constructor(public readonly code: AppleErrorCode) {
		super(code);
		this.name = 'HomePodBackendError';
	}
}

interface HomePodStatePort {
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly duration: number;
	readonly elapsedTime: number;
	readonly isPlaying: boolean;
	readonly volumeAvailable: boolean;
	readonly volume: number;
	readonly isMuted: boolean;
	on(event: string, listener: (...args: unknown[]) => void): unknown;
	removeAllListeners(): unknown;
}

interface HomePodDevicePort {
	discoveryResult: DiscoveryResult;
	readonly isConnected: boolean;
	readonly capabilities: {
		supportsHangdogRemoteControl: boolean;
		supportsUnifiedMediaControl: boolean;
		supportsTransientPairing: boolean;
	};
	readonly playback: Record<HomePodPlaybackCommand, () => Promise<void>>;
	readonly volume: {
		set(volume: number): Promise<void>;
		mute(): Promise<void>;
		unmute(): Promise<void>;
	};
	readonly state: HomePodStatePort;
	connect(): Promise<void>;
	disconnect(): void;
	on(event: 'disconnected', listener: (unexpected: boolean) => void): unknown;
	removeAllListeners(): unknown;
}

/** Testable factory for the dynamically imported ESM HomePod class. */
export type HomePodDeviceFactory = (target: DiscoveredHomePod) => Promise<HomePodDevicePort>;

/** Narrow transient AirPlay facade around one HomePod. */
export class HomePodBackend {
	private device: HomePodDevicePort | undefined;
	private stopping = false;
	private snapshot = emptyHomePodSnapshot();

	/**
	 * Creates one HomePod transient backend.
	 *
	 * @param target - Current strongly identified discovery target.
	 * @param callbacks - Normalized runtime callbacks.
	 * @param logger - Privacy-preserving debug boundary.
	 * @param timers - Adapter-owned scheduling boundary.
	 * @param deviceFactory - Dynamically imported SDK construction boundary.
	 * @param connectTimeoutMs - Hard deadline for one transient connection attempt.
	 */
	public constructor(
		private target: DiscoveredHomePod,
		private readonly callbacks: HomePodBackendCallbacks,
		private readonly logger: HomePodBackendLogger,
		private readonly timers: TimerScheduler,
		private readonly deviceFactory: HomePodDeviceFactory = createSdkHomePod,
		private readonly connectTimeoutMs = 20_000,
	) {}

	/**
	 * Refreshes the non-durable AirPlay endpoint after discovery.
	 *
	 * @param target - Latest target with the same durable device ID.
	 */
	public updateTarget(target: DiscoveredHomePod): void {
		if (target.deviceId !== this.target.deviceId) {
			throw new HomePodBackendError('not_discovered');
		}
		this.target = target;
		if (this.device !== undefined) {
			this.device.discoveryResult = toSdkDiscoveryResult(target.airplay);
		}
		this.logger.debug(
			`${reference(target.deviceId)} target refreshed services=airplay${target.raop ? ',raop' : ''}`,
		);
	}

	/** Connects using automatic transient pairing; no credentials are accepted or retained. */
	public async connect(): Promise<void> {
		if (this.device?.isConnected) {
			this.publishConnection();
			return;
		}
		this.stopping = false;
		this.logger.debug(
			`${reference(this.target.deviceId)} transient connect starting model=${safeModel(this.target.model)}`,
		);
		this.callbacks.onConnection({ state: 'connecting', online: false, pairing: 'pairing' });
		try {
			this.disposeDevice();
			this.device = await this.deviceFactory(this.target);
			this.subscribe(this.device);
			this.logger.debug(
				`${reference(this.target.deviceId)} advertised capabilities transient=${this.device.capabilities.supportsTransientPairing} unifiedMedia=${this.device.capabilities.supportsUnifiedMediaControl} hangdog=${this.device.capabilities.supportsHangdogRemoteControl}`,
			);
			await withTimeout(this.device.connect(), this.connectTimeoutMs, this.timers);
			if (!this.device.isConnected) {
				throw new HomePodBackendError('protocol_error');
			}
			this.publishSnapshot('connected');
			this.publishConnection();
			this.logger.debug(`${reference(this.target.deviceId)} transient connect completed`);
		} catch (error) {
			const normalized = normalizeHomePodError(error);
			this.logger.debug(
				`${reference(this.target.deviceId)} transient connect failed code=${normalized.code} kind=${diagnosticErrorKind(error)}`,
			);
			this.disposeDevice();
			this.callbacks.onConnection({
				state: 'unavailable',
				online: false,
				pairing: 'error',
				error: normalized.code,
			});
			throw normalized;
		}
	}

	/**
	 * Executes one transport command after current protocol capability checks.
	 *
	 * @param command - Normalized playback command.
	 */
	public async executePlayback(command: HomePodPlaybackCommand): Promise<void> {
		const device = this.connectedDevice();
		if (!this.snapshot.capabilities.playback) {
			throw new HomePodBackendError('unsupported');
		}
		this.logger.debug(`${reference(this.target.deviceId)} playback dispatch command=${command}`);
		try {
			await device.playback[command]();
		} catch (error) {
			throw normalizeHomePodError(error);
		}
	}

	/**
	 * Sets absolute volume after normalization by the runtime.
	 *
	 * @param percent - Finite public volume from 0 through 100.
	 */
	public async setVolume(percent: number): Promise<void> {
		const device = this.connectedDevice();
		if (!this.snapshot.capabilities.volume || !Number.isFinite(percent) || percent < 0 || percent > 100) {
			throw new HomePodBackendError('unsupported');
		}
		this.logger.debug(`${reference(this.target.deviceId)} volume dispatch percent=${Math.round(percent)}`);
		try {
			await device.volume.set(percent / 100);
		} catch (error) {
			throw normalizeHomePodError(error);
		}
	}

	/**
	 * Applies an explicit mute state rather than a non-idempotent toggle.
	 *
	 * @param muted - Desired confirmed mute state.
	 */
	public async setMuted(muted: boolean): Promise<void> {
		const device = this.connectedDevice();
		if (!this.snapshot.capabilities.volume) {
			throw new HomePodBackendError('unsupported');
		}
		this.logger.debug(`${reference(this.target.deviceId)} mute dispatch muted=${muted}`);
		try {
			await (muted ? device.volume.mute() : device.volume.unmute());
		} catch (error) {
			throw normalizeHomePodError(error);
		}
	}

	/** Removes listeners and terminates the transient AirPlay session. */
	public disconnect(): Promise<void> {
		this.stopping = true;
		this.logger.debug(`${reference(this.target.deviceId)} disconnect starting`);
		this.disposeDevice();
		this.callbacks.onSnapshot(emptyHomePodSnapshot());
		this.callbacks.onConnection({ state: 'unavailable', online: false, pairing: 'idle' });
		this.logger.debug(`${reference(this.target.deviceId)} disconnect completed`);
		return Promise.resolve();
	}

	private connectedDevice(): HomePodDevicePort {
		if (this.device === undefined || !this.device.isConnected) {
			throw new HomePodBackendError('not_connected');
		}
		return this.device;
	}

	private subscribe(device: HomePodDevicePort): void {
		device.on('disconnected', (unexpected: boolean) => {
			if (this.stopping) {
				return;
			}
			this.logger.debug(`${reference(this.target.deviceId)} disconnected unexpected=${unexpected}`);
			this.snapshot = emptyHomePodSnapshot();
			this.callbacks.onSnapshot(this.snapshot);
			this.callbacks.onConnection({
				state: unexpected ? 'recovering' : 'unavailable',
				online: false,
				pairing: unexpected ? 'error' : 'idle',
				error: unexpected ? 'protocol_error' : undefined,
			});
		});
		for (const event of [
			'nowPlayingChanged',
			'playbackStateChanged',
			'volumeChanged',
			'volumeMutedChanged',
			'supportedCommandsChanged',
		] as const) {
			device.state.on(event, () => this.publishSnapshot(event));
		}
	}

	private publishSnapshot(reason: string): void {
		const device = this.device;
		if (device === undefined) {
			return;
		}
		const state = device.state;
		const playback =
			device.capabilities.supportsUnifiedMediaControl || device.capabilities.supportsHangdogRemoteControl;
		this.snapshot = {
			title: state.title || '',
			artist: state.artist || '',
			album: state.album || '',
			duration: finiteNonNegative(state.duration),
			position: finiteNonNegative(state.elapsedTime),
			isPlaying: state.isPlaying,
			volumeAvailable: state.volumeAvailable,
			volume: normalizeVolume(state.volume),
			muted: state.isMuted,
			capabilities: {
				playback,
				nowPlaying: device.isConnected,
				volume: state.volumeAvailable,
			},
		};
		this.logger.debug(
			`${reference(this.target.deviceId)} state event=${reason} playing=${this.snapshot.isPlaying} metadata=${Boolean(this.snapshot.title || this.snapshot.artist || this.snapshot.album)} durationKnown=${this.snapshot.duration > 0} positionKnown=${this.snapshot.position > 0} volumeAvailable=${this.snapshot.volumeAvailable} muted=${this.snapshot.muted} capabilities=playback:${playback},nowPlaying:${device.isConnected},volume:${state.volumeAvailable}`,
		);
		this.callbacks.onSnapshot({ ...this.snapshot, capabilities: { ...this.snapshot.capabilities } });
	}

	private publishConnection(): void {
		const online = this.device?.isConnected ?? false;
		this.callbacks.onConnection({
			state: online ? 'online' : 'unavailable',
			online,
			pairing: online ? 'paired' : 'idle',
		});
	}

	private disposeDevice(): void {
		const device = this.device;
		this.device = undefined;
		if (device === undefined) {
			return;
		}
		device.removeAllListeners();
		device.state.removeAllListeners();
		device.disconnect();
		this.snapshot = emptyHomePodSnapshot();
	}
}

async function createSdkHomePod(target: DiscoveredHomePod): Promise<HomePodDevicePort> {
	const sdk = await import('@basmilius/apple-sdk');
	return new sdk.HomePod({ airplay: toSdkDiscoveryResult(target.airplay) });
}

/**
 * Maps unknown SDK failures into the stable adapter error vocabulary.
 *
 * @param error - Unknown upstream failure.
 */
export function normalizeHomePodError(error: unknown): HomePodBackendError {
	if (error instanceof HomePodBackendError) {
		return error;
	}
	if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
		return new HomePodBackendError('timeout');
	}
	return new HomePodBackendError('protocol_error');
}

/**
 * Returns only a sanitized error class, never a raw upstream message or stack.
 *
 * @param error - Unknown upstream failure.
 */
export function diagnosticErrorKind(error: unknown): string {
	if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)) {
		return 'Error';
	}
	return error.name;
}

function finiteNonNegative(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeVolume(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	const percent = Math.abs(value) <= 1 ? value * 100 : value;
	return Math.min(100, Math.max(0, percent));
}

function reference(deviceId: string): string {
	return `HomePod/…${deviceId.slice(-4)}`;
}

function safeModel(model: string): string {
	return /^AudioAccessory\d+,\d+$/i.test(model) ? model : 'unknown';
}

/**
 * Bounds a non-cancellable SDK operation and clears its owned timer.
 *
 * @param operation - In-flight SDK operation.
 * @param timeoutMs - Hard deadline in milliseconds.
 * @param timers - Adapter-owned scheduling boundary.
 */
function withTimeout<T>(operation: Promise<T>, timeoutMs: number, timers: TimerScheduler): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const timer = timers.setTimeout(() => {
			if (!settled) {
				settled = true;
				reject(new HomePodConnectTimeoutError());
			}
		}, timeoutMs);
		operation.then(
			value => {
				if (!settled) {
					settled = true;
					timers.clearTimeout(timer);
					resolve(value);
				}
			},
			error => {
				if (!settled) {
					settled = true;
					timers.clearTimeout(timer);
					reject(error instanceof Error ? error : new HomePodConnectionError());
				}
			},
		);
	});
}

/** Internal deadline marker normalized before leaving the backend. */
class HomePodConnectTimeoutError extends Error {
	public override readonly name = 'HomePodConnectTimeoutError';
}

/** Internal non-Error rejection marker normalized before leaving the backend. */
class HomePodConnectionError extends Error {
	public override readonly name = 'HomePodConnectionError';
}
