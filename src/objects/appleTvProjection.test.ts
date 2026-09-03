/// <reference types="mocha" />

import { expect } from 'chai';

import type { DiscoveredAirPlayReceiver, DiscoveredAppleTv, DiscoveredHomePod } from '../backends/apple/discoveryTypes';
import { emptyAppleTvSnapshot } from '../domain/appleTv';
import { emptyHomePodSnapshot } from '../domain/homePod';
import { AppleTvProjection } from './appleTvProjection';

describe('AppleTvProjection', () => {
	it('initializes scalar defaults once without discovery overwriting live connection state', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);

		await projection.discovered(target(), true, false);
		expect(adapter.writes.some(write => write.id.endsWith('.connection.state'))).to.equal(false);

		await projection.initializeDevice('020000000001', 'discovered');
		expect(adapter.lastValue('.connection.state')).to.equal('discovered');
		expect(adapter.lastValue('.lastCommand.status')).to.equal('idle');
		expect(adapter.writes.every(write => write.ack)).to.equal(true);

		await projection.connection('020000000001', {
			state: 'online',
			online: true,
			airplay: true,
			companion: true,
		});
		await projection.discovered(target(), true, false);
		expect(adapter.lastValue('.connection.state')).to.equal('online');
	});

	it('creates and resets remote buttons only after capability is reported', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		await projection.discovered(target(), true, false);
		expect(adapter.objects.some(id => id.endsWith('.remote.select'))).to.equal(false);

		await projection.snapshot('020000000001', {
			...emptyAppleTvSnapshot(),
			capabilities: { remote: true, playback: true, power: true, nowPlaying: true, volume: false, apps: true },
		});
		expect(adapter.objects.some(id => id.endsWith('.remote.select'))).to.equal(true);
		expect(adapter.objects.some(id => id.endsWith('.playback.playPause'))).to.equal(true);
		expect(adapter.objects.some(id => id.endsWith('.power.powerOn'))).to.equal(true);
		expect(adapter.objects.some(id => id.endsWith('.power.powerOff'))).to.equal(true);
		expect(adapter.objects.some(id => id.endsWith('.apps.refresh'))).to.equal(true);
		expect(adapter.objects.some(id => id.endsWith('.apps.openurl'))).to.equal(true);

		await projection.commandResult('020000000001', 'select', 'success');
		expect(adapter.lastValue('.remote.select')).to.equal(false);
		await projection.commandResult('020000000001', 'powerOff', 'success');
		expect(adapter.lastValue('.power.powerOff')).to.equal(false);
		expect(adapter.writes.at(-1)?.ack).to.equal(true);
	});

	it('projects an app catalog and acknowledges app controls after command completion', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		const staleKey = `app_${'0'.repeat(64)}`;
		adapter.objects.push(`devices.appletv.020000000001.apps.entries.${staleKey}.launch`);
		await projection.discovered(target(), true, false);
		await projection.apps('020000000001', [
			{ bundleId: 'com.example.First', name: 'First' },
			{ bundleId: 'com.example.Second', name: 'Second' },
		]);
		await projection.appCommandStarted('020000000001', 'refresh');
		await projection.appCommandResult('020000000001', 'refresh', 'success');

		expect(adapter.lastValue('.apps.count')).to.equal(2);
		expect(adapter.lastValue('.apps.available')).to.equal(
			'[{"bundleId":"com.example.First","name":"First"},{"bundleId":"com.example.Second","name":"Second"}]',
		);
		expect(adapter.lastValue('.lastCommand.status')).to.equal('success');
		expect(adapter.lastValue('.apps.refreshStatus')).to.equal('success');
		expect(adapter.lastValue('.apps.refresh')).to.equal(false);
		expect(adapter.objects.some(id => id.endsWith('.apps.launch'))).to.equal(false);
		expect(adapter.objects.some(id => id.endsWith('.apps.entries.First.launch'))).to.equal(true);
		expect(adapter.deleted).to.deep.equal([`devices.appletv.020000000001.apps.entries.${staleKey}`]);
		expect(adapter.writes.every(write => write.ack)).to.equal(true);
	});

	it('acknowledges openurl without retaining the submitted URL', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		await projection.discovered(target(), true, false);
		await projection.snapshot('020000000001', {
			...emptyAppleTvSnapshot(),
			capabilities: { remote: false, playback: false, power: false, nowPlaying: true, volume: false, apps: true },
		});

		await projection.appCommandStarted('020000000001', 'openurl');
		await projection.appCommandResult('020000000001', 'openurl', 'success');

		expect(adapter.lastValue('.lastCommand.name')).to.equal('openUrl');
		expect(adapter.lastValue('.lastCommand.target')).to.equal('');
		expect(adapter.lastValue('.lastCommand.status')).to.equal('success');
		expect(adapter.lastValue('.apps.openurl')).to.equal('');
		expect(adapter.writes.every(write => write.ack)).to.equal(true);
	});

	it('removes unpaired or explicitly forgotten current device trees', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		adapter.objects.push(
			'devices.appletv.020000000001.info.name',
			'devices.appletv.020000000002.info.name',
			'devices.appletv.020000000003.info.name',
		);

		await projection.removeUnpairedDevices(['020000000001']);
		expect(adapter.deleted).to.deep.equal(['devices.appletv.020000000002', 'devices.appletv.020000000003']);
		await projection.removeDevice('020000000001');

		expect(adapter.deleted).to.deep.equal([
			'devices.appletv.020000000002',
			'devices.appletv.020000000003',
			'devices.appletv.020000000001',
		]);
	});

	it('retains only active managed HomePod and receiver roots and supports explicit removal', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		adapter.objects.push(
			'devices.homepod.020000000002.info.name',
			'devices.homepod.020000000004.info.name',
			'devices.airplayReceiver.020000000003.info.name',
			'devices.airplayReceiver.020000000005.info.name',
		);

		await projection.retainManagedHomePods(['020000000002']);
		await projection.retainManagedAirPlayReceivers(['020000000003']);
		expect(adapter.deleted).to.deep.equal(['devices.homepod.020000000004', 'devices.airplayReceiver.020000000005']);

		await projection.removeHomePod('020000000002');
		await projection.removeAirPlayReceiver('020000000003');
		expect(adapter.deleted.slice(-2)).to.deep.equal([
			'devices.homepod.020000000002',
			'devices.airplayReceiver.020000000003',
		]);
	});

	it('removes superseded command objects after the replacement tree exists', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		adapter.objects.push(
			'devices.appletv.020000000001.command.status',
			'devices.appletv.020000000001.apps.command.status',
			'devices.appletv.020000000001.apps.launch',
			'devices.appletv.020000000001.remote.playPause',
			'devices.appletv.020000000001.remote.powerOn',
			'devices.appletv.020000000001.remote.powerOff',
		);

		await projection.discovered(target(), true, false);

		expect(adapter.objects.some(id => id.endsWith('.lastCommand.status'))).to.equal(true);
		expect(adapter.deleted).to.deep.equal([
			'devices.appletv.020000000001.command',
			'devices.appletv.020000000001.apps.command',
			'devices.appletv.020000000001.apps.launch',
			'devices.appletv.020000000001.remote.playPause',
			'devices.appletv.020000000001.remote.powerOn',
			'devices.appletv.020000000001.remote.powerOff',
		]);
	});

	it('projects exclusive discovery counts for all reserved device classes', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		await projection.initialize();
		await projection.aggregate({ appletv: 3, homepod: 2, airplayReceiver: 4 }, true);

		expect(adapter.value('info.deviceCount')).to.equal(9);
		expect(adapter.value('devices.appletv.info.deviceCount')).to.equal(3);
		expect(adapter.value('devices.homepod.info.deviceCount')).to.equal(2);
		expect(adapter.value('devices.airplayReceiver.info.deviceCount')).to.equal(4);
	});

	it('projects stable receivers read-only and retains them as unavailable when absent', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		await projection.initialize();
		await projection.airPlayReceivers([receiverTarget()], 1_234);

		const root = 'devices.airplayReceiver.020000000003';
		expect(adapter.objects).to.include(root);
		expect(adapter.value(`${root}.info.deviceId`)).to.equal('020000000003');
		expect(adapter.value(`${root}.info.lastSeen`)).to.equal(1_234);
		expect(adapter.value(`${root}.discovery.available`)).to.equal(true);
		expect(adapter.value(`${root}.services.airplay`)).to.equal(true);
		expect(adapter.value(`${root}.services.raop`)).to.equal(false);

		await projection.airPlayReceivers([], 2_345);
		expect(adapter.objects).to.include(root);
		expect(adapter.value(`${root}.info.lastSeen`)).to.equal(1_234);
		expect(adapter.value(`${root}.discovery.available`)).to.equal(false);
		expect(adapter.value(`${root}.services.airplay`)).to.equal(false);
		expect(adapter.writes.every(write => write.ack)).to.equal(true);
	});

	it('marks retained receiver inventory unavailable before the first startup scan', async () => {
		const adapter = new ProjectionAdapterFake();
		const root = 'devices.airplayReceiver.020000000003';
		adapter.objects.push(root, `${root}.discovery.available`, `${root}.services.airplay`, `${root}.services.raop`);
		const projection = new AppleTvProjection(adapter);

		await projection.initialize();

		expect(adapter.value(`${root}.discovery.available`)).to.equal(false);
		expect(adapter.value(`${root}.services.airplay`)).to.equal(false);
		expect(adapter.value(`${root}.services.raop`)).to.equal(false);
	});

	it('projects HomePod transient pairing, capabilities, commands, and absence safely', async () => {
		const adapter = new ProjectionAdapterFake();
		const projection = new AppleTvProjection(adapter);
		const root = 'devices.homepod.020000000002';

		await projection.initialize();
		await projection.homePods([homePodTarget()], 1_234);
		await projection.initializeHomePod('020000000002');
		expect(adapter.value(`${root}.info.lastSeen`)).to.equal(1_234);
		expect(adapter.value(`${root}.pairing.mode`)).to.equal('transient');
		expect(adapter.value(`${root}.pairing.status`)).to.equal('idle');

		await projection.homePodConnection('020000000002', {
			state: 'online',
			online: true,
			pairing: 'paired',
		});
		await projection.homePodSnapshot('020000000002', {
			...emptyHomePodSnapshot(),
			volumeAvailable: true,
			volume: 42,
			capabilities: { playback: true, nowPlaying: true, volume: true },
		});
		expect(adapter.objects.some(id => id.endsWith('.playback.next'))).to.equal(true);
		expect(adapter.value(`${root}.capabilities.playback`)).to.equal(true);
		expect(adapter.value(`${root}.volume.level`)).to.equal(42);

		await projection.homePodCommandStarted('020000000002', 'next');
		await projection.homePodCommandResult('020000000002', 'next', 'success');
		expect(adapter.value(`${root}.lastCommand.status`)).to.equal('success');
		expect(adapter.value(`${root}.playback.next`)).to.equal(false);
		await projection.homePodCommandResult('020000000002', 'setVolume', 'success', '', 37);
		await projection.homePodCommandResult('020000000002', 'setMuted', 'success', '', true);
		expect(adapter.value(`${root}.volume.level`)).to.equal(37);
		expect(adapter.value(`${root}.volume.muted`)).to.equal(true);

		await projection.homePods([], 2_345);
		expect(adapter.value(`${root}.info.lastSeen`)).to.equal(1_234);
		expect(adapter.value(`${root}.discovery.available`)).to.equal(false);
		expect(adapter.value(`${root}.connection.online`)).to.equal(false);
		expect(adapter.value(`${root}.pairing.status`)).to.equal('idle');
		expect(adapter.value(`${root}.capabilities.playback`)).to.equal(false);
		expect(adapter.writes.every(write => write.ack)).to.equal(true);
	});
});

class ProjectionAdapterFake {
	public readonly namespace = 'apple.0';
	public readonly objects: string[] = [];
	public readonly deleted: string[] = [];
	public readonly writes: { id: string; value: ioBroker.StateValue; ack: boolean }[] = [];

	public extendObjectAsync(id: string, _object: ioBroker.PartialObject): ioBroker.SetObjectPromise {
		this.objects.push(id);
		return Promise.resolve({ id });
	}

	public setStateAsync(id: string, value: ioBroker.StateValue, ack: boolean): ioBroker.SetStatePromise {
		this.writes.push({ id, value, ack });
		return Promise.resolve(id);
	}

	public getObjectListAsync(params: ioBroker.GetObjectListParams | null): ioBroker.GetObjectListPromise {
		const rows = this.objects
			.map(id => `${this.namespace}.${id}`)
			.filter(id => params === null || (id >= (params.startkey ?? '') && id <= (params.endkey ?? '\u9999')))
			.map(id => ({ id, value: { _id: id, type: 'state', common: {}, native: {} } }));
		return Promise.resolve({ rows }) as ioBroker.GetObjectListPromise;
	}

	public delObjectAsync(id: string, _options?: ioBroker.DelObjectOptions): Promise<void> {
		this.deleted.push(id);
		for (let index = this.objects.length - 1; index >= 0; index -= 1) {
			if (this.objects[index] === id || this.objects[index].startsWith(`${id}.`)) {
				this.objects.splice(index, 1);
			}
		}
		return Promise.resolve();
	}

	public lastValue(suffix: string): ioBroker.StateValue | undefined {
		return this.writes.findLast(write => write.id.endsWith(suffix))?.value;
	}

	public value(id: string): ioBroker.StateValue | undefined {
		return this.writes.findLast(write => write.id === id)?.value;
	}
}

/** Creates a standards-reserved neutral discovery target. */
function target(): DiscoveredAppleTv {
	return {
		deviceId: '020000000001',
		name: 'Neutral Apple TV',
		model: 'AppleTV14,1',
		airplay: {
			id: 'neutral-airplay',
			fqdn: 'neutral.example.test',
			address: '192.0.2.10',
			modelName: 'AppleTV14,1',
			familyName: null,
			service: { port: 7000, protocol: 'tcp', type: '_airplay._tcp.local' },
			txt: { deviceid: '02:00:00:00:00:01' },
		},
	};
}

function homePodTarget(): DiscoveredHomePod {
	return {
		deviceId: '020000000002',
		name: 'Neutral HomePod',
		model: 'AudioAccessory6,1',
		airplay: {
			id: 'neutral-homepod',
			fqdn: 'neutral-homepod.example.test',
			address: '192.0.2.20',
			modelName: 'AudioAccessory6,1',
			familyName: null,
			service: { port: 7000, protocol: 'tcp', type: '_airplay._tcp.local' },
			txt: { deviceid: '02:00:00:00:00:02' },
		},
	};
}

/** Creates a standards-reserved generic receiver target. */
function receiverTarget(): DiscoveredAirPlayReceiver {
	return {
		deviceId: '020000000003',
		name: 'Neutral Receiver',
		model: 'NeutralReceiver1,1',
		airplay: {
			id: 'neutral-receiver',
			fqdn: 'receiver.example.test',
			address: '192.0.2.30',
			modelName: 'NeutralReceiver1,1',
			familyName: null,
			service: { port: 7000, protocol: 'tcp', type: '_airplay._tcp.local' },
			txt: { deviceid: '02:00:00:00:00:03' },
		},
	};
}
