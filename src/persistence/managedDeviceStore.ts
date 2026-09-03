import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Device classes that require explicit local adoption before projection. */
export type ManagedDiscoveryDeviceClass = 'homepod' | 'airplayReceiver';

/** Durable non-secret fallback metadata for one locally managed device. */
export interface ManagedDiscoveryDeviceRecord {
	deviceClass: ManagedDiscoveryDeviceClass;
	deviceId: string;
	name: string;
	model: string;
	enabled: boolean;
}

interface ManagedDeviceDatabase {
	version: 1;
	devices: ManagedDiscoveryDeviceRecord[];
}

/** Stable non-secret managed-device persistence failure. */
export class ManagedDeviceStoreError extends Error {
	public constructor(
		public readonly code: 'invalid_managed_devices' | 'managed_device_not_found' | 'managed_devices_write_failed',
	) {
		super(code);
		this.name = 'ManagedDeviceStoreError';
	}
}

/** Atomic instance-scoped inventory for adopted HomePods and AirPlay receivers. */
export class ManagedDeviceStore {
	private devices = new Map<string, ManagedDiscoveryDeviceRecord>();

	public constructor(private readonly filePath: string) {}

	/** Loads and validates the complete local inventory. */
	public async initialize(): Promise<void> {
		let file: string;
		try {
			file = await readFile(this.filePath, 'utf8');
		} catch (error) {
			if (isNodeError(error) && error.code === 'ENOENT') {
				this.devices = new Map();
				return;
			}
			throw new ManagedDeviceStoreError('invalid_managed_devices');
		}

		let database: unknown;
		try {
			database = JSON.parse(file);
		} catch {
			throw new ManagedDeviceStoreError('invalid_managed_devices');
		}
		if (!isManagedDeviceDatabase(database)) {
			throw new ManagedDeviceStoreError('invalid_managed_devices');
		}
		this.devices = new Map(
			database.devices.map(device => [deviceKey(device.deviceClass, device.deviceId), device]),
		);
	}

	/**
	 * Returns immutable copies of all locally managed devices in one class.
	 *
	 * @param deviceClass
	 */
	public list(deviceClass: ManagedDiscoveryDeviceClass): ManagedDiscoveryDeviceRecord[] {
		return [...this.devices.values()]
			.filter(device => device.deviceClass === deviceClass)
			.map(device => ({ ...device }))
			.sort((left, right) => left.name.localeCompare(right.name) || left.deviceId.localeCompare(right.deviceId));
	}

	/**
	 * Returns whether one stable device ID has been explicitly adopted.
	 *
	 * @param deviceClass
	 * @param deviceId
	 */
	public has(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): boolean {
		return this.devices.has(deviceKey(deviceClass, normalizeDeviceId(deviceId)));
	}

	/**
	 * Returns whether one adopted device may receive a public object tree.
	 *
	 * @param deviceClass
	 * @param deviceId
	 */
	public isEnabled(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): boolean {
		return this.devices.get(deviceKey(deviceClass, normalizeDeviceId(deviceId)))?.enabled ?? false;
	}

	/**
	 * Adopts one current discovery target as active and stores fallback metadata.
	 *
	 * @param deviceClass
	 * @param device
	 */
	public async manage(
		deviceClass: ManagedDiscoveryDeviceClass,
		device: Pick<ManagedDiscoveryDeviceRecord, 'deviceId' | 'name' | 'model'>,
	): Promise<void> {
		const record = normalizedRecord({ ...device, deviceClass, enabled: true });
		const next = new Map(this.devices);
		next.set(deviceKey(deviceClass, record.deviceId), record);
		await this.persist(next);
		this.devices = next;
	}

	/**
	 * Updates fallback display metadata only for an already managed device.
	 *
	 * @param deviceClass
	 * @param device
	 */
	public async observe(
		deviceClass: ManagedDiscoveryDeviceClass,
		device: Pick<ManagedDiscoveryDeviceRecord, 'deviceId' | 'name' | 'model'>,
	): Promise<void> {
		const key = deviceKey(deviceClass, normalizeDeviceId(device.deviceId));
		const current = this.devices.get(key);
		if (current === undefined) {
			return;
		}
		const record = normalizedRecord({ ...current, name: device.name, model: device.model });
		if (current.name === record.name && current.model === record.model) {
			return;
		}
		const next = new Map(this.devices);
		next.set(key, record);
		await this.persist(next);
		this.devices = next;
	}

	/**
	 * Changes one adopted device's active/passive state.
	 *
	 * @param deviceClass
	 * @param deviceId
	 * @param enabled
	 */
	public async setEnabled(
		deviceClass: ManagedDiscoveryDeviceClass,
		deviceId: string,
		enabled: boolean,
	): Promise<void> {
		const key = deviceKey(deviceClass, normalizeDeviceId(deviceId));
		const current = this.devices.get(key);
		if (current === undefined) {
			throw new ManagedDeviceStoreError('managed_device_not_found');
		}
		if (current.enabled === enabled) {
			return;
		}
		const next = new Map(this.devices);
		next.set(key, { ...current, enabled });
		await this.persist(next);
		this.devices = next;
	}

	/**
	 * Forgets one local management record without suppressing future discovery.
	 *
	 * @param deviceClass
	 * @param deviceId
	 */
	public async remove(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): Promise<boolean> {
		const next = new Map(this.devices);
		if (!next.delete(deviceKey(deviceClass, normalizeDeviceId(deviceId)))) {
			return false;
		}
		await this.persist(next);
		this.devices = next;
		return true;
	}

	/** Returns current file permission bits for diagnostics and tests. */
	public async fileMode(): Promise<number> {
		return (await stat(this.filePath)).mode & 0o777;
	}

	private async persist(devices: ReadonlyMap<string, ManagedDiscoveryDeviceRecord>): Promise<void> {
		const database: ManagedDeviceDatabase = {
			version: 1,
			devices: [...devices.values()].map(device => ({ ...device })).sort(compareRecords),
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
			throw new ManagedDeviceStoreError('managed_devices_write_failed');
		}
	}
}

function normalizedRecord(record: ManagedDiscoveryDeviceRecord): ManagedDiscoveryDeviceRecord {
	const normalized = {
		...record,
		deviceId: normalizeDeviceId(record.deviceId),
		name: record.name.trim(),
		model: record.model.trim(),
	};
	if (!isManagedDeviceRecord(normalized)) {
		throw new ManagedDeviceStoreError('invalid_managed_devices');
	}
	return normalized;
}

function isManagedDeviceDatabase(value: unknown): value is ManagedDeviceDatabase {
	if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.devices)) {
		return false;
	}
	if (!value.devices.every(isManagedDeviceRecord)) {
		return false;
	}
	const keys = value.devices.map(device => deviceKey(device.deviceClass, device.deviceId));
	return new Set(keys).size === keys.length;
}

function isManagedDeviceRecord(value: unknown): value is ManagedDiscoveryDeviceRecord {
	return (
		isRecord(value) &&
		(value.deviceClass === 'homepod' || value.deviceClass === 'airplayReceiver') &&
		typeof value.deviceId === 'string' &&
		/^[0-9A-F]{12}$/.test(value.deviceId) &&
		typeof value.name === 'string' &&
		value.name.trim().length > 0 &&
		value.name.length <= 256 &&
		typeof value.model === 'string' &&
		value.model.length <= 128 &&
		typeof value.enabled === 'boolean'
	);
}

function normalizeDeviceId(value: string): string {
	const normalized = value.replaceAll(':', '').replaceAll('-', '').toUpperCase();
	if (!/^[0-9A-F]{12}$/.test(normalized)) {
		throw new ManagedDeviceStoreError('invalid_managed_devices');
	}
	return normalized;
}

function deviceKey(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): string {
	return `${deviceClass}:${deviceId}`;
}

function compareRecords(left: ManagedDiscoveryDeviceRecord, right: ManagedDiscoveryDeviceRecord): number {
	return left.deviceClass.localeCompare(right.deviceClass) || left.deviceId.localeCompare(right.deviceId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
	return value instanceof Error && 'code' in value;
}
