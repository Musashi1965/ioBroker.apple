import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';

import { readPairingFile, writePairingFile } from './applePairingCredentials.cjs';
import { selectTargetByName } from './applePairingTarget.cjs';
import { discoverAppleTvTargets, type AppleTvTarget } from './appleTvTargetDiscovery.cjs';

const DEFAULT_CREDENTIAL_PATH = resolve(process.cwd(), '.poc-private', 'apple-tv-pairing.json');

/** Runs the interactive pair or non-interactive credential reload command. */
async function main(): Promise<void> {
	const command = process.argv[2];
	if (command !== 'pair' && command !== 'verify') {
		throw new Error('Expected pair or verify command');
	}

	const sdk = await import('@basmilius/apple-sdk');
	const targets = await discoverAppleTvTargets();
	const credentialPath = process.env.APPLE_POC_CREDENTIALS_PATH ?? DEFAULT_CREDENTIAL_PATH;

	if (command === 'pair') {
		const target = selectTarget(targets);
		const session = new sdk.PairingSession(target.airplay);
		let completed = false;
		try {
			await session.start();
			process.stdout.write(`PAIRING_CANDIDATE_COUNT=${targets.length}\n`);
			process.stdout.write('PAIRING_PIN_REQUIRED\n');
			const pin = await readPin();
			await session.pin(pin);
			const credentials = await session.end();
			completed = true;
			await writePairingFile(credentialPath, target.deviceId, credentials);
			process.stdout.write('PAIRING_COMPLETED\n');
		} finally {
			if (!completed) {
				session.abort();
			}
		}
		return;
	}

	const stored = await readPairingFile(credentialPath);
	const target = targets.find(candidate => candidate.deviceId === stored.deviceId);
	if (target === undefined) {
		throw new Error('Paired Apple TV was not rediscovered');
	}

	const device = new sdk.AppleTV({
		airplay: target.airplay,
		companionLink: target.companionLink,
	});
	try {
		await device.connect(stored.credentials);
		process.stdout.write('PAIRING_RELOAD_OK\n');
		process.stdout.write(`AIRPLAY_CONNECTED=${device.airplay.isConnected}\n`);
		process.stdout.write(`COMPANION_CONNECTED=${device.companionLink?.isConnected ?? false}\n`);
	} finally {
		device.disconnect();
	}
}

/**
 * Chooses one target by runtime-only name or a one-based environment setting.
 * @param targets - Supported targets from the current discovery pass.
 * @returns The single selected pairing target.
 */
function selectTarget(targets: readonly AppleTvTarget[]): AppleTvTarget {
	const targetName = process.env.APPLE_POC_TARGET_NAME?.normalize('NFC').trim();
	if (targetName !== undefined && targetName.length > 0) {
		return selectTargetByName(targets, targetName);
	}

	const indexText = process.env.APPLE_POC_TARGET_INDEX ?? '1';
	if (!/^\d+$/.test(indexText)) {
		throw new Error('APPLE_POC_TARGET_INDEX must be a positive integer');
	}
	const index = Number(indexText) - 1;
	const target = targets[index];
	if (target === undefined) {
		throw new Error(`Requested target index is unavailable; discovered ${targets.length} Apple TVs`);
	}
	return target;
}

/**
 * Reads and validates one four-digit PIN without echoing it.
 * @returns The validated PIN supplied through standard input.
 */
async function readPin(): Promise<string> {
	const input = createInterface({ input: process.stdin, terminal: false });
	try {
		const pin = (await input.question('')).trim();
		if (!/^\d{4}$/.test(pin)) {
			throw new Error('Pairing PIN must contain exactly four digits');
		}
		return pin;
	} finally {
		input.close();
	}
}

void main().catch((error: unknown) => {
	const reason = error instanceof Error ? error.name : 'UnknownError';
	process.stderr.write(`PAIRING_FAILED=${reason}\n`);
	process.exitCode = 1;
});
