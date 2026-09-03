import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { readPairingFile } from './applePairingCredentials.cjs';
import { discoverAppleTvTargets } from './appleTvTargetDiscovery.cjs';

const DEFAULT_CREDENTIAL_PATH = resolve(process.cwd(), '.poc-private', 'apple-tv-pairing.json');

/** Connects, observes minimized state/events, sends one bounded HID command, and disconnects. */
async function main(): Promise<void> {
	const credentialPath = process.env.APPLE_POC_CREDENTIALS_PATH ?? DEFAULT_CREDENTIAL_PATH;
	const stored = await readPairingFile(credentialPath);
	const target = (await discoverAppleTvTargets()).find(candidate => candidate.deviceId === stored.deviceId);
	if (target === undefined) {
		throw new Error('Paired Apple TV was not rediscovered');
	}

	const sdk = await import('@basmilius/apple-sdk');
	const device = new sdk.AppleTV({
		airplay: target.airplay,
		companionLink: target.companionLink,
	});
	const eventCounts = {
		activeApp: 0,
		nowPlaying: 0,
		power: 0,
		supportedCommands: 0,
	};

	device.on('power', () => eventCounts.power++);
	device.state.on('activeAppChanged', () => eventCounts.activeApp++);
	device.state.on('nowPlayingChanged', () => eventCounts.nowPlaying++);
	device.state.on('supportedCommandsChanged', () => eventCounts.supportedCommands++);

	try {
		await device.connect(stored.credentials);
		await delay(1500);
		const powerState = (await device.power?.getState()) ?? 'unavailable';

		process.stdout.write('CONTROL_CONNECTION_OK\n');
		process.stdout.write(`POWER_STATE=${powerState}\n`);
		process.stdout.write(`IS_PLAYING=${device.state.isPlaying}\n`);
		process.stdout.write(`VOLUME_AVAILABLE=${device.state.volumeAvailable}\n`);
		process.stdout.write(`ACTIVE_APP_AVAILABLE=${device.state.activeApp !== null}\n`);
		process.stdout.write(
			`REMOTE_CONTROL_CAPABILITY=${
				device.capabilities.supportsUnifiedMediaControl || device.capabilities.supportsHangdogRemoteControl
			}\n`,
		);

		await device.remote.up();
		process.stdout.write('REMOTE_UP_COMPLETED\n');
		await delay(1000);

		process.stdout.write(`POWER_EVENTS=${eventCounts.power}\n`);
		process.stdout.write(`NOW_PLAYING_EVENTS=${eventCounts.nowPlaying}\n`);
		process.stdout.write(`ACTIVE_APP_EVENTS=${eventCounts.activeApp}\n`);
		process.stdout.write(`SUPPORTED_COMMAND_EVENTS=${eventCounts.supportedCommands}\n`);
	} finally {
		device.disconnect();
		device.removeAllListeners();
		device.state.removeAllListeners();
		process.stdout.write('CONTROL_DISCONNECT_COMPLETED\n');
	}
}

void main().catch((error: unknown) => {
	const reason = error instanceof Error ? error.name : 'UnknownError';
	process.stderr.write(`CONTROL_PROBE_FAILED=${reason}\n`);
	process.exitCode = 1;
});
