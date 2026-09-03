import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readPairingFile, writePairingFile } from './applePairingCredentials.cjs';

void test('round-trips credentials through an owner-only local file', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'iobroker-apple-pairing-'));
	const path = join(directory, 'credentials.json');
	const credentials = {
		accessoryIdentifier: 'neutral-accessory',
		accessoryLongTermPublicKey: Buffer.alloc(32, 1),
		pairingId: Buffer.alloc(36, 2),
		publicKey: Buffer.alloc(32, 3),
		secretKey: Buffer.alloc(64, 4),
	};

	try {
		await writePairingFile(path, '020000000001', credentials);
		const loaded = await readPairingFile(path);
		const metadata = await stat(path);

		assert.deepEqual(loaded, { deviceId: '020000000001', credentials });
		assert.equal(metadata.mode & 0o777, 0o600);
		assert.equal((await readFile(path, 'utf8')).includes('neutral-accessory'), true);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

void test('refuses to overwrite an existing credential file', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'iobroker-apple-pairing-'));
	const path = join(directory, 'credentials.json');
	const credentials = {
		accessoryIdentifier: 'neutral-accessory',
		accessoryLongTermPublicKey: Buffer.alloc(32, 1),
		pairingId: Buffer.alloc(36, 2),
		publicKey: Buffer.alloc(32, 3),
		secretKey: Buffer.alloc(64, 4),
	};

	try {
		await writePairingFile(path, '020000000001', credentials);
		await assert.rejects(writePairingFile(path, '020000000001', credentials), { code: 'EEXIST' });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

void test('rejects a credential file with an invalid schema', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'iobroker-apple-pairing-'));
	const path = join(directory, 'credentials.json');

	try {
		await writeFile(path, '{"version":1,"deviceId":"invalid"}\n', { mode: 0o600 });
		await chmod(path, 0o600);
		await assert.rejects(readPairingFile(path), /invalid schema/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
