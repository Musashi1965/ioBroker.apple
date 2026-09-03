import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Long-term binary credentials returned by Apple pair-setup. */
export interface PairingCredentials {
	/** Accessory identifier assigned by the Apple TV. */
	accessoryIdentifier: string;
	/** Long-term public key of the Apple TV. */
	accessoryLongTermPublicKey: Buffer;
	/** Controller pairing identifier. */
	pairingId: Buffer;
	/** Controller public key. */
	publicKey: Buffer;
	/** Controller private key. */
	secretKey: Buffer;
}

/** ioBroker installation-secret encryption boundary. */
export interface CredentialCipher {
	/** Encrypts one complete plaintext database. */
	encrypt(value: string): string;
	/** Decrypts one complete database ciphertext. */
	decrypt(value: string): string;
}

interface SerializedCredentials {
	accessoryIdentifier: string;
	accessoryLongTermPublicKey: string;
	pairingId: string;
	publicKey: string;
	secretKey: string;
}

interface CredentialDatabase {
	version: 1;
	devices: Record<string, SerializedCredentials>;
}

interface EncryptedEnvelope {
	version: 1;
	ciphertext: string;
}

/** Stable credential-store failure without secret-bearing raw errors. */
export class CredentialStoreError extends Error {
	/**
	 * Creates a redacted stable credential-store error.
	 *
	 * @param code - Stable non-secret error code.
	 */
	public constructor(public readonly code: 'invalid_store' | 'decrypt_failed' | 'write_failed') {
		super(code);
		this.name = 'CredentialStoreError';
	}
}

/** Encrypted, atomic persistence for Apple TV pairing credentials. */
export class PairingCredentialStore {
	/** Current validated in-memory snapshot. */
	private credentials = new Map<string, PairingCredentials>();

	/**
	 * Creates one instance-scoped encrypted store.
	 *
	 * @param filePath - Absolute encrypted database path.
	 * @param cipher - ioBroker installation-secret cipher.
	 */
	public constructor(
		private readonly filePath: string,
		private readonly cipher: CredentialCipher,
	) {}

	/** Loads and validates the complete encrypted database. */
	public async initialize(): Promise<void> {
		let file: string;
		try {
			file = await readFile(this.filePath, 'utf8');
		} catch (error) {
			if (isNodeError(error) && error.code === 'ENOENT') {
				this.credentials = new Map();
				return;
			}
			throw new CredentialStoreError('invalid_store');
		}

		let envelope: unknown;
		try {
			envelope = JSON.parse(file);
		} catch {
			throw new CredentialStoreError('invalid_store');
		}
		if (!isEncryptedEnvelope(envelope)) {
			throw new CredentialStoreError('invalid_store');
		}

		let decrypted: string;
		try {
			decrypted = this.cipher.decrypt(envelope.ciphertext);
		} catch {
			throw new CredentialStoreError('decrypt_failed');
		}

		let database: unknown;
		try {
			database = JSON.parse(decrypted);
		} catch {
			throw new CredentialStoreError('invalid_store');
		}
		if (!isCredentialDatabase(database)) {
			throw new CredentialStoreError('invalid_store');
		}

		this.credentials = new Map(
			Object.entries(database.devices).map(([deviceId, value]) => [deviceId, deserializeCredentials(value)]),
		);
	}

	/**
	 * Gets a defensive credential copy.
	 *
	 * @param deviceId - Normalized protocol device identifier.
	 * @returns Credentials or undefined when the device is not paired.
	 */
	public get(deviceId: string): PairingCredentials | undefined {
		const value = this.credentials.get(normalizedDeviceId(deviceId));
		return value === undefined ? undefined : cloneCredentials(value);
	}

	/**
	 * Lists paired normalized device identifiers.
	 *
	 * @returns Sorted identifiers.
	 */
	public deviceIds(): string[] {
		return [...this.credentials.keys()].sort();
	}

	/**
	 * Atomically adds or replaces one pairing.
	 *
	 * @param deviceId - Normalized protocol device identifier.
	 * @param credentials - Long-term pairing credentials.
	 */
	public async set(deviceId: string, credentials: PairingCredentials): Promise<void> {
		const next = new Map(this.credentials);
		next.set(normalizedDeviceId(deviceId), cloneCredentials(credentials));
		await this.persist(next);
		this.credentials = next;
	}

	/**
	 * Atomically removes one pairing.
	 *
	 * @param deviceId - Normalized protocol device identifier.
	 * @returns Whether a record was removed.
	 */
	public async remove(deviceId: string): Promise<boolean> {
		const next = new Map(this.credentials);
		const removed = next.delete(normalizedDeviceId(deviceId));
		if (!removed) {
			return false;
		}
		await this.persist(next);
		this.credentials = next;
		return true;
	}

	/**
	 * Persists a complete snapshot as one encrypted atomic replacement.
	 *
	 * @param values - Complete validated snapshot to persist.
	 */
	private async persist(values: ReadonlyMap<string, PairingCredentials>): Promise<void> {
		const database: CredentialDatabase = {
			version: 1,
			devices: Object.fromEntries(
				[...values.entries()].map(([deviceId, value]) => [deviceId, serializeCredentials(value)]),
			),
		};
		let ciphertext: string;
		try {
			ciphertext = this.cipher.encrypt(JSON.stringify(database));
		} catch {
			throw new CredentialStoreError('write_failed');
		}
		if (ciphertext.length === 0) {
			throw new CredentialStoreError('write_failed');
		}

		const envelope: EncryptedEnvelope = { version: 1, ciphertext };
		const directory = dirname(this.filePath);
		const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
		try {
			await mkdir(directory, { recursive: true, mode: 0o700 });
			await chmod(directory, 0o700);
			await writeFile(temporaryPath, `${JSON.stringify(envelope)}\n`, {
				encoding: 'utf8',
				flag: 'wx',
				mode: 0o600,
			});
			await chmod(temporaryPath, 0o600);
			await rename(temporaryPath, this.filePath);
			await chmod(this.filePath, 0o600);
		} catch {
			await unlink(temporaryPath).catch(() => undefined);
			throw new CredentialStoreError('write_failed');
		}
	}

	/** Returns current file permission bits for diagnostics and tests. */
	public async fileMode(): Promise<number> {
		return (await stat(this.filePath)).mode & 0o777;
	}
}

/**
 * Converts buffers into canonical base64 fields.
 *
 * @param credentials - Binary credentials.
 */
function serializeCredentials(credentials: PairingCredentials): SerializedCredentials {
	return {
		accessoryIdentifier: credentials.accessoryIdentifier,
		accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('base64'),
		pairingId: credentials.pairingId.toString('base64'),
		publicKey: credentials.publicKey.toString('base64'),
		secretKey: credentials.secretKey.toString('base64'),
	};
}

/**
 * Restores validated base64 fields as buffers.
 *
 * @param credentials - Validated serialized credentials.
 */
function deserializeCredentials(credentials: SerializedCredentials): PairingCredentials {
	return {
		accessoryIdentifier: credentials.accessoryIdentifier,
		accessoryLongTermPublicKey: Buffer.from(credentials.accessoryLongTermPublicKey, 'base64'),
		pairingId: Buffer.from(credentials.pairingId, 'base64'),
		publicKey: Buffer.from(credentials.publicKey, 'base64'),
		secretKey: Buffer.from(credentials.secretKey, 'base64'),
	};
}

/**
 * Clones all mutable credential buffers.
 *
 * @param credentials - Credentials to copy.
 */
function cloneCredentials(credentials: PairingCredentials): PairingCredentials {
	return {
		accessoryIdentifier: credentials.accessoryIdentifier,
		accessoryLongTermPublicKey: Buffer.from(credentials.accessoryLongTermPublicKey),
		pairingId: Buffer.from(credentials.pairingId),
		publicKey: Buffer.from(credentials.publicKey),
		secretKey: Buffer.from(credentials.secretKey),
	};
}

/**
 * Validates the non-secret encrypted envelope boundary.
 *
 * @param value - Parsed untrusted JSON value.
 */
function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
	return (
		isRecord(value) && value.version === 1 && typeof value.ciphertext === 'string' && value.ciphertext.length > 0
	);
}

/**
 * Validates the complete decrypted credential schema.
 *
 * @param value - Decrypted untrusted JSON value.
 */
function isCredentialDatabase(value: unknown): value is CredentialDatabase {
	if (!isRecord(value) || value.version !== 1 || !isRecord(value.devices)) {
		return false;
	}
	return Object.entries(value.devices).every(
		([deviceId, credentials]) => isDeviceId(deviceId) && isSerializedCredentials(credentials),
	);
}

/**
 * Validates one serialized credential record.
 *
 * @param value - Untrusted serialized credential record.
 */
function isSerializedCredentials(value: unknown): value is SerializedCredentials {
	return (
		isRecord(value) &&
		typeof value.accessoryIdentifier === 'string' &&
		value.accessoryIdentifier.length > 0 &&
		isBase64(value.accessoryLongTermPublicKey) &&
		isBase64(value.pairingId) &&
		isBase64(value.publicKey) &&
		isBase64(value.secretKey)
	);
}

/**
 * Checks canonical non-empty base64.
 *
 * @param value - Untrusted possible base64 string.
 */
function isBase64(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0) {
		return false;
	}
	const decoded = Buffer.from(value, 'base64');
	return decoded.length > 0 && decoded.toString('base64') === value;
}

/**
 * Normalizes and validates one stable protocol identifier.
 *
 * @param value - Untrusted protocol identifier.
 */
function normalizedDeviceId(value: string): string {
	const normalized = value.replaceAll(':', '').replaceAll('-', '').toUpperCase();
	if (!isDeviceId(normalized)) {
		throw new CredentialStoreError('invalid_store');
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
 * @param value - Untrusted value.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrows Node filesystem errors.
 *
 * @param value - Unknown caught value.
 */
function isNodeError(value: unknown): value is NodeJS.ErrnoException {
	return value instanceof Error && 'code' in value;
}
