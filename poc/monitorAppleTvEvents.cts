import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { readPairingFile } from './applePairingCredentials.cjs';
import { discoverAppleTvTargets } from './appleTvTargetDiscovery.cjs';

const DEFAULT_CREDENTIAL_PATH = resolve(process.cwd(), '.poc-private', 'apple-tv-pairing.json');
const DEFAULT_WINDOW_MS = 120_000;

/** Observes only event-type counters and never retains event payloads. */
async function main(): Promise<void> {
	const credentialPath = process.env.APPLE_POC_CREDENTIALS_PATH ?? DEFAULT_CREDENTIAL_PATH;
	const windowMs = eventWindowMs(process.env.APPLE_POC_EVENT_WINDOW_MS);
	const stored = await readPairingFile(credentialPath);
	const target = (await discoverAppleTvTargets()).find(candidate => candidate.deviceId === stored.deviceId);
	if (target === undefined) {
		throw new Error('Paired Apple TV was not rediscovered');
	}

	const sdk = await import('@basmilius/apple-sdk');
	const device = new sdk.AppleTV({ airplay: target.airplay, companionLink: target.companionLink });
	const counts = {
		activeApp: 0,
		artwork: 0,
		nowPlaying: 0,
		playbackState: 0,
		power: 0,
		supportedCommands: 0,
		volume: 0,
	};
	let observationStarted = false;
	let resolveMediaEvent: (() => void) | undefined;
	const mediaEvent = new Promise<void>(resolveMedia => {
		resolveMediaEvent = resolveMedia;
	});
	const count = (type: keyof typeof counts, isMediaEvent = false): void => {
		if (!observationStarted) {
			return;
		}
		counts[type]++;
		if (isMediaEvent) {
			resolveMediaEvent?.();
		}
	};

	device.on('power', () => count('power'));
	device.state.on('activeAppChanged', () => count('activeApp', true));
	device.state.on('artworkChanged', () => count('artwork', true));
	device.state.on('nowPlayingChanged', () => count('nowPlaying', true));
	device.state.on('playbackStateChanged', () => count('playbackState', true));
	device.state.on('supportedCommandsChanged', () => count('supportedCommands', true));
	device.state.on('volumeChanged', () => count('volume'));

	try {
		await device.connect(stored.credentials);
		await delay(1500);
		observationStarted = true;
		process.stdout.write('EVENT_MONITOR_READY\n');
		await Promise.race([mediaEvent, delay(windowMs)]);
		await delay(1500);

		process.stdout.write(`NOW_PLAYING_EVENTS=${counts.nowPlaying}\n`);
		process.stdout.write(`PLAYBACK_STATE_EVENTS=${counts.playbackState}\n`);
		process.stdout.write(`ACTIVE_APP_EVENTS=${counts.activeApp}\n`);
		process.stdout.write(`SUPPORTED_COMMAND_EVENTS=${counts.supportedCommands}\n`);
		process.stdout.write(`ARTWORK_EVENTS=${counts.artwork}\n`);
		process.stdout.write(`POWER_EVENTS=${counts.power}\n`);
		process.stdout.write(`VOLUME_EVENTS=${counts.volume}\n`);
	} finally {
		device.disconnect();
		device.removeAllListeners();
		device.state.removeAllListeners();
		process.stdout.write('EVENT_MONITOR_DISCONNECT_COMPLETED\n');
	}
}

/**
 * Validates a bounded observation duration.
 * @param value - Optional environment value.
 * @returns Duration in milliseconds.
 */
function eventWindowMs(value: string | undefined): number {
	if (value === undefined) {
		return DEFAULT_WINDOW_MS;
	}
	if (!/^\d+$/.test(value)) {
		throw new Error('APPLE_POC_EVENT_WINDOW_MS must be an integer');
	}
	const parsed = Number(value);
	if (parsed < 10_000 || parsed > 180_000) {
		throw new Error('APPLE_POC_EVENT_WINDOW_MS is outside the allowed range');
	}
	return parsed;
}

void main().catch((error: unknown) => {
	const reason = error instanceof Error ? error.name : 'UnknownError';
	process.stderr.write(`EVENT_MONITOR_FAILED=${reason}\n`);
	process.exitCode = 1;
});
