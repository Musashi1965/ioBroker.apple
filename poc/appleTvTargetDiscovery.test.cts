import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CombinedDiscoveryResult, DiscoveryResult } from '@basmilius/apple-common' with {
	'resolution-mode': 'import',
};

import { appleTvTargets } from './appleTvTargetDiscovery.cjs';

void test('correlates a supported Apple TV target without address identity', () => {
	const airplay = service('_airplay._tcp.local', 'AppleTV14,1', {
		deviceid: '02:00:00:00:00:01',
		psi: '02000000000000000000000000000001',
	});
	const companionLink = service('_companion-link._tcp.local', 'AppleTV14,1', {
		rpMRtID: '02000000000000000000000000000001',
	});
	const results = [
		{
			id: 'neutral-result',
			name: 'Neutral Living Room',
			address: '192.0.2.10',
			airplay,
			companionLink,
		},
	] as CombinedDiscoveryResult[];

	const targets = appleTvTargets(results);

	assert.equal(targets.length, 1);
	assert.equal(targets[0].deviceId, '020000000001');
	assert.equal(targets[0].airplay, airplay);
	assert.equal(targets[0].companionLink, companionLink);
});

void test('rejects an Apple TV model advertised in the wrong service slot', () => {
	const wrongService = service('_hap._tcp.local', 'AppleTV14,1', {
		deviceid: '02:00:00:00:00:01',
	});
	const results = [
		{
			id: 'neutral-result',
			name: 'Neutral Device',
			address: '192.0.2.10',
			airplay: wrongService,
		},
	] as CombinedDiscoveryResult[];

	assert.deepEqual(appleTvTargets(results), []);
});

/**
 * Creates a structurally sufficient neutral discovery fixture.
 * @param type - DNS-SD service type.
 * @param modelName - Reported hardware model.
 * @param txt - TXT-record properties.
 * @returns Discovery fixture.
 */
function service(type: string, modelName: string, txt: Record<string, string>): DiscoveryResult {
	return {
		id: 'neutral-service',
		fqdn: 'neutral.local',
		address: '192.0.2.10',
		modelName,
		familyName: null,
		service: { port: 7000, protocol: 'tcp', type },
		packet: {},
		txt,
	} as unknown as DiscoveryResult;
}
