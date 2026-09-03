/// <reference types="mocha" />

import { expect } from 'chai';

import type { PairingCredentials } from '../../security/pairingCredentialStore';
import { testTimerScheduler } from '../../../test/timerScheduler';
import type { DiscoveredAppleTv } from './discoveryTypes';
import { AppleTvPairing } from './appleTvPairing';

describe('AppleTvPairing', () => {
	it('completes one bounded PIN flow without retaining the PIN', async () => {
		let receivedPin: string | undefined;
		const value = credentials();
		const pairing = new AppleTvPairing(testTimerScheduler, 1000, () =>
			Promise.resolve({
				start: () => Promise.resolve(),
				pin: pin => {
					receivedPin = pin;
					return Promise.resolve();
				},
				end: () => Promise.resolve(value),
				abort: () => undefined,
			}),
		);

		await pairing.start(target());
		expect(pairing.status()).to.deep.equal({ status: 'pinRequired', deviceId: '020000000001' });
		const result = await pairing.finish('020000000001', '1234');

		expect(receivedPin).to.equal('1234');
		expect(result).to.equal(value);
		expect(pairing.status()).to.deep.equal({ status: 'paired' });
	});

	it('aborts a start operation at the total session deadline', async () => {
		let aborted = false;
		const pairing = new AppleTvPairing(testTimerScheduler, 5, () =>
			Promise.resolve({
				start: () => new Promise<void>(() => undefined),
				pin: () => Promise.resolve(),
				end: () => Promise.resolve(credentials()),
				abort: () => {
					aborted = true;
				},
			}),
		);

		let failure: unknown;
		try {
			await pairing.start(target());
		} catch (error) {
			failure = error;
		}
		expect(failure).to.be.instanceOf(Error);
		expect((failure as Error).message).to.equal('pairing_start_failed');
		expect(aborted).to.equal(true);
		expect(pairing.status()).to.deep.equal({ status: 'error', error: 'timeout' });
	});
});

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

/** Creates one standards-reserved neutral target. */
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
