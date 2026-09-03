/// <reference types="mocha" />

import { expect } from 'chai';

import {
	AppleTvBackendError,
	executePowerCommand,
	isBundleId,
	normalizeLaunchableApps,
	normalizeOpenUrl,
} from './appleTvBackend';

describe('AppleTvBackend app normalization', () => {
	it('de-duplicates and sorts valid launchable apps without exposing SDK records', () => {
		expect(
			normalizeLaunchableApps([
				{ bundleId: 'com.example.Second', name: ' Second ' },
				{ bundleId: 'com.example.First', name: 'First' },
				{ bundleId: 'com.example.Second', name: 'Second' },
			]),
		).to.deep.equal([
			{ bundleId: 'com.example.First', name: 'First' },
			{ bundleId: 'com.example.Second', name: 'Second' },
		]);
	});

	it('rejects malformed, unbounded, or incomplete app records with a stable error', () => {
		for (const values of [
			[{ bundleId: 'invalid', name: 'Invalid' }],
			[{ bundleId: 'com.example.Valid', name: '' }],
		]) {
			expect(() => normalizeLaunchableApps(values)).to.throw(AppleTvBackendError, 'protocol_error');
		}
		expect(() => normalizeLaunchableApps(Array.from({ length: 501 }, () => ({})))).to.throw(
			AppleTvBackendError,
			'protocol_error',
		);
	});

	it('accepts conservative Apple-style bundle identifiers only', () => {
		expect(isBundleId('com.example.Player')).to.equal(true);
		expect(isBundleId('com.example-player.Player2')).to.equal(true);
		expect(isBundleId('com.example..Player')).to.equal(true);
		expect(isBundleId('invalid')).to.equal(false);
		expect(isBundleId('com.example player')).to.equal(false);
	});

	it('accepts bounded universal and app URLs while rejecting unsafe forms', () => {
		expect(normalizeOpenUrl(' https://example.test/live?channel=one ')).to.equal(
			'https://example.test/live?channel=one',
		);
		expect(normalizeOpenUrl('example-player://live/one')).to.equal('example-player://live/one');
		for (const url of [
			'',
			'not a URL',
			'https://user:secret@example.test/live',
			'file:///private/example',
			'javascript:alert(1)',
			`https://example.test/${'x'.repeat(2048)}`,
		]) {
			expect(() => normalizeOpenUrl(url)).to.throw(AppleTvBackendError, 'unsupported');
		}
	});

	it('maps explicit power commands to wake and suspend operations', async () => {
		const calls: string[] = [];
		const controller = {
			on: () => {
				calls.push('on');
				return Promise.resolve();
			},
			off: () => {
				calls.push('off');
				return Promise.resolve();
			},
		};

		await executePowerCommand(controller, 'powerOn');
		await executePowerCommand(controller, 'powerOff');

		expect(calls).to.deep.equal(['on', 'off']);
	});
});
