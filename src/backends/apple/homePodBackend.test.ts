/// <reference types="mocha" />

import { EventEmitter } from 'node:events';

import { expect } from 'chai';
import type { DiscoveryResult } from '@basmilius/apple-sdk' with { 'resolution-mode': 'import' };

import type { HomePodConnectionStatus, HomePodSnapshot } from '../../domain/homePod';
import { testTimerScheduler } from '../../../test/timerScheduler';
import type { DiscoveredHomePod } from './discoveryTypes';
import { diagnosticErrorKind, HomePodBackend, HomePodBackendError, type HomePodDeviceFactory } from './homePodBackend';

describe('HomePodBackend', () => {
	it('connects with transient pairing, projects push state, and controls playback and volume', async () => {
		const device = new HomePodDeviceFake();
		const connections: HomePodConnectionStatus[] = [];
		const snapshots: HomePodSnapshot[] = [];
		const logs: string[] = [];
		const backend = new HomePodBackend(
			target(),
			{
				onConnection: status => connections.push(status),
				onSnapshot: snapshot => snapshots.push(snapshot),
			},
			{ debug: message => logs.push(message) },
			testTimerScheduler,
			() => Promise.resolve(device),
		);

		await backend.connect();
		expect(device.connectCount).to.equal(1);
		expect(connections).to.deep.equal([
			{ state: 'connecting', online: false, pairing: 'pairing' },
			{ state: 'online', online: true, pairing: 'paired' },
		]);
		expect(snapshots.at(-1)?.capabilities).to.deep.equal({ playback: true, nowPlaying: true, volume: true });

		await backend.executePlayback('next');
		await backend.setVolume(42);
		await backend.setMuted(true);
		await backend.setMuted(false);
		expect(device.commands).to.deep.equal(['next']);
		expect(device.volumeValues).to.deep.equal([0.42]);
		expect(device.muteValues).to.deep.equal([true, false]);

		device.state.title = 'Private title that must not enter logs';
		device.state.emit('nowPlayingChanged');
		expect(snapshots.at(-1)?.title).to.equal('Private title that must not enter logs');
		expect(logs.join('\n')).not.to.include('Private title');
		expect(logs.join('\n')).not.to.include(target().airplay.address);

		await backend.disconnect();
		expect(device.disconnectCount).to.equal(1);
		expect(connections.at(-1)).to.deep.equal({ state: 'unavailable', online: false, pairing: 'idle' });
	});

	it('normalizes connection errors and logs only a safe error class', async () => {
		const logs: string[] = [];
		const factory: HomePodDeviceFactory = () =>
			Promise.reject(new PrivateNetworkFailure('failed at 192.0.2.44 with private-token-value'));
		const backend = new HomePodBackend(
			target(),
			{ onConnection: () => undefined, onSnapshot: () => undefined },
			{ debug: message => logs.push(message) },
			testTimerScheduler,
			factory,
		);

		let failure: unknown;
		try {
			await backend.connect();
		} catch (error) {
			failure = error;
		}
		expect(failure).to.be.instanceOf(HomePodBackendError).and.have.property('code', 'protocol_error');
		expect(logs.join('\n')).to.include('kind=PrivateNetworkFailure');
		expect(logs.join('\n')).not.to.include('192.0.2.44');
		expect(logs.join('\n')).not.to.include('private-token-value');
		expect(diagnosticErrorKind({ name: 'unsafe address' })).to.equal('Error');
	});

	it('bounds a hanging transient connection and tears the SDK device down', async () => {
		const device = new HomePodDeviceFake();
		device.connect = () => new Promise<void>(() => undefined);
		const backend = new HomePodBackend(
			target(),
			{ onConnection: () => undefined, onSnapshot: () => undefined },
			{ debug: () => undefined },
			testTimerScheduler,
			() => Promise.resolve(device),
			5,
		);

		let failure: unknown;
		try {
			await backend.connect();
		} catch (error) {
			failure = error;
		}
		expect(failure).to.be.instanceOf(HomePodBackendError).and.have.property('code', 'timeout');
		expect(device.disconnectCount).to.equal(1);
	});
});

class PrivateNetworkFailure extends Error {
	public override readonly name = 'PrivateNetworkFailure';
}

class HomePodStateFake extends EventEmitter {
	public title = '';
	public artist = '';
	public album = '';
	public duration = 180;
	public elapsedTime = 12;
	public isPlaying = true;
	public volumeAvailable = true;
	public volume = 0.5;
	public isMuted = false;
}

class HomePodDeviceFake extends EventEmitter {
	public discoveryResult = target().airplay as unknown as DiscoveryResult;
	public isConnected = false;
	public readonly capabilities = {
		supportsHangdogRemoteControl: false,
		supportsUnifiedMediaControl: true,
		supportsTransientPairing: true,
	};
	public readonly state = new HomePodStateFake();
	public readonly commands: string[] = [];
	public readonly volumeValues: number[] = [];
	public readonly muteValues: boolean[] = [];
	public connectCount = 0;
	public disconnectCount = 0;
	public readonly playback = {
		play: () => this.command('play'),
		pause: () => this.command('pause'),
		playPause: () => this.command('playPause'),
		stop: () => this.command('stop'),
		next: () => this.command('next'),
		previous: () => this.command('previous'),
	};
	public readonly volume = {
		set: (value: number) => {
			this.volumeValues.push(value);
			return Promise.resolve();
		},
		mute: () => {
			this.muteValues.push(true);
			return Promise.resolve();
		},
		unmute: () => {
			this.muteValues.push(false);
			return Promise.resolve();
		},
	};

	public connect(): Promise<void> {
		this.connectCount += 1;
		this.isConnected = true;
		return Promise.resolve();
	}

	public disconnect(): void {
		this.disconnectCount += 1;
		this.isConnected = false;
	}

	private command(value: string): Promise<void> {
		this.commands.push(value);
		return Promise.resolve();
	}
}

function target(): DiscoveredHomePod {
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
