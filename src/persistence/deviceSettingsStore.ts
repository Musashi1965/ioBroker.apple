import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface DeviceSettingsDatabase {
	version: 1;
	disabledAppleTvDeviceIds: string[];
}

/** Stable non-secret device-settings persistence failure. */
export class DeviceSettingsStoreError extends Error {
	/**
	 * Creates one redacted store error.
	 *
	 * @param code - Stable non-secret error code.
	 */
	public constructor(public readonly code: 'invalid_device_settings' | 'device_settings_write_failed') {
		super(code);
		this.name = 'DeviceSettingsStoreError';
	}
}

/** Atomic instance-scoped persistence for durable non-secret device enablement. */
export class DeviceSettingsStore {
	private disabledAppleTvDeviceIds = new Set<string>();

	/**
	 * Creates one device-settings store.
	 *
	 * @param filePath - Absolute instance-scoped database path.
	 */
	public constructor(private readonly filePath: string) {}

	/** Loads and validates the complete settings database. */
	public async initialize(): Promise<void> {
		let file: string;
		try {
			file = await readFile(this.filePath, 'utf8');
		} catch (error) {
			if (isNodeError(error) && error.code === 'ENOENT') {
				this.disabledAppleTvDeviceIds = new Set();
				return;
			}
			throw new DeviceSettingsStoreError('invalid_device_settings');
		}

		let database: unknown;
		try {
			database = JSON.parse(file);
		} catch {
			throw new DeviceSettingsStoreError('invalid_device_settings');
		}
		if (!isDeviceSettingsDatabase(database)) {
			throw new DeviceSettingsStoreError('invalid_device_settings');
		}
		this.disabledAppleTvDeviceIds = new Set(database.disabledAppleTvDeviceIds);
	}

	/**
	 * Returns whether one paired Apple TV participates in runtime projection.
	 *
	 * @param deviceId - Stable normalized Apple TV identifier.
	 */
	public isEnabled(deviceId: string): boolean {
		return !this.disabledAppleTvDeviceIds.has(normalizedDeviceId(deviceId));
	}

	/**
	 * Atomically changes one Apple TV enablement flag.
	 *
	 * @param deviceId - Stable normalized Apple TV identifier.
	 * @param enabled - Whether runtime projection is allowed.
	 */
	public async setEnabled(deviceId: string, enabled: boolean): Promise<void> {
		const normalized = normalizedDeviceId(deviceId);
		const next = new Set(this.disabledAppleTvDeviceIds);
		if (enabled) {
			next.delete(normalized);
		} else {
			next.add(normalized);
		}
		await this.persist(next);
		this.disabledAppleTvDeviceIds = next;
	}

	/**
	 * Removes stale enablement metadata when a pairing is forgotten.
	 *
	 * @param deviceId - Stable normalized Apple TV identifier.
	 */
	public async remove(deviceId: string): Promise<void> {
		const next = new Set(this.disabledAppleTvDeviceIds);
		if (!next.delete(normalizedDeviceId(deviceId))) {
			return;
		}
		await this.persist(next);
		this.disabledAppleTvDeviceIds = next;
	}

	/** Returns current file permission bits for diagnostics and tests. */
	public async fileMode(): Promise<number> {
		return (await stat(this.filePath)).mode & 0o777;
	}

	/**
	 * Persists one validated complete snapshot as an atomic replacement.
	 *
	 * @param disabledAppleTvDeviceIds - Complete set of explicitly disabled identifiers.
	 */
	private async persist(disabledAppleTvDeviceIds: ReadonlySet<string>): Promise<void> {
		const database: DeviceSettingsDatabase = {
			version: 1,
			disabledAppleTvDeviceIds: [...disabledAppleTvDeviceIds].sort(),
		};
		const directory = dirname(this.filePath);
		const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
		try {
			await mkdir(directory, { recursive: true, mode: 0o700 });
			await chmod(directory, 0o700);
			await writeFile(temporaryPath, `${JSON.stringify(database)}\n`, {
				encoding: 'utf8',
				flag: 'wx',
				mode: 0o600,
			});
			await chmod(temporaryPath, 0o600);
			await rename(temporaryPath, this.filePath);
			await chmod(this.filePath, 0o600);
		} catch {
			await unlink(temporaryPath).catch(() => undefined);
			throw new DeviceSettingsStoreError('device_settings_write_failed');
		}
	}
}

/**
 * Validates the complete non-secret settings database.
 *
 * @param value - Parsed untrusted JSON value.
 */
function isDeviceSettingsDatabase(value: unknown): value is DeviceSettingsDatabase {
	return (
		isRecord(value) &&
		value.version === 1 &&
		Array.isArray(value.disabledAppleTvDeviceIds) &&
		value.disabledAppleTvDeviceIds.every(deviceId => typeof deviceId === 'string' && isDeviceId(deviceId)) &&
		new Set(value.disabledAppleTvDeviceIds).size === value.disabledAppleTvDeviceIds.length
	);
}

/**
 * Normalizes and validates one Apple TV device identifier.
 *
 * @param value - External Apple TV identifier.
 */
function normalizedDeviceId(value: string): string {
	const normalized = value.replaceAll(':', '').replaceAll('-', '').toUpperCase();
	if (!isDeviceId(normalized)) {
		throw new DeviceSettingsStoreError('invalid_device_settings');
	}
	return normalized;
}

/**
 * Checks one normalized 12-character device identifier.
 *
 * @param value - Candidate normalized identifier.
 */
function isDeviceId(value: string): boolean {
	return /^[0-9A-F]{12}$/.test(value);
}

/**
 * Checks an untrusted object boundary.
 *
 * @param value - Unknown possible object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrows Node filesystem errors.
 *
 * @param value - Unknown caught filesystem error.
 */
function isNodeError(value: unknown): value is NodeJS.ErrnoException {
	return value instanceof Error && 'code' in value;
}
