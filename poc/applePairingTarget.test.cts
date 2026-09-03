import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectTargetByName } from './applePairingTarget.cjs';

const targets = [{ name: 'Media Room' }, { name: 'Apple TV Guest Room' }];

void test('selects an exact runtime name before considering contained terms', () => {
	const target = selectTargetByName([...targets, { name: 'Media Room Secondary' }], 'media room');
	assert.equal(target.name, 'Media Room');
});

void test('selects one unique contained room term', () => {
	const target = selectTargetByName(targets, 'guest room');
	assert.equal(target.name, 'Apple TV Guest Room');
});

void test('rejects ambiguous contained room terms', () => {
	assert.throws(
		() => selectTargetByName([...targets, { name: 'Guest Room Speaker' }], 'guest room'),
		/did not resolve uniquely/,
	);
});
