import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	normalizeLowLevelDiscovery,
	selectAppleDeviceRecords,
	type CombinedDiscoveryResultShape,
	type DiscoveryResultShape,
} from './appleLowLevelDiscovery.cjs';

const EXAMPLE_PAIRING_ID = '02000000-0000-4000-8000-000000000001';
const EXAMPLE_PUBLIC_KEY = '1'.repeat(64);

void test('loads the ESM-only low-level package through dynamic import from CommonJS', async () => {
	const common = await import('@basmilius/apple-common');

	assert.equal(typeof common.Discovery.discoverAll, 'function');
});

void test('correlates AirPlay, Companion, and RAOP without name or address identity', () => {
	const results: CombinedDiscoveryResultShape[] = [
		{
			airplay: service('_airplay._tcp.local', 'living-room-tv.local', 'AppleTV14,1', {
				deviceid: '02:00:00:00:00:01',
				psi: EXAMPLE_PAIRING_ID,
				pk: EXAMPLE_PUBLIC_KEY,
			}),
		},
		{
			companionLink: service('_companion-link._tcp.local', 'renamed-tv.local', '', {
				rpMRtID: EXAMPLE_PAIRING_ID,
			}),
		},
		{
			raop: service('_raop._tcp.local', '020000000001@different-name.local', 'AppleTV14,1', {
				pk: EXAMPLE_PUBLIC_KEY,
			}),
		},
	];

	const candidates = normalizeLowLevelDiscovery(results);

	assert.deepEqual(candidates, [
		{
			deviceType: 'appletv',
			hasModelName: true,
			services: { airplay: true, companion: true, raop: true },
		},
	]);
	assert.deepEqual(selectAppleDeviceRecords(candidates), [
		{
			deviceType: 'appletv',
			hasModelName: true,
			services: { airplay: true, companion: true, raop: true },
		},
	]);
});

void test('drops unrelated HAP answers from every protocol slot', () => {
	const hap = service('_hap._tcp.local', 'unrelated-bridge.local', '', {});
	const candidates = normalizeLowLevelDiscovery([{ airplay: hap, companionLink: hap, raop: hap }]);

	assert.deepEqual(candidates, []);
});

void test('does not correlate unrelated services without stable evidence', () => {
	const results: CombinedDiscoveryResultShape[] = [
		{
			airplay: service('_airplay._tcp.local', 'receiver.local', 'Receiver1,1', {}),
			companionLink: service('_companion-link._tcp.local', 'tablet.local', '', {}),
		},
	];

	const candidates = normalizeLowLevelDiscovery(results);

	assert.equal(candidates.length, 2);
	assert.equal(
		candidates.every(candidate => candidate.deviceType === 'unsupported'),
		true,
	);
});

void test('classifies HomePod mini separately from other HomePod models', () => {
	const candidates = normalizeLowLevelDiscovery([
		{ airplay: service('_airplay._tcp.local', 'mini.local', 'AudioAccessory5,1', {}) },
		{ airplay: service('_airplay._tcp.local', 'homepod.local', 'AudioAccessory6,1', {}) },
	]);

	assert.deepEqual(candidates.map(candidate => candidate.deviceType).sort(), ['homepod', 'homepod-mini']);
});

void test('classifies a Companion-only Apple TV through rpMd metadata', () => {
	const candidates = normalizeLowLevelDiscovery([
		{
			companionLink: service('_companion-link._tcp.local', 'tv.local', '', {
				rpMd: 'AppleTV14,1',
				rpMRtID: EXAMPLE_PAIRING_ID,
			}),
		},
	]);

	assert.deepEqual(candidates, [
		{
			deviceType: 'appletv',
			hasModelName: true,
			services: { airplay: false, companion: true, raop: false },
		},
	]);
});

/**
 * Creates one neutral synthetic service fixture.
 * @param type - Neutral DNS-SD service type.
 * @param id - Reserved fixture identifier.
 * @param modelName - Neutral fixture model.
 * @param txt - Synthetic TXT properties.
 * @returns Structural discovery-service fixture.
 */
function service(type: string, id: string, modelName: string, txt: Record<string, string>): DiscoveryResultShape {
	return {
		id,
		modelName,
		txt,
		service: { port: 7000, type },
	};
}
