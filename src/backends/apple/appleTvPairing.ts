import type { AppleErrorCode } from '../../domain/appleTv';
import type { PairingCredentials } from '../../security/pairingCredentialStore';
import type { DiscoveredAppleTv } from './discoveryTypes';
import { toSdkDiscoveryResult } from './sdkConversion';
import type { TimerHandle, TimerScheduler } from '../../platform/timerScheduler';

/** Non-secret pairing lifecycle exposed to Admin. */
export type PairingStatus = 'idle' | 'starting' | 'pinRequired' | 'completing' | 'paired' | 'error';

/** Non-secret Admin pairing status response. */
export interface PairingStatusResult {
	/** Current non-secret flow state. */
	status: PairingStatus;
	/** Stable device identifier while a pairing session is active. */
	deviceId?: string;
	/** Optional stable error code. */
	error?: AppleErrorCode;
}

interface PairingSessionPort {
	start(): Promise<void>;
	pin(pin: string): Promise<void>;
	end(): Promise<PairingCredentials>;
	abort(): void;
}

/** Creates one upstream pairing session behind a testable boundary. */
export type PairingSessionFactory = (target: DiscoveredAppleTv) => Promise<PairingSessionPort>;

/** One bounded, secret-redacted Apple TV pairing coordinator. */
export class AppleTvPairing {
	private session: PairingSessionPort | undefined;
	private deviceId: string | undefined;
	private expiry: TimerHandle = undefined;
	private expiresAt: number | undefined;
	private currentStatus: PairingStatusResult = { status: 'idle' };

	/**
	 * Creates one bounded pairing coordinator.
	 *
	 * @param timers - Adapter-owned scheduling boundary.
	 * @param timeoutMs - Total pairing session deadline.
	 * @param sessionFactory - Upstream session factory.
	 */
	public constructor(
		private readonly timers: TimerScheduler,
		private readonly timeoutMs = 120_000,
		private readonly sessionFactory: PairingSessionFactory = createSdkPairingSession,
	) {}

	/**
	 * Starts pairing and triggers the on-screen PIN.
	 *
	 * @param target - Currently discovered Apple TV.
	 */
	public async start(target: DiscoveredAppleTv): Promise<void> {
		this.cancel();
		this.currentStatus = { status: 'starting' };
		this.expiresAt = Date.now() + this.timeoutMs;
		try {
			const session = await this.sessionFactory(target);
			this.session = session;
			this.deviceId = target.deviceId;
			await this.withDeadline(session.start());
			this.currentStatus = { status: 'pinRequired' };
			this.armExpiry();
		} catch {
			const timedOut = this.currentStatus.error === 'timeout';
			this.abortActive();
			if (!timedOut) {
				this.currentStatus = { status: 'error', error: 'protocol_error' };
			}
			throw new Error('pairing_start_failed');
		}
	}

	/**
	 * Completes pairing with one PIN that is never retained.
	 *
	 * @param deviceId - Target ID selected when pairing started.
	 * @param pin - Four digits shown on the Apple TV.
	 * @returns Long-term credentials.
	 */
	public async finish(deviceId: string, pin: string): Promise<PairingCredentials> {
		if (this.session === undefined || this.deviceId !== deviceId || this.currentStatus.status !== 'pinRequired') {
			throw new Error('pairing_not_active');
		}
		if (!/^\d{4}$/.test(pin)) {
			throw new Error('pairing_pin_invalid');
		}
		const session = this.session;
		this.currentStatus = { status: 'completing' };
		this.clearExpiry();
		try {
			const credentials = await this.withDeadline(session.pin(pin).then(() => session.end()));
			this.session = undefined;
			this.deviceId = undefined;
			this.expiresAt = undefined;
			this.currentStatus = { status: 'paired' };
			return credentials;
		} catch {
			const timedOut = this.currentStatus.error === 'timeout';
			this.abortActive();
			if (!timedOut) {
				this.currentStatus = { status: 'error', error: 'protocol_error' };
			}
			throw new Error('pairing_finish_failed');
		}
	}

	/** Cancels and forgets any active pairing session. */
	public cancel(): void {
		this.abortActive();
		this.currentStatus = { status: 'idle' };
	}

	/** Returns a defensive non-secret status snapshot. */
	public status(): PairingStatusResult {
		return { ...this.currentStatus, ...(this.deviceId === undefined ? {} : { deviceId: this.deviceId }) };
	}

	/** Aborts the SDK session and clears the timeout. */
	private abortActive(): void {
		this.clearExpiry();
		this.session?.abort();
		this.session = undefined;
		this.deviceId = undefined;
		this.expiresAt = undefined;
	}

	/** Arms the remaining idle portion of the single pairing deadline. */
	private armExpiry(): void {
		const remaining = Math.max(1, (this.expiresAt ?? Date.now()) - Date.now());
		this.expiry = this.timers.setTimeout(() => this.expireActive(), remaining);
	}

	/** Expires and forgets the active secret-bearing session. */
	private expireActive(): void {
		this.clearExpiry();
		this.session?.abort();
		this.session = undefined;
		this.deviceId = undefined;
		this.expiresAt = undefined;
		this.currentStatus = { status: 'error', error: 'timeout' };
	}

	/**
	 * Bounds one SDK operation by the remaining pairing-session deadline.
	 *
	 * @param operation - In-flight SDK operation.
	 */
	private withDeadline<T>(operation: Promise<T>): Promise<T> {
		const remaining = Math.max(1, (this.expiresAt ?? Date.now()) - Date.now());
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			this.expiry = this.timers.setTimeout(() => {
				if (!settled) {
					settled = true;
					this.expireActive();
					reject(new Error('pairing_timeout'));
				}
			}, remaining);
			operation.then(
				value => {
					if (!settled) {
						settled = true;
						this.clearExpiry();
						resolve(value);
					}
				},
				error => {
					if (!settled) {
						settled = true;
						this.clearExpiry();
						reject(error instanceof Error ? error : new Error('pairing_operation_failed'));
					}
				},
			);
		});
	}

	/** Clears the bounded session timeout. */
	private clearExpiry(): void {
		if (this.expiry !== undefined) {
			this.timers.clearTimeout(this.expiry);
			this.expiry = undefined;
		}
	}
}

/**
 * Creates the production SDK pairing session through a confined dynamic import.
 *
 * @param target - Currently discovered target.
 */
async function createSdkPairingSession(target: DiscoveredAppleTv): Promise<PairingSessionPort> {
	const sdk = await import('@basmilius/apple-sdk');
	return new sdk.PairingSession(toSdkDiscoveryResult(target.airplay));
}
