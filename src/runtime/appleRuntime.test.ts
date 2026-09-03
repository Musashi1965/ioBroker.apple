/// <reference types="mocha" />

import { expect } from 'chai';

import type {
	AppleDeviceClass,
	AppleDeviceCounts,
	AppleDiscoverySnapshot,
	DiscoveredAirPlayReceiver,
	DiscoveredAppleTv,
	DiscoveredDeviceSummary,
	DiscoveredHomePod,
} from '../backends/apple/discoveryTypes';
import type { AppleTvConnectionStatus, AppleTvRemoteCommand, AppleTvSnapshot } from '../domain/appleTv';
import { emptyAppleTvSnapshot } from '../domain/appleTv';
import type { HomePodCommand, HomePodConnectionStatus, HomePodSnapshot } from '../domain/homePod';
import type { ManagedDiscoveryDeviceClass, ManagedDiscoveryDeviceRecord } from '../persistence/managedDeviceStore';
import type { PairingCredentials } from '../security/pairingCredentialStore';
import type { TimerHandle, TimerScheduler } from '../platform/timerScheduler';
import { testTimerScheduler } from '../../test/timerScheduler';
import {
	AppleRuntime,
	parseAppleTvCommandStateId,
	parseAppleTvCommandWrite,
	parseAppWrite,
	parseHomePodWrite,
	type AppleTvBackendFactory,
	type HomePodBackendFactory,
} from './appleRuntime';

describe('AppleRuntime', () => {
	it('discovers, connects, projects events, and executes one remote command', async () => {
		const target = discoveredTarget();
		const projection = new ProjectionFake();
		const store = new CredentialStoreFake(credentials());
		const discovery = new DiscoveryFake([target]);
		const backend = new BackendFake();
		const timers = new TimerSchedulerFake();
		const runtime = new AppleRuntime(
			projection,
			store,
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			timers,
			discovery,
			new PairingFake(),
			backend.factory,
		);

		await runtime.start();
		await nextTurn();

		expect(store.initialized).to.equal(true);
		expect(projection.discoveredCalls).to.deep.equal([{ deviceId: target.deviceId, paired: true }]);
		expect(backend.connectCount).to.equal(1);
		expect(projection.connectionCalls.at(-1)?.online).to.equal(true);
		expect(projection.snapshotCount).to.equal(1);
		expect(projection.appCount).to.equal(2);
		expect(projection.appCommandResults.at(-1)).to.deep.include({ action: 'refresh', status: 'success' });
		expect(timers.intervalDelays).to.deep.equal([60_000]);
		expect(timers.activeIntervals.size).to.equal(1);

		await runtime.executeRemote(target.deviceId, 'select');
		await runtime.executeRemote(target.deviceId, 'powerOn');
		expect(backend.commands).to.deep.equal(['select', 'powerOn']);
		expect(projection.commandResults.at(-1)).to.deep.include({ command: 'powerOn', status: 'success' });
		await runtime.launchApp(target.deviceId, 'com.example.First');
		await runtime.launchAppEntry(target.deviceId, 'Second');
		await runtime.openUrl(target.deviceId, 'https://example.test/live?channel=one');
		expect(backend.launchedApps).to.deep.equal(['com.example.First', 'com.example.Second']);
		expect(backend.openedUrls).to.deep.equal(['https://example.test/live?channel=one']);
		expect(projection.appCommandResults.at(-1)).to.deep.include({ action: 'openurl', status: 'success' });

		await runtime.stop();
		expect(discovery.cancelled).to.equal(true);
		expect(backend.disconnectCount).to.equal(1);
		expect(timers.activeIntervals.size).to.equal(0);
	});

	it('parses only valid unacknowledged app control writes', () => {
		expect(
			parseAppWrite('apple.0.devices.appletv.020000000001.apps.refresh', { ack: false, val: true }),
		).to.deep.equal({
			deviceId: '020000000001',
			action: 'refresh',
		});
		const entryKey = 'Example_Player';
		expect(
			parseAppWrite(`devices.appletv.020000000001.apps.entries.${entryKey}.launch`, {
				ack: false,
				val: true,
			}),
		).to.deep.equal({ deviceId: '020000000001', action: 'launchEntry', entryKey });
		expect(
			parseAppWrite('devices.appletv.020000000001.apps.openurl', {
				ack: false,
				val: 'https://example.test/live?channel=one',
			}),
		).to.deep.equal({
			deviceId: '020000000001',
			action: 'openurl',
			url: 'https://example.test/live?channel=one',
		});
		expect(parseAppWrite('devices.appletv.020000000001.apps.refresh', { ack: true, val: true })).to.equal(
			undefined,
		);
		expect(
			parseAppWrite('devices.appletv.020000000001.apps.launch', {
				ack: false,
				val: 'com.example.Player',
			}),
		).to.equal(undefined);
		expect(
			parseAppWrite('devices.appletv.020000000001.apps.openurl', { ack: true, val: 'https://example.test' }),
		).to.equal(undefined);
		expect(parseAppWrite('devices.appletv.020000000001.apps.openurl', { ack: false, val: '' })).to.equal(undefined);
	});

	it('rejects unsafe URL commands before calling the backend', async () => {
		const target = discoveredTarget();
		const projection = new ProjectionFake();
		const backend = new BackendFake();
		const runtime = new AppleRuntime(
			projection,
			new CredentialStoreFake(credentials()),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target]),
			new PairingFake(),
			backend.factory,
		);

		await runtime.start();
		await nextTurn();
		let error: unknown;
		try {
			await runtime.openUrl(target.deviceId, 'file:///private/example');
		} catch (caught) {
			error = caught;
		}

		expect(error).to.be.instanceOf(Error).and.have.property('message', 'unsupported');
		expect(backend.openedUrls).to.deep.equal([]);
		expect(projection.appCommandResults.at(-1)).to.deep.include({
			action: 'openurl',
			status: 'error',
			error: 'unsupported',
		});
		await runtime.stop();
	});

	it('persists a fresh pairing before connecting the target', async () => {
		const target = discoveredTarget();
		const projection = new ProjectionFake();
		const store = new CredentialStoreFake();
		const backend = new BackendFake();
		const pairing = new PairingFake();
		const runtime = new AppleRuntime(
			projection,
			store,
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target]),
			pairing,
			backend.factory,
		);

		await runtime.start();
		expect(runtime.pairingCandidates()).to.deep.equal([
			{ deviceId: target.deviceId, name: target.name, model: target.model, paired: false },
		]);
		await runtime.startPairing(target.deviceId);
		await runtime.finishPairing(target.deviceId, '0000');
		await nextTurn();

		expect(pairing.receivedPin).to.equal('0000');
		expect(store.savedDeviceId).to.equal(target.deviceId);
		expect(projection.discoveredCalls).to.deep.equal([{ deviceId: target.deviceId, paired: true }]);
		expect(backend.connectCount).to.equal(1);
		await runtime.stop();
	});

	it('lists persisted pairings even while a device is offline', async () => {
		const target = discoveredTarget();
		const runtime = new AppleRuntime(
			new ProjectionFake(),
			new CredentialStoreFake(credentials()),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([]),
			new PairingFake(),
			new BackendFake().factory,
		);

		await runtime.start();
		expect(runtime.pairedDevices()).to.deep.equal([
			{
				deviceId: target.deviceId,
				name: 'Apple TV …0001',
				model: '',
				discovered: false,
				connected: false,
				appCount: 0,
				enabled: true,
			},
		]);
		await runtime.stop();
	});

	it('keeps passive pairings while disconnecting and removing their public tree', async () => {
		const target = discoveredTarget();
		const projection = new ProjectionFake();
		const backend = new BackendFake();
		const runtime = new AppleRuntime(
			projection,
			new CredentialStoreFake(credentials()),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target]),
			new PairingFake(),
			backend.factory,
		);

		await runtime.start();
		await nextTurn();
		await runtime.setPairedDeviceEnabled(target.deviceId, false);
		expect(runtime.pairedDevices()[0]?.enabled).to.equal(false);
		expect(projection.removedDeviceIds).to.deep.equal([target.deviceId]);
		expect(backend.disconnectCount).to.equal(1);

		await runtime.refresh();
		expect(projection.discoveredCalls).to.have.length(1);
		await runtime.setPairedDeviceEnabled(target.deviceId, true);
		await nextTurn();
		expect(runtime.pairedDevices()[0]?.enabled).to.equal(true);
		expect(projection.discoveredCalls).to.have.length(2);
		expect(backend.connectCount).to.equal(2);
		await runtime.stop();
	});

	it('removes passive trees on startup without connecting the backend', async () => {
		const target = discoveredTarget();
		const projection = new ProjectionFake();
		const backend = new BackendFake();
		const settings = new DeviceSettingsFake([target.deviceId]);
		const runtime = new AppleRuntime(
			projection,
			new CredentialStoreFake(credentials()),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target]),
			new PairingFake(),
			backend.factory,
			settings,
		);

		await runtime.start();
		expect(projection.retainedPairedDeviceIds).to.deep.equal([[]]);
		expect(backend.connectCount).to.equal(0);
		expect(runtime.pairedDevices()[0]?.enabled).to.equal(false);
		await runtime.stop();
	});

	it('returns all discovery classes and projects stable generic receivers', async () => {
		const target = discoveredTarget();
		const receiver = discoveredReceiver();
		const details: Record<AppleDeviceClass, DiscoveredDeviceSummary[]> = {
			appletv: [summary('appletv', 'Neutral Apple TV', 'AppleTV14,1', 'device:020000000001')],
			homepod: [summary('homepod', 'Neutral HomePod', 'AudioAccessory6,1', 'device:020000000002')],
			airplayReceiver: [
				summary('airplayReceiver', 'Neutral Receiver', 'NeutralReceiver1,1', 'device:020000000003'),
			],
		};
		const projection = new ProjectionFake();
		const runtime = new AppleRuntime(
			projection,
			new CredentialStoreFake(),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target], { appletv: 1, homepod: 1, airplayReceiver: 1 }, details, [receiver]),
			undefined,
			undefined,
			undefined,
			undefined,
			new ManagedDeviceStoreFake([
				managedRecord('airplayReceiver', receiver.deviceId, receiver.name, receiver.model),
			]),
		);

		await runtime.start();
		expect(runtime.discoveredDevices('homepod')).to.deep.equal(details.homepod);
		expect(runtime.discoveredDevices('airplayReceiver')).to.deep.equal(details.airplayReceiver);
		expect(projection.receiverCalls).to.deep.equal([[receiver]]);
		await runtime.stop();
	});

	it('adopts, activates, deactivates, and forgets HomePods and receivers without duplicate lists', async () => {
		const homePod = discoveredHomePod();
		const receiver = discoveredReceiver();
		const details: Record<AppleDeviceClass, DiscoveredDeviceSummary[]> = {
			appletv: [],
			homepod: [summary('homepod', homePod.name, homePod.model, `device:${homePod.deviceId}`)],
			airplayReceiver: [summary('airplayReceiver', receiver.name, receiver.model, `device:${receiver.deviceId}`)],
		};
		const projection = new ProjectionFake();
		const backend = new HomePodBackendFake();
		const managedDevices = new ManagedDeviceStoreFake();
		const runtime = new AppleRuntime(
			projection,
			new CredentialStoreFake(),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([], { appletv: 0, homepod: 1, airplayReceiver: 1 }, details, [receiver], [homePod]),
			undefined,
			undefined,
			undefined,
			backend.factory,
			managedDevices,
		);

		await runtime.start();
		expect(runtime.managedDeviceCandidates('homepod')).to.have.length(1);
		expect(runtime.managedDeviceCandidates('airplayReceiver')).to.have.length(1);
		expect(runtime.managedDiscoveryDevices('homepod')).to.deep.equal([]);
		expect(projection.homePodCalls.at(-1)).to.deep.equal([]);
		expect(projection.receiverCalls.at(-1)).to.deep.equal([]);

		await runtime.manageDiscoveredDevice('homepod', homePod.deviceId);
		await nextTurn();
		expect(runtime.managedDeviceCandidates('homepod')).to.deep.equal([]);
		expect(runtime.managedDiscoveryDevices('homepod')[0]).to.deep.include({
			deviceId: homePod.deviceId,
			enabled: true,
			discovered: true,
		});
		expect(backend.connectCount).to.equal(1);

		await runtime.manageDiscoveredDevice('airplayReceiver', receiver.deviceId);
		expect(runtime.managedDeviceCandidates('airplayReceiver')).to.deep.equal([]);
		expect(projection.receiverCalls.at(-1)).to.deep.equal([receiver]);

		await runtime.setManagedDiscoveryDeviceEnabled('homepod', homePod.deviceId, false);
		expect(runtime.managedDiscoveryDevices('homepod')[0]?.enabled).to.equal(false);
		expect(backend.disconnectCount).to.equal(1);
		expect(projection.retainedManagedHomePodIds.at(-1)).to.deep.equal([]);

		await runtime.setManagedDiscoveryDeviceEnabled('airplayReceiver', receiver.deviceId, false);
		expect(runtime.managedDiscoveryDevices('airplayReceiver')[0]?.enabled).to.equal(false);
		expect(projection.retainedManagedReceiverIds.at(-1)).to.deep.equal([]);

		await runtime.removeManagedDiscoveryDevice('airplayReceiver', receiver.deviceId);
		expect(runtime.managedDiscoveryDevices('airplayReceiver')).to.deep.equal([]);
		expect(runtime.managedDeviceCandidates('airplayReceiver')).to.have.length(1);
		expect(projection.removedReceiverIds).to.deep.equal([receiver.deviceId]);
		await runtime.stop();
	});

	it('forgets a pairing, disconnects it, and prevents object-tree recreation', async () => {
		const target = discoveredTarget();
		const projection = new ProjectionFake();
		const store = new CredentialStoreFake(credentials());
		const backend = new BackendFake();
		const runtime = new AppleRuntime(
			projection,
			store,
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target]),
			new PairingFake(),
			backend.factory,
		);

		await runtime.start();
		await nextTurn();
		await runtime.removePairedDevice(target.deviceId);

		expect(store.deviceIds()).to.deep.equal([]);
		expect(projection.removedDeviceIds).to.deep.equal([target.deviceId]);
		expect(runtime.pairedDevices()).to.deep.equal([]);
		expect(runtime.pairingCandidates()[0]?.paired).to.equal(false);
		expect(backend.disconnectCount).to.equal(1);

		await runtime.refresh();
		expect(projection.discoveredCalls).to.have.length(1);
		await runtime.stop();
		expect(backend.disconnectCount).to.equal(1);
	});

	it('finishes credential and tree cleanup when stale enablement metadata cannot be removed', async () => {
		const target = discoveredTarget();
		const projection = new ProjectionFake();
		const store = new CredentialStoreFake(credentials());
		const runtime = new AppleRuntime(
			projection,
			store,
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target]),
			new PairingFake(),
			new BackendFake().factory,
			new DeviceSettingsFake([], true),
		);
		await runtime.start();
		await nextTurn();

		let failure: unknown;
		try {
			await runtime.removePairedDevice(target.deviceId);
		} catch (error) {
			failure = error;
		}
		expect(failure).to.be.instanceOf(Error);
		expect(store.deviceIds()).to.deep.equal([]);
		expect(projection.removedDeviceIds).to.deep.equal([target.deviceId]);
		await runtime.stop();
	});

	it('parses only commands below their capability-owned channels', () => {
		expect(parseAppleTvCommandStateId('apple.0.devices.appletv.020000000001.playback.playPause')).to.deep.equal({
			deviceId: '020000000001',
			command: 'playPause',
		});
		expect(parseAppleTvCommandStateId('devices.appletv.020000000001.volume.level')).to.equal(undefined);
		expect(parseAppleTvCommandStateId('devices.appletv.020000000001.remote.playPause')).to.equal(undefined);
		expect(parseAppleTvCommandStateId('devices.appletv.020000000001.power.powerOn')).to.deep.equal({
			deviceId: '020000000001',
			command: 'powerOn',
		});
		expect(parseAppleTvCommandStateId('devices.appletv.020000000001.power.powerOff')).to.deep.equal({
			deviceId: '020000000001',
			command: 'powerOff',
		});
		expect(
			parseAppleTvCommandWrite('devices.appletv.020000000001.remote.select', { ack: false, val: true }),
		).to.deep.equal({
			deviceId: '020000000001',
			command: 'select',
		});
		expect(
			parseAppleTvCommandWrite('devices.appletv.020000000001.remote.select', { ack: true, val: true }),
		).to.equal(undefined);
		expect(
			parseAppleTvCommandWrite('devices.appletv.020000000001.remote.select', { ack: false, val: false }),
		).to.equal(undefined);
	});

	it('serializes concurrent commands per target', async () => {
		const target = discoveredTarget();
		const backend = new BlockingBackendFake();
		const runtime = new AppleRuntime(
			new ProjectionFake(),
			new CredentialStoreFake(credentials()),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target]),
			new PairingFake(),
			backend.factory,
		);
		await runtime.start();

		const first = runtime.executeRemote(target.deviceId, 'up');
		const second = runtime.executeRemote(target.deviceId, 'down');
		await nextTurn();
		expect(backend.commands).to.deep.equal(['up']);
		backend.release();
		await nextTurn();
		expect(backend.commands).to.deep.equal(['up', 'down']);
		backend.release();
		await Promise.all([first, second]);
		await runtime.stop();
	});

	it('retries an unexpectedly disconnected paired target after rediscovery', async () => {
		const target = discoveredTarget();
		const backend = new BackendFake();
		const runtime = new AppleRuntime(
			new ProjectionFake(),
			new CredentialStoreFake(credentials()),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([target]),
			new PairingFake(),
			backend.factory,
		);
		await runtime.start();
		await nextTurn();
		expect(backend.connectCount).to.equal(1);

		backend.emitConnection({
			state: 'recovering',
			online: false,
			airplay: false,
			companion: false,
			error: 'protocol_error',
		});
		await runtime.refresh();
		await nextTurn();
		expect(backend.connectCount).to.equal(2);
		await runtime.stop();
	});

	it('parses only bounded unacknowledged HomePod playback and volume writes', () => {
		expect(
			parseHomePodWrite('apple.0.devices.homepod.020000000002.playback.next', { ack: false, val: true }),
		).to.deep.equal({ deviceId: '020000000002', action: 'playback', command: 'next' });
		expect(parseHomePodWrite('devices.homepod.020000000002.volume.level', { ack: false, val: 42 })).to.deep.equal({
			deviceId: '020000000002',
			action: 'volume',
			percent: 42,
		});
		expect(
			parseHomePodWrite('devices.homepod.020000000002.volume.muted', { ack: false, val: false }),
		).to.deep.equal({ deviceId: '020000000002', action: 'muted', muted: false });
		expect(parseHomePodWrite('devices.homepod.020000000002.volume.level', { ack: false, val: 101 })).to.equal(
			undefined,
		);
		expect(parseHomePodWrite('devices.homepod.020000000002.playback.next', { ack: true, val: true })).to.equal(
			undefined,
		);
		expect(
			parseHomePodWrite('devices.homepod.020000000002.playback.unsupported', { ack: false, val: true }),
		).to.equal(undefined);
	});

	it('connects HomePod transiently, projects events, and serializes playback and volume commands', async () => {
		const homePod = discoveredHomePod();
		const details: Record<AppleDeviceClass, DiscoveredDeviceSummary[]> = {
			appletv: [],
			homepod: [summary('homepod', homePod.name, homePod.model, `device:${homePod.deviceId}`)],
			airplayReceiver: [],
		};
		const projection = new ProjectionFake();
		const backend = new HomePodBackendFake();
		const logs: string[] = [];
		const runtime = new AppleRuntime(
			projection,
			new CredentialStoreFake(),
			{ info: () => undefined, warn: message => logs.push(message), debug: message => logs.push(message) },
			60_000,
			testTimerScheduler,
			new DiscoveryFake([], { appletv: 0, homepod: 1, airplayReceiver: 0 }, details, [], [homePod]),
			new PairingFake(),
			new BackendFake().factory,
			undefined,
			backend.factory,
			new ManagedDeviceStoreFake([managedRecord('homepod', homePod.deviceId, homePod.name, homePod.model)]),
		);

		await runtime.start();
		await nextTurn();
		expect(backend.connectCount).to.equal(1);
		expect(projection.homePodCalls).to.deep.equal([[homePod]]);
		expect(projection.homePodConnections.at(-1)?.online).to.equal(true);
		expect(projection.homePodSnapshots.at(-1)?.capabilities).to.deep.equal({
			playback: true,
			nowPlaying: true,
			volume: true,
		});

		await runtime.executeHomePodPlayback(homePod.deviceId, 'next');
		await runtime.setHomePodVolume(homePod.deviceId, 35);
		await runtime.setHomePodMuted(homePod.deviceId, true);
		expect(backend.commands).to.deep.equal(['next']);
		expect(backend.volumeValues).to.deep.equal([35]);
		expect(backend.muteValues).to.deep.equal([true]);
		expect(projection.homePodCommandResults.map(result => result.status)).to.deep.equal([
			'success',
			'success',
			'success',
		]);
		expect(logs.join('\n')).not.to.include(homePod.name);
		expect(logs.join('\n')).not.to.include(homePod.airplay.address);

		await runtime.stop();
		expect(backend.disconnectCount).to.equal(1);
	});

	it('disconnects a HomePod after a successful absence scan and retains its projected root', async () => {
		const homePod = discoveredHomePod();
		const projection = new ProjectionFake();
		const backend = new HomePodBackendFake();
		const runtime = new AppleRuntime(
			projection,
			new CredentialStoreFake(),
			{ info: () => undefined, warn: () => undefined, debug: () => undefined },
			60_000,
			testTimerScheduler,
			new SequencedHomePodDiscoveryFake([[homePod], []]),
			new PairingFake(),
			new BackendFake().factory,
			undefined,
			backend.factory,
			new ManagedDeviceStoreFake([managedRecord('homepod', homePod.deviceId, homePod.name, homePod.model)]),
		);

		await runtime.start();
		await nextTurn();
		await runtime.refresh();
		await nextTurn();

		expect(backend.disconnectCount).to.equal(1);
		expect(projection.homePodCalls).to.deep.equal([[homePod], []]);
		let failure: unknown;
		try {
			await runtime.executeHomePodPlayback(homePod.deviceId, 'play');
		} catch (error) {
			failure = error;
		}
		expect(failure).to.be.instanceOf(Error).and.have.property('message', 'not_discovered');
		expect(projection.homePodCommandResults.at(-1)).to.deep.include({
			command: 'play',
			status: 'error',
			error: 'not_discovered',
		});
		await runtime.stop();
	});
});

class ProjectionFake {
	public discoveredCalls: { deviceId: string; paired: boolean }[] = [];
	public connectionCalls: AppleTvConnectionStatus[] = [];
	public snapshotCount = 0;
	public commandResults: { command: string; status: string; error?: string }[] = [];
	public appCount = 0;
	public appCommandResults: { action: string; status: string; error?: string }[] = [];
	public removedDeviceIds: string[] = [];
	public retainedPairedDeviceIds: string[][] = [];
	public receiverCalls: DiscoveredAirPlayReceiver[][] = [];
	public homePodCalls: DiscoveredHomePod[][] = [];
	public homePodConnections: HomePodConnectionStatus[] = [];
	public homePodSnapshots: HomePodSnapshot[] = [];
	public homePodCommandResults: { command: HomePodCommand; status: string; error?: string }[] = [];
	public retainedManagedHomePodIds: string[][] = [];
	public retainedManagedReceiverIds: string[][] = [];
	public removedHomePodIds: string[] = [];
	public removedReceiverIds: string[] = [];

	public initialize(): Promise<void> {
		return Promise.resolve();
	}
	public airPlayReceivers(targets: readonly DiscoveredAirPlayReceiver[], _seenAt: number): Promise<void> {
		this.receiverCalls.push([...targets]);
		return Promise.resolve();
	}
	public homePods(targets: readonly DiscoveredHomePod[], _seenAt: number): Promise<void> {
		this.homePodCalls.push([...targets]);
		return Promise.resolve();
	}
	public initializeHomePod(_deviceId: string): Promise<void> {
		return Promise.resolve();
	}
	public homePodConnection(_deviceId: string, status: HomePodConnectionStatus): Promise<void> {
		this.homePodConnections.push(status);
		return Promise.resolve();
	}
	public homePodSnapshot(_deviceId: string, snapshot: HomePodSnapshot): Promise<void> {
		this.homePodSnapshots.push(snapshot);
		return Promise.resolve();
	}
	public homePodCommandStarted(_deviceId: string, _command: HomePodCommand): Promise<void> {
		return Promise.resolve();
	}
	public homePodCommandResult(
		_deviceId: string,
		command: HomePodCommand,
		status: 'success' | 'error',
		error?: string,
	): Promise<void> {
		this.homePodCommandResults.push({ command, status, error });
		return Promise.resolve();
	}
	public discoveryRunning(_running: boolean): Promise<void> {
		return Promise.resolve();
	}
	public discovered(target: DiscoveredAppleTv, paired: boolean, _remoteAvailable: boolean): Promise<void> {
		this.discoveredCalls.push({ deviceId: target.deviceId, paired });
		return Promise.resolve();
	}
	public initializeDevice(_deviceId: string, _state: 'discovered' | 'pairingRequired'): Promise<void> {
		return Promise.resolve();
	}
	public connection(_deviceId: string, status: AppleTvConnectionStatus): Promise<void> {
		this.connectionCalls.push(status);
		return Promise.resolve();
	}
	public snapshot(_deviceId: string, _snapshot: AppleTvSnapshot): Promise<void> {
		this.snapshotCount += 1;
		return Promise.resolve();
	}
	public apps(_deviceId: string, apps: readonly { bundleId: string; name: string }[]): Promise<void> {
		this.appCount = apps.length;
		return Promise.resolve();
	}
	public appCommandStarted(_deviceId: string, _action: 'refresh' | 'launch' | 'openurl'): Promise<void> {
		return Promise.resolve();
	}
	public appCommandResult(
		_deviceId: string,
		action: 'refresh' | 'launch' | 'openurl',
		status: 'success' | 'error',
		error?: string,
	): Promise<void> {
		this.appCommandResults.push({ action, status, error });
		return Promise.resolve();
	}
	public commandStarted(_deviceId: string, _command: string): Promise<void> {
		return Promise.resolve();
	}
	public commandResult(
		_deviceId: string,
		command: string,
		status: 'success' | 'error',
		error?: string,
	): Promise<void> {
		this.commandResults.push({ command, status, error });
		return Promise.resolve();
	}
	public aggregate(_deviceCounts: AppleDeviceCounts, _connected: boolean, _error?: string): Promise<void> {
		return Promise.resolve();
	}
	public adapterConnection(_connected: boolean): Promise<void> {
		return Promise.resolve();
	}
	public removeDevice(deviceId: string): Promise<void> {
		this.removedDeviceIds.push(deviceId);
		return Promise.resolve();
	}
	public removeUnpairedDevices(pairedDeviceIds: readonly string[]): Promise<void> {
		this.retainedPairedDeviceIds.push([...pairedDeviceIds]);
		return Promise.resolve();
	}
	public retainManagedHomePods(deviceIds: readonly string[]): Promise<void> {
		this.retainedManagedHomePodIds.push([...deviceIds]);
		return Promise.resolve();
	}
	public retainManagedAirPlayReceivers(deviceIds: readonly string[]): Promise<void> {
		this.retainedManagedReceiverIds.push([...deviceIds]);
		return Promise.resolve();
	}
	public removeHomePod(deviceId: string): Promise<void> {
		this.removedHomePodIds.push(deviceId);
		return Promise.resolve();
	}
	public removeAirPlayReceiver(deviceId: string): Promise<void> {
		this.removedReceiverIds.push(deviceId);
		return Promise.resolve();
	}
}

class TimerSchedulerFake implements TimerScheduler {
	public readonly intervalDelays: number[] = [];
	public readonly activeIntervals = new Set<TimerHandle>();
	private sequence = 0;

	public scheduleTimeout(_callback: () => void, _delayMs: number): TimerHandle {
		return { id: ++this.sequence, kind: 'timeout' };
	}

	public cancelTimeout(_handle: TimerHandle): void {}

	public scheduleInterval(_callback: () => void, delayMs: number): TimerHandle {
		const handle = { id: ++this.sequence, kind: 'interval' };
		this.intervalDelays.push(delayMs);
		this.activeIntervals.add(handle);
		return handle;
	}

	public cancelInterval(handle: TimerHandle): void {
		this.activeIntervals.delete(handle);
	}
}

class CredentialStoreFake {
	public initialized = false;
	public savedDeviceId: string | undefined;
	private readonly values = new Map<string, PairingCredentials>();

	public constructor(value?: PairingCredentials) {
		if (value !== undefined) {
			this.values.set(discoveredTarget().deviceId, value);
		}
	}

	public initialize(): Promise<void> {
		this.initialized = true;
		return Promise.resolve();
	}
	public get(deviceId: string): PairingCredentials | undefined {
		return this.values.get(deviceId.toUpperCase());
	}
	public deviceIds(): string[] {
		return [...this.values.keys()].sort();
	}
	public set(deviceId: string, value: PairingCredentials): Promise<void> {
		this.savedDeviceId = deviceId;
		this.values.set(deviceId.toUpperCase(), value);
		return Promise.resolve();
	}
	public remove(deviceId: string): Promise<boolean> {
		const removed = this.values.delete(deviceId.toUpperCase());
		return Promise.resolve(removed);
	}
	public add(deviceId: string, value: PairingCredentials): Promise<void> {
		this.values.set(deviceId.toUpperCase(), value);
		return Promise.resolve();
	}
}

class DiscoveryFake {
	public cancelled = false;
	public constructor(
		private readonly values: DiscoveredAppleTv[],
		private readonly deviceCounts: AppleDeviceCounts = {
			appletv: values.length,
			homepod: 0,
			airplayReceiver: 0,
		},
		private readonly deviceDetails: Record<AppleDeviceClass, DiscoveredDeviceSummary[]> = {
			appletv: values.map(target => summary('appletv', target.name, target.model, `device:${target.deviceId}`)),
			homepod: [],
			airplayReceiver: [],
		},
		private readonly airplayReceivers: DiscoveredAirPlayReceiver[] = [],
		private readonly homePods: DiscoveredHomePod[] = [],
	) {}
	public discover(): Promise<AppleDiscoverySnapshot> {
		return Promise.resolve({
			devices: this.values,
			homePods: this.homePods,
			airplayReceivers: this.airplayReceivers,
			deviceCounts: this.deviceCounts,
			deviceDetails: this.deviceDetails,
		});
	}
	public cancel(): void {
		this.cancelled = true;
	}
}

class SequencedHomePodDiscoveryFake {
	public cancelled = false;

	public constructor(private readonly scans: DiscoveredHomePod[][]) {}

	public discover(): Promise<AppleDiscoverySnapshot> {
		const homePods = this.scans.shift() ?? [];
		return Promise.resolve({
			devices: [],
			homePods,
			airplayReceivers: [],
			deviceCounts: { appletv: 0, homepod: homePods.length, airplayReceiver: 0 },
			deviceDetails: {
				appletv: [],
				homepod: homePods.map(target =>
					summary('homepod', target.name, target.model, `device:${target.deviceId}`),
				),
				airplayReceiver: [],
			},
		});
	}

	public cancel(): void {
		this.cancelled = true;
	}
}

class DeviceSettingsFake {
	private readonly disabled: Set<string>;

	public constructor(
		disabledDeviceIds: readonly string[] = [],
		private readonly failRemove = false,
	) {
		this.disabled = new Set(disabledDeviceIds.map(deviceId => deviceId.toUpperCase()));
	}

	public initialize(): Promise<void> {
		return Promise.resolve();
	}
	public isEnabled(deviceId: string): boolean {
		return !this.disabled.has(deviceId.toUpperCase());
	}
	public setEnabled(deviceId: string, enabled: boolean): Promise<void> {
		if (enabled) {
			this.disabled.delete(deviceId.toUpperCase());
		} else {
			this.disabled.add(deviceId.toUpperCase());
		}
		return Promise.resolve();
	}
	public remove(deviceId: string): Promise<void> {
		if (this.failRemove) {
			return Promise.reject(new Error('device_settings_write_failed'));
		}
		this.disabled.delete(deviceId.toUpperCase());
		return Promise.resolve();
	}
}

class ManagedDeviceStoreFake {
	private readonly devices = new Map<string, ManagedDiscoveryDeviceRecord>();

	public constructor(records: readonly ManagedDiscoveryDeviceRecord[] = []) {
		for (const record of records) {
			this.devices.set(`${record.deviceClass}:${record.deviceId}`, { ...record });
		}
	}

	public initialize(): Promise<void> {
		return Promise.resolve();
	}

	public list(deviceClass: ManagedDiscoveryDeviceClass): ManagedDiscoveryDeviceRecord[] {
		return [...this.devices.values()]
			.filter(device => device.deviceClass === deviceClass)
			.map(device => ({ ...device }));
	}

	public has(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): boolean {
		return this.devices.has(`${deviceClass}:${deviceId.toUpperCase()}`);
	}

	public isEnabled(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): boolean {
		return this.devices.get(`${deviceClass}:${deviceId.toUpperCase()}`)?.enabled ?? false;
	}

	public manage(
		deviceClass: ManagedDiscoveryDeviceClass,
		device: Pick<ManagedDiscoveryDeviceRecord, 'deviceId' | 'name' | 'model'>,
	): Promise<void> {
		const deviceId = device.deviceId.toUpperCase();
		this.devices.set(`${deviceClass}:${deviceId}`, { ...device, deviceClass, deviceId, enabled: true });
		return Promise.resolve();
	}

	public observe(
		deviceClass: ManagedDiscoveryDeviceClass,
		device: Pick<ManagedDiscoveryDeviceRecord, 'deviceId' | 'name' | 'model'>,
	): Promise<void> {
		const key = `${deviceClass}:${device.deviceId.toUpperCase()}`;
		const current = this.devices.get(key);
		if (current !== undefined) {
			this.devices.set(key, { ...current, name: device.name, model: device.model });
		}
		return Promise.resolve();
	}

	public setEnabled(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string, enabled: boolean): Promise<void> {
		const key = `${deviceClass}:${deviceId.toUpperCase()}`;
		const current = this.devices.get(key);
		if (current === undefined) {
			return Promise.reject(new Error('managed_device_not_found'));
		}
		this.devices.set(key, { ...current, enabled });
		return Promise.resolve();
	}

	public remove(deviceClass: ManagedDiscoveryDeviceClass, deviceId: string): Promise<boolean> {
		return Promise.resolve(this.devices.delete(`${deviceClass}:${deviceId.toUpperCase()}`));
	}
}

class PairingFake {
	public receivedPin: string | undefined;
	private state: 'idle' | 'pinRequired' | 'paired' = 'idle';
	public start(_target: DiscoveredAppleTv): Promise<void> {
		this.state = 'pinRequired';
		return Promise.resolve();
	}
	public finish(_deviceId: string, pin: string): Promise<PairingCredentials> {
		this.receivedPin = pin;
		this.state = 'paired';
		return Promise.resolve(credentials());
	}
	public cancel(): void {
		this.state = 'idle';
	}
	public status(): { status: 'idle' | 'pinRequired' | 'paired' } {
		return { status: this.state };
	}
}

class BackendFake {
	public connectCount = 0;
	public disconnectCount = 0;
	public commands: AppleTvRemoteCommand[] = [];
	public launchedApps: string[] = [];
	public openedUrls: string[] = [];
	private callbacks: Parameters<AppleTvBackendFactory>[1] | undefined;
	public factory: AppleTvBackendFactory = (_target, callbacks) => {
		this.callbacks = callbacks;
		return {
			updateTarget: () => undefined,
			connect: () => {
				this.connectCount += 1;
				callbacks.onSnapshot({
					...emptyAppleTvSnapshot(),
					capabilities: {
						remote: true,
						playback: true,
						power: true,
						nowPlaying: true,
						volume: false,
						apps: true,
					},
				});
				callbacks.onConnection({ state: 'online', online: true, airplay: true, companion: true });
				return Promise.resolve();
			},
			executeRemote: command => {
				this.commands.push(command);
				return Promise.resolve();
			},
			listApps: () =>
				Promise.resolve([
					{ bundleId: 'com.example.First', name: 'First' },
					{ bundleId: 'com.example.Second', name: 'Second' },
				]),
			launchApp: bundleId => {
				this.launchedApps.push(bundleId);
				return Promise.resolve();
			},
			openUrl: url => {
				this.openedUrls.push(url);
				return Promise.resolve();
			},
			disconnect: () => {
				this.disconnectCount += 1;
				return Promise.resolve();
			},
		};
	};

	public emitConnection(status: AppleTvConnectionStatus): void {
		this.callbacks?.onConnection(status);
	}
}

class HomePodBackendFake {
	public connectCount = 0;
	public disconnectCount = 0;
	public commands: string[] = [];
	public volumeValues: number[] = [];
	public muteValues: boolean[] = [];
	public factory: HomePodBackendFactory = (_target, callbacks) => ({
		updateTarget: () => undefined,
		connect: () => {
			this.connectCount += 1;
			callbacks.onConnection({ state: 'connecting', online: false, pairing: 'pairing' });
			callbacks.onSnapshot({
				title: '',
				artist: '',
				album: '',
				duration: 0,
				position: 0,
				isPlaying: false,
				volumeAvailable: true,
				volume: 50,
				muted: false,
				capabilities: { playback: true, nowPlaying: true, volume: true },
			});
			callbacks.onConnection({ state: 'online', online: true, pairing: 'paired' });
			return Promise.resolve();
		},
		executePlayback: command => {
			this.commands.push(command);
			return Promise.resolve();
		},
		setVolume: percent => {
			this.volumeValues.push(percent);
			return Promise.resolve();
		},
		setMuted: muted => {
			this.muteValues.push(muted);
			return Promise.resolve();
		},
		disconnect: () => {
			this.disconnectCount += 1;
			callbacks.onConnection({ state: 'unavailable', online: false, pairing: 'idle' });
			return Promise.resolve();
		},
	});
}

class BlockingBackendFake {
	public commands: AppleTvRemoteCommand[] = [];
	private releases: (() => void)[] = [];
	public factory: AppleTvBackendFactory = (_target, callbacks) => ({
		updateTarget: () => undefined,
		connect: () => {
			callbacks.onConnection({ state: 'online', online: true, airplay: true, companion: true });
			return Promise.resolve();
		},
		executeRemote: command => {
			this.commands.push(command);
			return new Promise<void>(resolve => this.releases.push(resolve));
		},
		listApps: () => Promise.resolve([]),
		launchApp: () => Promise.resolve(),
		openUrl: () => Promise.resolve(),
		disconnect: () => Promise.resolve(),
	});

	public release(): void {
		this.releases.shift()?.();
	}
}

/** Creates neutral protocol credentials without installation data. */
function credentials(): PairingCredentials {
	return {
		accessoryIdentifier: 'neutral-accessory',
		accessoryLongTermPublicKey: Buffer.alloc(32, 1),
		pairingId: Buffer.alloc(16, 2),
		publicKey: Buffer.alloc(32, 3),
		secretKey: Buffer.alloc(64, 4),
	};
}

/** Creates a standards-reserved neutral discovery target. */
function discoveredTarget(): DiscoveredAppleTv {
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
		companionLink: {
			id: 'neutral-companion',
			fqdn: 'neutral.example.test',
			address: '192.0.2.10',
			modelName: 'AppleTV14,1',
			familyName: null,
			service: { port: 49152, protocol: 'tcp', type: '_companion-link._tcp.local' },
			txt: { rpBA: '02:00:00:00:00:01' },
		},
	};
}

/** Creates a standards-reserved stable generic receiver target. */
function discoveredReceiver(): DiscoveredAirPlayReceiver {
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

/** Creates a standards-reserved strongly identified HomePod target. */
function discoveredHomePod(): DiscoveredHomePod {
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

function managedRecord(
	deviceClass: ManagedDiscoveryDeviceClass,
	deviceId: string,
	name: string,
	model: string,
	enabled = true,
): ManagedDiscoveryDeviceRecord {
	return { deviceClass, deviceId, name, model, enabled };
}

/**
 * Creates one redacted neutral discovery summary.
 *
 * @param deviceClass - Exclusive neutral fixture class.
 * @param name - Neutral display name.
 * @param model - Neutral reported model.
 * @param identity - Neutral scan identity.
 */
function summary(
	deviceClass: AppleDeviceClass,
	name: string,
	model: string,
	identity: string,
): DiscoveredDeviceSummary {
	return { identity, deviceClass, name, model };
}

/** Allows queued event projections to settle. */
async function nextTurn(): Promise<void> {
	await new Promise<void>(resolve => setImmediate(resolve));
}
