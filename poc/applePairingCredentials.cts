import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AccessoryCredentialsShape {
	accessoryIdentifier: string;
	accessoryLongTermPublicKey: Buffer;
	pairingId: Buffer;
	publicKey: Buffer;
	secretKey: Buffer;
}

interface SerializedCredentials {
	accessoryIdentifier: string;
	accessoryLongTermPublicKey: string;
	pairingId: string;
	publicKey: string;
	secretKey: string;
}

interface PairingFile {
	version: 1;
	deviceId: string;
	credentials: SerializedCredentials;
}

export interface LoadedPairing {
	deviceId: string;
	credentials: AccessoryCredentialsShape;
}

/**
 * Stores one disposable PoC pairing with owner-only filesystem permissions.
 * Existing files are never overwritten.
 * @param path - Private credential-file path.
 * @param deviceId - Stable protocol identifier for rediscovery.
 * @param credentials - Long-term credentials returned by pair-setup.
 */
export async function writePairingFile(
	path: string,
	deviceId: string,
	credentials: AccessoryCredentialsShape,
): Promise<void> {
	const data: PairingFile = {
		version: 1,
		deviceId,
		credentials: serializeCredentials(credentials),
	};

	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await chmod(dirname(path), 0o700);
	await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, {
		encoding: 'utf8',
		flag: 'wx',
		mode: 0o600,
	});
	await chmod(path, 0o600);
}

/**
 * Loads one PoC pairing only when group and other permission bits are absent.
 * @param path - Private credential-file path.
 * @returns Validated and deserialized pairing material.
 */
export async function readPairingFile(path: string): Promise<LoadedPairing> {
	const metadata = await stat(path);
	if ((metadata.mode & 0o077) !== 0) {
		throw new Error('Pairing credential file permissions must be 0600 or stricter');
	}

	const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
	if (!isPairingFile(parsed)) {
		throw new Error('Pairing credential file has an invalid schema');
	}

	return {
		deviceId: parsed.deviceId,
		credentials: deserializeCredentials(parsed.credentials),
	};
}

/**
 * Converts credential buffers into base64 for local JSON persistence.
 * @param credentials - Binary pairing credentials.
 * @returns JSON-safe credential fields.
 */
function serializeCredentials(credentials: AccessoryCredentialsShape): SerializedCredentials {
	return {
		accessoryIdentifier: credentials.accessoryIdentifier,
		accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('base64'),
		pairingId: credentials.pairingId.toString('base64'),
		publicKey: credentials.publicKey.toString('base64'),
		secretKey: credentials.secretKey.toString('base64'),
	};
}

/**
 * Restores credential buffers from validated base64 fields.
 * @param credentials - Validated JSON-safe credential fields.
 * @returns Binary pairing credentials.
 */
function deserializeCredentials(credentials: SerializedCredentials): AccessoryCredentialsShape {
	return {
		accessoryIdentifier: credentials.accessoryIdentifier,
		accessoryLongTermPublicKey: Buffer.from(credentials.accessoryLongTermPublicKey, 'base64'),
		pairingId: Buffer.from(credentials.pairingId, 'base64'),
		publicKey: Buffer.from(credentials.publicKey, 'base64'),
		secretKey: Buffer.from(credentials.secretKey, 'base64'),
	};
}

/**
 * Validates the complete version-one pairing-file boundary.
 * @param value - Parsed but untrusted JSON value.
 * @returns Whether the value has the required schema.
 */
function isPairingFile(value: unknown): value is PairingFile {
	if (!isRecord(value) || value.version !== 1 || !isFixedHex(value.deviceId, 12)) {
		return false;
	}
	if (!isRecord(value.credentials)) {
		return false;
	}

	const credentials = value.credentials;
	return (
		typeof credentials.accessoryIdentifier === 'string' &&
		credentials.accessoryIdentifier.length > 0 &&
		isBase64(credentials.accessoryLongTermPublicKey) &&
		isBase64(credentials.pairingId) &&
		isBase64(credentials.publicKey) &&
		isBase64(credentials.secretKey)
	);
}

/**
 * Checks an untrusted object boundary.
 * @param value - Untrusted value.
 * @returns Whether the value is a non-null record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Checks one fixed-length hexadecimal identifier.
 * @param value - Untrusted value.
 * @param length - Required hexadecimal character count.
 * @returns Whether the value is valid.
 */
function isFixedHex(value: unknown, length: number): value is string {
	return typeof value === 'string' && value.length === length && /^[0-9A-F]+$/.test(value);
}

/**
 * Checks that a value is canonical, non-empty base64.
 * @param value - Untrusted value.
 * @returns Whether the value is valid canonical base64.
 */
function isBase64(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0) {
		return false;
	}
	const decoded = Buffer.from(value, 'base64');
	return decoded.length > 0 && decoded.toString('base64') === value;
}
