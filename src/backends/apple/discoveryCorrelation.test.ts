/// <reference types="mocha" />

import { expect } from 'chai';

import {
	correlateAirPlayReceivers,
	correlateAppleTvs,
	correlateHomePods,
	summarizeAppleDiscovery,
} from './discoveryCorrelation';
import type { AppleDiscoveryService, CombinedAppleDiscovery } from './discoveryTypes';

describe('Apple TV discovery correlation', () => {
	it('correlates AirPlay, Companion, and RAOP without names or addresses as identity', () => {
		const firstAirplay = service('_airplay._tcp.local', 'first-airplay', 'AppleTV14,1', {
			deviceid: '02:00:00:00:00:01',
			psi: '02000000000000000000000000000001',
			pk: '01'.repeat(32),
		});
		const firstCompanion = service('_companion-link._tcp.local', 'first-companion', 'AppleTV14,1', {
			rpMRtID: '02000000000000000000000000000001',
		});
		const firstRaop = service('_raop._tcp.local', '020000000001@neutral', 'AppleTV14,1', {
			pk: '01'.repeat(32),
		});
		const secondAirplay = service('_airplay._tcp.local', 'second-airplay', 'AppleTV11,1', {
			deviceid: '02:00:00:00:00:02',
			psi: '02000000000000000000000000000002',
		});
		const results: CombinedAppleDiscovery[] = [
			{ name: 'Neutral Living Room', airplay: firstAirplay },
			{ name: 'Unrelated Name', companionLink: firstCompanion },
			{ name: 'Different Name', raop: firstRaop },
			{ name: 'Neutral Guest Room', airplay: secondAirplay },
		];

		const devices = correlateAppleTvs(results);

		expect(devices.map(device => device.deviceId)).to.deep.equal(['020000000001', '020000000002']);
		expect(devices[0].companionLink).to.equal(firstCompanion);
		expect(devices[0].raop).to.equal(firstRaop);
		expect(devices[1].companionLink).to.equal(undefined);
	});

	it('rejects unrelated services and unsupported models', () => {
		const hap = service('_hap._tcp.local', 'hap', 'AppleTV14,1', { deviceid: '02:00:00:00:00:01' });
		const receiver = service('_airplay._tcp.local', 'receiver', 'NeutralReceiver1,1', {
			deviceid: '02:00:00:00:00:02',
		});

		expect(
			correlateAppleTvs([
				{ name: 'Neutral HAP', airplay: hap },
				{ name: 'Neutral Receiver', airplay: receiver },
			]),
		).to.deep.equal([]);
	});

	it('counts Apple TV, HomePod, and generic AirPlay receivers exclusively', () => {
		const appleTv = service('_airplay._tcp.local', 'appletv', 'AppleTV14,1', {
			deviceid: '02:00:00:00:00:01',
		});
		const homePod = service('_airplay._tcp.local', 'homepod', 'AudioAccessory6,1', {
			deviceid: '02:00:00:00:00:02',
		});
		const receiverAirPlay = service('_airplay._tcp.local', 'receiver-airplay', 'NeutralReceiver1,1', {
			deviceid: '02:00:00:00:00:03',
		});
		const receiverRaop = service('_raop._tcp.local', '020000000003@receiver', 'NeutralReceiver1,1', {});
		const duplicateGeneric = service('_airplay._tcp.local', 'duplicate-generic', 'NeutralReceiver1,1', {
			deviceid: '02:00:00:00:00:01',
		});
		const unrelated = service('_hap._tcp.local', 'unrelated', 'AudioAccessory6,1', {});

		const discovery = summarizeAppleDiscovery([
			{ name: 'Neutral Apple TV', airplay: appleTv },
			{ name: 'Neutral HomePod', airplay: homePod },
			{ name: 'Neutral Receiver', airplay: receiverAirPlay },
			{ name: 'Neutral Receiver RAOP', raop: receiverRaop },
			{ name: 'Duplicate lower-priority classification', airplay: duplicateGeneric },
			{ name: 'Unrelated HAP', airplay: unrelated },
		]);

		expect(discovery.devices.map(device => device.deviceId)).to.deep.equal(['020000000001']);
		expect(discovery.homePods.map(device => device.deviceId)).to.deep.equal(['020000000002']);
		expect(discovery.deviceCounts).to.deep.equal({ appletv: 1, homepod: 1, airplayReceiver: 1 });
		expect(discovery.deviceDetails.homepod).to.deep.equal([
			{
				identity: 'device:020000000002',
				deviceClass: 'homepod',
				name: 'Neutral HomePod',
				model: 'AudioAccessory6,1',
			},
		]);
		expect(discovery.deviceDetails.airplayReceiver).to.deep.equal([
			{
				identity: 'device:020000000003',
				deviceClass: 'airplayReceiver',
				name: 'Neutral Receiver',
				model: 'NeutralReceiver1,1',
			},
		]);
		expect(discovery.airplayReceivers).to.have.length(1);
		expect(discovery.airplayReceivers[0]).to.include({
			deviceId: '020000000003',
			name: 'Neutral Receiver',
			model: 'NeutralReceiver1,1',
		});
		expect(discovery.airplayReceivers[0]?.airplay).to.equal(receiverAirPlay);
		expect(discovery.airplayReceivers[0]?.raop).to.equal(receiverRaop);
	});

	it('promotes only strongly identified HomePods with AirPlay and correlates optional RAOP', () => {
		const airplay = service('_airplay._tcp.local', 'homepod-airplay', 'AudioAccessory6,1', {
			deviceid: '02:00:00:00:00:02',
			pk: '02'.repeat(32),
		});
		const raop = service('_raop._tcp.local', '020000000002@homepod-raop', 'AudioAccessory6,1', {
			pk: '02'.repeat(32),
		});
		const weak = service('_airplay._tcp.local', 'weak-homepod', 'AudioAccessory5,1', {
			pk: '05'.repeat(32),
		});
		const wrongType = service('_hap._tcp.local', 'hap-homepod', 'AudioAccessory6,1', {
			deviceid: '02:00:00:00:00:06',
		});

		const homePods = correlateHomePods([
			{ name: 'Neutral HomePod', airplay },
			{ name: 'Neutral HomePod RAOP', raop },
			{ name: 'Weak HomePod', airplay: weak },
			{ name: 'Wrong Type', airplay: wrongType },
		]);

		expect(homePods).to.have.length(1);
		expect(homePods[0]).to.include({
			deviceId: '020000000002',
			name: 'Neutral HomePod',
			model: 'AudioAccessory6,1',
		});
		expect(homePods[0]?.airplay).to.equal(airplay);
		expect(homePods[0]?.raop).to.equal(raop);
	});

	it('projects only generic receivers with durable protocol identity', () => {
		const airplay = service('_airplay._tcp.local', 'renamed-airplay', 'NeutralReceiver1,1', {
			deviceid: '02:00:00:00:00:04',
			pk: '04'.repeat(32),
		});
		const correlatedRaop = service('_raop._tcp.local', '020000000004@different-name', '', {
			pk: '04'.repeat(32),
		});
		const weak = service('_airplay._tcp.local', 'weak-receiver', 'NeutralReceiver1,1', {
			pk: '05'.repeat(32),
		});
		const homePod = service('_airplay._tcp.local', 'homepod', 'AudioAccessory6,1', {
			deviceid: '02:00:00:00:00:06',
		});

		const receivers = correlateAirPlayReceivers([
			{ name: 'Current Receiver Name', airplay },
			{ name: 'Different RAOP Name', raop: correlatedRaop },
			{ name: 'Weak Receiver', airplay: weak },
			{ name: 'Neutral HomePod', airplay: homePod },
		]);

		expect(receivers).to.have.length(1);
		expect(receivers[0]).to.include({
			deviceId: '020000000004',
			name: 'Current Receiver Name',
			model: 'NeutralReceiver1,1',
		});
		expect(receivers[0]?.airplay).to.equal(airplay);
		expect(receivers[0]?.raop).to.equal(correlatedRaop);
	});

	it('suppresses an individual receiver when correlated services disagree on strong IDs', () => {
		const airplay = service('_airplay._tcp.local', 'ambiguous-airplay', 'NeutralReceiver1,1', {
			deviceid: '02:00:00:00:00:07',
			pk: '07'.repeat(32),
		});
		const raop = service('_raop._tcp.local', '020000000008@ambiguous-raop', 'NeutralReceiver1,1', {
			pk: '07'.repeat(32),
		});

		const discovery = summarizeAppleDiscovery([
			{ name: 'Ambiguous Receiver', airplay },
			{ name: 'Ambiguous Receiver RAOP', raop },
		]);

		expect(discovery.deviceCounts.airplayReceiver).to.equal(1);
		expect(discovery.airplayReceivers).to.deep.equal([]);
	});

	it('accepts RAOP-only device IDs and orders receiver targets deterministically', () => {
		const later = service('_raop._tcp.local', '02000000000A@later', 'NeutralReceiver1,1', {});
		const earlier = service('_raop._tcp.local', '020000000009@earlier', 'NeutralReceiver1,1', {});

		const receivers = correlateAirPlayReceivers([
			{ name: 'Later Receiver', raop: later },
			{ name: 'Earlier Receiver', raop: earlier },
		]);

		expect(receivers.map(receiver => receiver.deviceId)).to.deep.equal(['020000000009', '02000000000A']);
		expect(receivers.every(receiver => receiver.airplay === undefined && receiver.raop !== undefined)).to.equal(
			true,
		);
	});

	it('keeps weak scan identities opaque in the Admin summary', () => {
		const publicKeyOnly = service('_airplay._tcp.local', 'private-key-name', 'NeutralReceiver1,1', {
			pk: '09'.repeat(32),
		});
		const serviceOnly = service('_airplay._tcp.local', 'private-service-name', 'NeutralReceiver1,1', {});

		const details = summarizeAppleDiscovery([
			{ name: 'Public Key Only', airplay: publicKeyOnly },
			{ name: 'Service Only', airplay: serviceOnly },
		]).deviceDetails.airplayReceiver;

		expect(details.map(detail => detail.identity)).to.satisfy((identities: string[]) =>
			identities.every(identity => /^(public-key|service):[0-9a-f]{16}$/.test(identity)),
		);
		expect(JSON.stringify(details)).not.to.include(publicKeyOnly.txt.pk);
		expect(JSON.stringify(details)).not.to.include(serviceOnly.fqdn);
	});
});

/**
 * Creates a neutral serializable protocol service.
 *
 * @param type - DNS-SD service type.
 * @param id - Neutral service identifier.
 * @param modelName - Reported model.
 * @param txt - TXT-record properties.
 */
function service(type: string, id: string, modelName: string, txt: Record<string, string>): AppleDiscoveryService {
	return {
		id,
		fqdn: `${id}.example.test`,
		address: '192.0.2.10',
		modelName,
		familyName: null,
		service: { port: 7000, protocol: 'tcp', type },
		txt,
	};
}
