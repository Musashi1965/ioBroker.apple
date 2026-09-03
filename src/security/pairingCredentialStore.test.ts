/// <reference types="mocha" />

import { expect } from 'chai';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	CredentialStoreError,
	PairingCredentialStore,
	type CredentialCipher,
	type PairingCredentials,
} from './pairingCredentialStore';

const cipher: CredentialCipher = {
	encrypt: value => Buffer.from(value, 'utf8').toString('base64'),
	decrypt: value => Buffer.from(value, 'base64').toString('utf8'),
};

describe('PairingCredentialStore', () => {
	it('persists only encrypted data and reloads credentials', async () => {
		const fixture = await createFixture();
		try {
			await fixture.store.initialize();
			await fixture.store.set('02:00:00:00:00:01', credentials(1));

			const onDisk = await readFile(fixture.filePath, 'utf8');
			expect(onDisk).not.to.contain('neutral-accessory-1');
			expect(onDisk).not.to.contain('020000000001');
			if (process.platform !== 'win32') {
				expect(await fixture.store.fileMode()).to.equal(0o600);
			}

			const reloaded = new PairingCredentialStore(fixture.filePath, cipher);
			await reloaded.initialize();
			expect(reloaded.deviceIds()).to.deep.equal(['020000000001']);
			expect(reloaded.get('020000000001')).to.deep.equal(credentials(1));
		} finally {
			await fixture.cleanup();
		}
	});

	it('atomically retains multiple records and removes only the requested device', async () => {
		const fixture = await createFixture();
		try {
			await fixture.store.initialize();
			await fixture.store.set('020000000001', credentials(1));
			await fixture.store.set('020000000002', credentials(2));
			expect(fixture.store.deviceIds()).to.deep.equal(['020000000001', '020000000002']);

			expect(await fixture.store.remove('020000000001')).to.equal(true);
			expect(await fixture.store.remove('020000000003')).to.equal(false);
			expect(fixture.store.deviceIds()).to.deep.equal(['020000000002']);
			expect((await readdir(fixture.directory)).filter(name => name.endsWith('.tmp'))).to.deep.equal([]);
		} finally {
			await fixture.cleanup();
		}
	});

	it('fails closed for invalid or undecryptable storage', async () => {
		const fixture = await createFixture();
		try {
			await writeFile(fixture.filePath, '{"version":1,"ciphertext":"invalid"}\n', { mode: 0o600 });
			const failing = new PairingCredentialStore(fixture.filePath, {
				encrypt: cipher.encrypt,
				decrypt: () => {
					throw new Error('secret mismatch');
				},
			});
			let failure: unknown;
			try {
				await failing.initialize();
			} catch (error) {
				failure = error;
			}
			expect(failure).to.be.instanceOf(CredentialStoreError);
			expect((failure as CredentialStoreError).code).to.equal('decrypt_failed');
		} finally {
			await fixture.cleanup();
		}
	});
});

/** Creates one isolated store fixture. */
async function createFixture(): Promise<{
	directory: string;
	filePath: string;
	store: PairingCredentialStore;
	cleanup: () => Promise<void>;
}> {
	const directory = await mkdtemp(join(tmpdir(), 'iobroker-apple-store-'));
	const filePath = join(directory, 'pairings.v1.json');
	return {
		directory,
		filePath,
		store: new PairingCredentialStore(filePath, cipher),
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
}

/**
 * Creates neutral deterministic credentials.
 *
 * @param seed - Deterministic non-secret byte seed.
 */
function credentials(seed: number): PairingCredentials {
	return {
		accessoryIdentifier: `neutral-accessory-${seed}`,
		accessoryLongTermPublicKey: Buffer.alloc(32, seed),
		pairingId: Buffer.alloc(36, seed + 1),
		publicKey: Buffer.alloc(32, seed + 2),
		secretKey: Buffer.alloc(64, seed + 3),
	};
}
