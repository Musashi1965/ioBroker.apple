/// <reference types="mocha" />

import { expect } from 'chai';

import { APPLE_PROTOCOLS, isAppleProtocol } from './appleProtocols';

describe('Apple protocol vocabulary', () => {
	it('contains the three protocol services required by the first device PoC', () => {
		expect(APPLE_PROTOCOLS).to.deep.equal(['airplay', 'companion', 'raop']);
	});

	it('accepts only known protocol identifiers', () => {
		expect(isAppleProtocol('airplay')).to.equal(true);
		expect(isAppleProtocol('companion')).to.equal(true);
		expect(isAppleProtocol('raop')).to.equal(true);
		expect(isAppleProtocol('homepod')).to.equal(false);
		expect(isAppleProtocol(undefined)).to.equal(false);
	});
});
