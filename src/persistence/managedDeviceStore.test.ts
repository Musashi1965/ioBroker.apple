/// <reference types="mocha" />

import { expect } from 'chai';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';

import { ManagedDeviceStore, ManagedDeviceStoreError } from './managedDeviceStore';

describe('ManagedDeviceStore', () => {
	it('persists adopted devices, enablement, refreshed metadata, and removal atomically', async () => {
		const fixture = await createFixture();
		try {
			await fixture.store.initialize();
			expect(fixture.store.list('homepod')).to.deep.equal([]);

			await fixture.store.manage('homepod', {
				deviceId: '02:00:00:00:00:02',
				name: 'Neutral HomePod',
				model: 'AudioAccessory6,1',
			});
			await fixture.store.setEnabled('homepod', '020000000002', false);
			await fixture.store.observe('homepod', {
				deviceId: '020000000002',
				name: 'Renamed HomePod',
				model: 'AudioAccessory6,1',
			});

			const reloaded = new ManagedDeviceStore(fixture.filePath);
			await reloaded.initialize();
			expect(reloaded.list('homepod')).to.deep.equal([
				{
					deviceClass: 'homepod',
					deviceId: '020000000002',
					name: 'Renamed HomePod',
					model: 'AudioAccessory6,1',
					enabled: false,
				},
			]);
			if (platform() !== 'win32') {
				expect(await reloaded.fileMode()).to.equal(0o600);
			}
			expect(await reloaded.remove('homepod', '020000000002')).to.equal(true);
			expect(await reloaded.remove('homepod', '020000000002')).to.equal(false);
			expect(JSON.parse(await readFile(fixture.filePath, 'utf8'))).to.deep.equal({ version: 1, devices: [] });
		} finally {
			await fixture.cleanup();
		}
	});

	it('keeps equal protocol IDs separated by device class', async () => {
		const fixture = await createFixture();
		try {
			await fixture.store.initialize();
			await fixture.store.manage('homepod', {
				deviceId: '020000000002',
				name: 'Neutral HomePod',
				model: 'AudioAccessory6,1',
			});
			await fixture.store.manage('airplayReceiver', {
				deviceId: '020000000002',
				name: 'Neutral Receiver',
				model: 'Receiver1,1',
			});

			expect(fixture.store.has('homepod', '020000000002')).to.equal(true);
			expect(fixture.store.has('airplayReceiver', '020000000002')).to.equal(true);
			expect(fixture.store.list('airplayReceiver')).to.have.length(1);
		} finally {
			await fixture.cleanup();
		}
	});

	it('fails closed for malformed inventory data and missing records', async () => {
		const fixture = await createFixture();
		try {
			await writeFile(fixture.filePath, '{"version":1,"devices":[{"deviceClass":"homepod"}]}\n');
			await chmod(fixture.filePath, 0o600);
			let invalid: unknown;
			try {
				await fixture.store.initialize();
			} catch (error) {
				invalid = error;
			}
			expect(invalid)
				.to.be.instanceOf(ManagedDeviceStoreError)
				.and.have.property('code', 'invalid_managed_devices');

			const empty = new ManagedDeviceStore(join(fixture.directory, 'empty.json'));
			await empty.initialize();
			let missing: unknown;
			try {
				await empty.setEnabled('airplayReceiver', '020000000003', false);
			} catch (error) {
				missing = error;
			}
			expect(missing)
				.to.be.instanceOf(ManagedDeviceStoreError)
				.and.have.property('code', 'managed_device_not_found');
		} finally {
			await fixture.cleanup();
		}
	});
});

async function createFixture(): Promise<{
	directory: string;
	filePath: string;
	store: ManagedDeviceStore;
	cleanup(): Promise<void>;
}> {
	const directory = await mkdtemp(join(tmpdir(), 'apple-managed-devices-'));
	const filePath = join(directory, 'managed-devices.v1.json');
	return {
		directory,
		filePath,
		store: new ManagedDeviceStore(filePath),
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
}
