/// <reference types="mocha" />

import { expect } from 'chai';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DeviceSettingsStore, DeviceSettingsStoreError } from './deviceSettingsStore';

describe('DeviceSettingsStore', () => {
	it('defaults existing devices to enabled and persists only explicit disablement', async () => {
		const fixture = await createFixture();
		try {
			await fixture.store.initialize();
			expect(fixture.store.isEnabled('02:00:00:00:00:01')).to.equal(true);

			await fixture.store.setEnabled('02:00:00:00:00:01', false);
			expect(fixture.store.isEnabled('020000000001')).to.equal(false);
			if (process.platform !== 'win32') {
				expect(await fixture.store.fileMode()).to.equal(0o600);
			}
			expect(JSON.parse(await readFile(fixture.filePath, 'utf8'))).to.deep.equal({
				version: 1,
				disabledAppleTvDeviceIds: ['020000000001'],
			});

			const reloaded = new DeviceSettingsStore(fixture.filePath);
			await reloaded.initialize();
			expect(reloaded.isEnabled('020000000001')).to.equal(false);
			await reloaded.setEnabled('020000000001', true);
			expect(reloaded.isEnabled('020000000001')).to.equal(true);
		} finally {
			await fixture.cleanup();
		}
	});

	it('removes stale disabled metadata and leaves no temporary files', async () => {
		const fixture = await createFixture();
		try {
			await fixture.store.initialize();
			await fixture.store.setEnabled('020000000001', false);
			await fixture.store.remove('020000000001');
			expect(fixture.store.isEnabled('020000000001')).to.equal(true);
			expect((await readdir(fixture.directory)).filter(name => name.endsWith('.tmp'))).to.deep.equal([]);
		} finally {
			await fixture.cleanup();
		}
	});

	it('fails closed for malformed settings', async () => {
		const fixture = await createFixture();
		try {
			await writeFile(fixture.filePath, '{"version":1,"disabledAppleTvDeviceIds":["invalid"]}\n', {
				mode: 0o600,
			});
			let failure: unknown;
			try {
				await fixture.store.initialize();
			} catch (error) {
				failure = error;
			}
			expect(failure).to.be.instanceOf(DeviceSettingsStoreError);
			expect((failure as DeviceSettingsStoreError).code).to.equal('invalid_device_settings');
		} finally {
			await fixture.cleanup();
		}
	});
});

/** Creates one isolated store fixture. */
async function createFixture(): Promise<{
	directory: string;
	filePath: string;
	store: DeviceSettingsStore;
	cleanup: () => Promise<void>;
}> {
	const directory = await mkdtemp(join(tmpdir(), 'iobroker-apple-device-settings-'));
	const filePath = join(directory, 'device-settings.v1.json');
	return {
		directory,
		filePath,
		store: new DeviceSettingsStore(filePath),
		cleanup: () => rm(directory, { recursive: true, force: true }),
	};
}
