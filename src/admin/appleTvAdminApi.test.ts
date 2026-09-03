/// <reference types="mocha" />

import { expect } from 'chai';

import { pairedDeviceItems, pairingCandidateItems, pairingStatusPayload } from './appleTvAdminApi';

describe('Apple TV Admin API', () => {
	it('returns only unpaired candidates with selector-compatible structured fields', () => {
		expect(
			pairingCandidateItems([
				{ deviceId: '020000000001', name: 'Managed Apple TV', model: 'AppleTV14,1', paired: true },
				{ deviceId: '020000000002', name: 'New Apple TV', model: 'AppleTV6,2', paired: false },
			]),
		).to.deep.equal([
			{
				deviceId: '020000000002',
				name: 'New Apple TV',
				model: 'AppleTV6,2',
				paired: false,
				label: 'New Apple TV (AppleTV6,2)',
				value: '020000000002',
			},
		]);
	});

	it('returns complete non-secret managed-device rows', () => {
		expect(
			pairedDeviceItems([
				{
					deviceId: '020000000001',
					name: 'Neutral Apple TV',
					model: 'AppleTV14,1',
					discovered: false,
					connected: false,
					appCount: 0,
					enabled: false,
				},
			]),
		).to.deep.equal([
			{
				deviceId: '020000000001',
				name: 'Neutral Apple TV',
				model: 'AppleTV14,1',
				discovered: false,
				connected: false,
				appCount: 0,
				enabled: false,
				label: 'Neutral Apple TV (AppleTV14,1) — passive',
				value: '020000000001',
			},
		]);
	});

	it('identifies the active pairing row without exposing a PIN', () => {
		const response = pairingStatusPayload({ status: 'pinRequired', deviceId: '020000000001' });
		expect(response).to.deep.equal({
			text: 'pinRequired',
			status: 'pinRequired',
			deviceId: '020000000001',
			pairingError: undefined,
		});
		expect(response).not.to.have.property('pin');
	});
});
