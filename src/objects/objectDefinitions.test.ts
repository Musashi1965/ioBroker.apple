/// <reference types="mocha" />

import { expect } from 'chai';

import type { DiscoveredAirPlayReceiver, DiscoveredAppleTv, DiscoveredHomePod } from '../backends/apple/discoveryTypes';
import {
	airPlayReceiverDisplayName,
	airPlayReceiverObjectDefinitions,
	airPlayReceiverObjectId,
	appleTvAppsObjectDefinitions,
	appleTvAppEntryObjectDefinitions,
	appEntryKeys,
	appleTvCommandStateId,
	appleTvObjectDefinitions,
	APPLE_TV_COMMANDS,
	deviceDisplayName,
	deviceObjectId,
	homePodControlObjectDefinitions,
	homePodDisplayName,
	homePodObjectDefinitions,
	homePodObjectId,
	HOME_POD_PLAYBACK_COMMANDS,
	instanceObjectDefinitions,
	NAVIGATION_COMMANDS,
	PLAYBACK_COMMANDS,
	POWER_COMMANDS,
} from './objectDefinitions';

describe('Apple object definitions', () => {
	it('defines every frozen instance state with precise metadata', () => {
		const definitions = instanceObjectDefinitions();
		expect(definitions.map(definition => definition.id)).to.deep.equal([
			'info',
			'info.connection',
			'info.discoveryRunning',
			'info.lastDiscovery',
			'info.deviceCount',
			'info.lastError',
			'devices',
			'devices.appletv',
			'devices.appletv.info',
			'devices.appletv.info.deviceCount',
			'devices.homepod',
			'devices.homepod.info',
			'devices.homepod.info.deviceCount',
			'devices.airplayReceiver',
			'devices.airplayReceiver.info',
			'devices.airplayReceiver.info.deviceCount',
		]);
		for (const definition of definitions.filter(entry => entry.object.type === 'state')) {
			expect(definition.object.common).to.include({ read: true, write: false });
		}
		expect(definitions.find(definition => definition.id === 'devices')?.object).to.include({ type: 'folder' });
		expect(definitions.find(definition => definition.id === 'devices.appletv')?.object.common?.name).to.equal(
			'Apple TV',
		);
	});

	it('uses stable technical identity and exposes remote writes only with capability', () => {
		const withoutRemote = appleTvObjectDefinitions(target(), false);
		const withNavigation = appleTvObjectDefinitions(target(), true);
		const withPower = appleTvObjectDefinitions(target(), true, true);

		expect(deviceObjectId('02:00:00:00:00:01')).to.equal('devices.appletv.020000000001');
		expect(withoutRemote.some(definition => definition.id.includes('.remote.'))).to.equal(false);
		for (const command of NAVIGATION_COMMANDS) {
			expect(withNavigation.some(entry => entry.id.endsWith(`.remote.${command}`))).to.equal(true);
		}
		for (const command of PLAYBACK_COMMANDS) {
			expect(withNavigation.some(entry => entry.id.endsWith(`.playback.${command}`))).to.equal(true);
		}
		for (const command of POWER_COMMANDS) {
			expect(withNavigation.some(entry => entry.id.endsWith(`.power.${command}`))).to.equal(false);
		}
		for (const command of APPLE_TV_COMMANDS) {
			const definition = withPower.find(entry => entry.id === appleTvCommandStateId('020000000001', command));
			expect(definition?.object.type).to.equal('state');
			expect(definition?.object.common).to.include({
				type: 'boolean',
				role: 'button',
				read: false,
				write: true,
			});
		}
	});

	it('uses a readable device label without changing its technical identity', () => {
		const definitions = appleTvObjectDefinitions(target(), false);
		const device = definitions.find(definition => definition.id === 'devices.appletv.020000000001');

		expect(device?.object.common?.name).to.equal('AppleTV Neutral Living Room');
		expect(deviceDisplayName(' Apple TV Bedroom ')).to.equal('Apple TV Bedroom');
	});

	it('defines a stable read-only generic receiver contract', () => {
		const definitions = airPlayReceiverObjectDefinitions(receiverTarget());
		expect(airPlayReceiverObjectId('02:00:00:00:00:03')).to.equal('devices.airplayReceiver.020000000003');
		expect(definitions.map(definition => definition.id)).to.deep.equal([
			'devices.airplayReceiver.020000000003',
			'devices.airplayReceiver.020000000003.info',
			'devices.airplayReceiver.020000000003.info.name',
			'devices.airplayReceiver.020000000003.info.type',
			'devices.airplayReceiver.020000000003.info.model',
			'devices.airplayReceiver.020000000003.info.deviceId',
			'devices.airplayReceiver.020000000003.info.lastSeen',
			'devices.airplayReceiver.020000000003.discovery',
			'devices.airplayReceiver.020000000003.discovery.available',
			'devices.airplayReceiver.020000000003.services',
			'devices.airplayReceiver.020000000003.services.airplay',
			'devices.airplayReceiver.020000000003.services.raop',
		]);
		for (const definition of definitions.filter(entry => entry.object.type === 'state')) {
			expect(definition.object.common).to.include({ read: true, write: false });
		}
		expect(definitions[0]?.object.native).to.deep.equal({
			deviceId: '020000000003',
			deviceType: 'airplayReceiver',
		});
		expect(airPlayReceiverDisplayName(' AirPlay Receiver Studio ')).to.equal('AirPlay Receiver Studio');
	});

	it('defines a stable HomePod contract and capability-gated controls', () => {
		const base = homePodObjectDefinitions(homePodTarget());
		const unavailable = homePodControlObjectDefinitions('020000000002', false, false);
		const available = homePodControlObjectDefinitions('020000000002', true, true);

		expect(homePodObjectId('02:00:00:00:00:02')).to.equal('devices.homepod.020000000002');
		expect(base[0]?.object.native).to.deep.equal({ deviceId: '020000000002', deviceType: 'homepod' });
		expect(base.find(entry => entry.id.endsWith('.pairing.mode'))?.object.common).to.include({
			read: true,
			write: false,
			def: 'transient',
		});
		expect(unavailable.some(entry => entry.id.includes('.playback.'))).to.equal(false);
		expect(unavailable.find(entry => entry.id.endsWith('.volume.level'))?.object.common).to.include({
			write: false,
		});
		for (const command of HOME_POD_PLAYBACK_COMMANDS) {
			expect(available.find(entry => entry.id.endsWith(`.playback.${command}`))?.object.common).to.include({
				type: 'boolean',
				role: 'button',
				read: false,
				write: true,
			});
		}
		expect(available.find(entry => entry.id.endsWith('.volume.level'))?.object.common).to.include({ write: true });
		expect(available.find(entry => entry.id.endsWith('.volume.muted'))?.object.common).to.include({ write: true });
		expect(homePodDisplayName(' HomePod Office ')).to.equal('HomePod Office');
	});

	it('defines normalized units and ranges', () => {
		const definitions = appleTvObjectDefinitions(target(), false);
		const volume = definitions.find(entry => entry.id.endsWith('.volume.level'));
		const duration = definitions.find(entry => entry.id.endsWith('.nowPlaying.duration'));
		expect(volume?.object.common).to.include({ min: 0, max: 100, unit: '%' });
		expect(duration?.object.common).to.include({ min: 0, unit: 's' });
	});

	it('keeps the app catalog read-only and exposes only capability-gated app controls', () => {
		const base = appleTvObjectDefinitions(target(), false);
		const controls = appleTvAppsObjectDefinitions('020000000001');
		const catalog = base.find(entry => entry.id.endsWith('.apps.available'));
		const refresh = controls.find(entry => entry.id.endsWith('.apps.refresh'));
		const openUrl = controls.find(entry => entry.id.endsWith('.apps.openurl'));

		expect(catalog?.object.common).to.include({ type: 'string', role: 'json', read: true, write: false });
		expect(refresh?.object.common).to.include({ type: 'boolean', role: 'button', read: false, write: true });
		expect(openUrl?.object.common).to.include({ type: 'string', role: 'text', read: false, write: true });
		expect(controls.some(entry => entry.id.endsWith('.apps.launch'))).to.equal(false);
		const app = {
			bundleId: 'com.example.Player',
			name: 'Example Player',
		};
		const entryKey = appEntryKeys([app]).get(app.bundleId);
		expect(entryKey).to.equal('Example_Player');
		const entry = appleTvAppEntryObjectDefinitions('020000000001', app, entryKey!);
		expect(entry.map(item => item.id)).to.deep.equal([
			'devices.appletv.020000000001.apps.entries.Example_Player',
			'devices.appletv.020000000001.apps.entries.Example_Player.name',
			'devices.appletv.020000000001.apps.entries.Example_Player.bundleId',
			'devices.appletv.020000000001.apps.entries.Example_Player.launch',
		]);
	});

	it('adds deterministic short suffixes only when readable app keys collide', () => {
		const apps = [
			{ bundleId: 'com.example.First', name: 'Apple TV+' },
			{ bundleId: 'com.example.Second', name: 'Apple-TV' },
			{ bundleId: 'com.example.Third', name: 'ZDFmediathek' },
		];
		const keys = appEntryKeys(apps);
		const first = keys.get('com.example.First');
		const second = keys.get('com.example.Second');

		expect(first).to.match(/^Apple_TV_[0-9a-f]{8}$/);
		expect(second).to.match(/^Apple_TV_[0-9a-f]{8}$/);
		expect(first).not.to.equal(second);
		expect(keys.get('com.example.Third')).to.equal('ZDFmediathek');
		expect(appEntryKeys([...apps].reverse())).to.deep.equal(keys);
	});
});

/** Creates one neutral target without installation data. */
function target(): DiscoveredAppleTv {
	return {
		deviceId: '020000000001',
		name: 'Neutral Living Room',
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

/** Creates a neutral stable receiver target. */
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

/** Creates a neutral strongly identified HomePod target. */
function homePodTarget(): DiscoveredHomePod {
	return {
		deviceId: '020000000002',
		name: 'Neutral Office',
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
