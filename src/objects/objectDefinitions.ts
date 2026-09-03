import { createHash } from 'node:crypto';

import type {
	AppleTvApp,
	AppleTvNavigationCommand,
	AppleTvPlaybackCommand,
	AppleTvPowerCommand,
	AppleTvRemoteCommand,
} from '../domain/appleTv';
import type { HomePodPlaybackCommand } from '../domain/homePod';
import type { DiscoveredAirPlayReceiver, DiscoveredAppleTv, DiscoveredHomePod } from '../backends/apple/discoveryTypes';

/** Capability-gated directional and menu commands. */
export const NAVIGATION_COMMANDS: readonly AppleTvNavigationCommand[] = [
	'up',
	'down',
	'left',
	'right',
	'select',
	'menu',
	'home',
];

/** Capability-gated media transport commands displayed under Playback. */
export const PLAYBACK_COMMANDS: readonly AppleTvPlaybackCommand[] = ['playPause'];

/** Capability-gated power commands displayed under Power. */
export const POWER_COMMANDS: readonly AppleTvPowerCommand[] = ['powerOn', 'powerOff'];

/** Capability-gated HomePod transport commands. */
export const HOME_POD_PLAYBACK_COMMANDS: readonly HomePodPlaybackCommand[] = [
	'play',
	'pause',
	'playPause',
	'stop',
	'next',
	'previous',
];

/** Complete public Apple TV command vocabulary. */
export const APPLE_TV_COMMANDS: readonly AppleTvRemoteCommand[] = [
	...NAVIGATION_COMMANDS,
	...PLAYBACK_COMMANDS,
	...POWER_COMMANDS,
];

/** One adapter-relative object fragment. */
export interface ObjectDefinition {
	/** Adapter-relative object ID. */
	id: string;
	/** Complete object fragment reconciled idempotently. */
	object: ioBroker.PartialObject;
}

type StateCommonWithoutName = Omit<ioBroker.StateCommon, 'name'>;

/** Returns the stable instance-level object contract. */
export function instanceObjectDefinitions(): ObjectDefinition[] {
	return [
		channel('info', 'Information'),
		state('info.connection', 'Device connected', booleanCommon('indicator.connected', false)),
		state('info.discoveryRunning', 'Discovery running', booleanCommon('indicator.working', false)),
		state('info.lastDiscovery', 'Last discovery', numberCommon('value.time', 0)),
		state('info.deviceCount', 'Discovered device count', numberCommon('value', 0, { min: 0 })),
		state('info.lastError', 'Last adapter error', stringCommon('text', '')),
		folder('devices', 'Devices'),
		folder('devices.appletv', 'Apple TV'),
		channel('devices.appletv.info', 'Information'),
		state('devices.appletv.info.deviceCount', 'Discovered Apple TV count', numberCommon('value', 0, { min: 0 })),
		folder('devices.homepod', 'HomePod'),
		channel('devices.homepod.info', 'Information'),
		state('devices.homepod.info.deviceCount', 'Discovered HomePod count', numberCommon('value', 0, { min: 0 })),
		folder('devices.airplayReceiver', 'AirPlay Receiver'),
		channel('devices.airplayReceiver.info', 'Information'),
		state(
			'devices.airplayReceiver.info.deviceCount',
			'Discovered AirPlay receiver count',
			numberCommon('value', 0, { min: 0 }),
		),
	];
}

/**
 * Returns one complete Apple TV object definition set.
 *
 * @param target - Correlated Apple TV.
 * @param remoteAvailable - Whether writable navigation states may be exposed.
 * @param powerAvailable - Whether writable power states may be exposed.
 * @param playbackAvailable - Whether writable media transport states may be exposed.
 */
export function appleTvObjectDefinitions(
	target: DiscoveredAppleTv,
	remoteAvailable: boolean,
	powerAvailable = false,
	playbackAvailable = remoteAvailable,
): ObjectDefinition[] {
	const root = deviceObjectId(target.deviceId);
	const definitions: ObjectDefinition[] = [
		{
			id: root,
			object: {
				type: 'device',
				common: { name: deviceDisplayName(target.name) },
				native: { deviceId: target.deviceId, deviceType: 'appletv' },
			},
		},
		channel(`${root}.info`, 'Information'),
		state(`${root}.info.name`, 'Display name', stringCommon('info.name', '')),
		state(`${root}.info.type`, 'Device type', stringCommon('info.type', 'appletv')),
		state(`${root}.info.model`, 'Hardware model', stringCommon('info.hardware', '')),
		state(`${root}.info.paired`, 'Paired', booleanCommon('indicator', false)),
		state(`${root}.info.lastSeen`, 'Last seen', numberCommon('value.time', 0)),
		channel(`${root}.connection`, 'Connection'),
		state(`${root}.connection.state`, 'Connection state', stringCommon('text', 'discovered')),
		state(`${root}.connection.online`, 'Online', booleanCommon('indicator.connected', false)),
		state(`${root}.connection.airplay`, 'AirPlay connected', booleanCommon('indicator.connected', false)),
		state(`${root}.connection.companion`, 'Companion Link connected', booleanCommon('indicator.connected', false)),
		state(`${root}.connection.raopAvailable`, 'RAOP discovered', booleanCommon('indicator', false)),
		state(`${root}.connection.lastError`, 'Connection error', stringCommon('text', '')),
		channel(`${root}.capabilities`, 'Capabilities'),
		state(`${root}.capabilities.remote`, 'Remote control', booleanCommon('indicator', false)),
		state(`${root}.capabilities.playback`, 'Playback control', booleanCommon('indicator', false)),
		state(`${root}.capabilities.power`, 'Power state', booleanCommon('indicator', false)),
		state(`${root}.capabilities.nowPlaying`, 'Now Playing', booleanCommon('indicator', false)),
		state(`${root}.capabilities.volume`, 'Volume state', booleanCommon('indicator', false)),
		state(`${root}.capabilities.apps`, 'App catalog and launch', booleanCommon('indicator', false)),
		channel(`${root}.power`, 'Power'),
		state(`${root}.power.state`, 'Power state', stringCommon('text', 'unknown')),
		channel(`${root}.nowPlaying`, 'Now Playing'),
		state(`${root}.nowPlaying.title`, 'Title', stringCommon('media.title', '')),
		state(`${root}.nowPlaying.artist`, 'Artist', stringCommon('media.artist', '')),
		state(`${root}.nowPlaying.album`, 'Album', stringCommon('media.album', '')),
		state(`${root}.nowPlaying.app`, 'Active app', stringCommon('text', '')),
		state(`${root}.nowPlaying.bundleId`, 'Active app bundle ID', stringCommon('text', '')),
		state(`${root}.nowPlaying.duration`, 'Duration', numberCommon('value.interval', 0, { min: 0, unit: 's' })),
		state(`${root}.nowPlaying.position`, 'Position', numberCommon('value.interval', 0, { min: 0, unit: 's' })),
		state(`${root}.nowPlaying.isPlaying`, 'Playing', booleanCommon('media.state', false)),
		channel(`${root}.volume`, 'Volume'),
		state(`${root}.volume.available`, 'Volume available', booleanCommon('indicator', false)),
		state(`${root}.volume.level`, 'Volume', numberCommon('level.volume', 0, { min: 0, max: 100, unit: '%' })),
		state(`${root}.volume.muted`, 'Muted', booleanCommon('media.mute', false)),
		channel(`${root}.apps`, 'Apps'),
		state(`${root}.apps.count`, 'Launchable app count', numberCommon('value', 0, { min: 0 })),
		state(`${root}.apps.lastRefresh`, 'App catalog refreshed at', numberCommon('value.time', 0)),
		state(`${root}.apps.refreshStatus`, 'App catalog refresh status', stringCommon('text', 'idle')),
		state(`${root}.apps.lastError`, 'App catalog error', stringCommon('text', '')),
		state(`${root}.apps.available`, 'Launchable app catalog', stringCommon('json', '[]')),
		channel(`${root}.apps.entries`, 'Launchable apps'),
		channel(`${root}.lastCommand`, 'Last command'),
		state(`${root}.lastCommand.name`, 'Command name', stringCommon('text', '')),
		state(`${root}.lastCommand.target`, 'Command target', stringCommon('text', '')),
		state(`${root}.lastCommand.status`, 'Command status', stringCommon('text', 'idle')),
		state(`${root}.lastCommand.error`, 'Command error', stringCommon('text', '')),
		state(`${root}.lastCommand.completedAt`, 'Command completed at', numberCommon('value.time', 0)),
	];

	if (remoteAvailable || playbackAvailable || powerAvailable) {
		definitions.push(
			...appleTvControlObjectDefinitions(target.deviceId, remoteAvailable, playbackAvailable, powerAvailable),
		);
	}

	return definitions;
}

/**
 * Returns the complete read-only contract for one stable generic receiver.
 *
 * @param target - Correlated generic receiver with durable protocol identity.
 */
export function airPlayReceiverObjectDefinitions(target: DiscoveredAirPlayReceiver): ObjectDefinition[] {
	const root = airPlayReceiverObjectId(target.deviceId);
	return [
		{
			id: root,
			object: {
				type: 'device',
				common: { name: airPlayReceiverDisplayName(target.name) },
				native: { deviceId: target.deviceId, deviceType: 'airplayReceiver' },
			},
		},
		channel(`${root}.info`, 'Information'),
		state(`${root}.info.name`, 'Display name', stringCommon('info.name', '')),
		state(`${root}.info.type`, 'Device type', stringCommon('info.type', 'airplayReceiver')),
		state(`${root}.info.model`, 'Hardware model', stringCommon('info.hardware', '')),
		state(`${root}.info.deviceId`, 'Stable protocol device ID', stringCommon('text', '')),
		state(`${root}.info.lastSeen`, 'Last seen', numberCommon('value.time', 0)),
		channel(`${root}.discovery`, 'Discovery'),
		state(`${root}.discovery.available`, 'Present in latest successful scan', booleanCommon('indicator', false)),
		channel(`${root}.services`, 'Advertised services'),
		state(`${root}.services.airplay`, 'AirPlay advertised', booleanCommon('indicator', false)),
		state(`${root}.services.raop`, 'RAOP advertised', booleanCommon('indicator', false)),
	];
}

/**
 * Returns the stable HomePod base contract without speculative writable controls.
 *
 * @param target - Strongly identified HomePod discovery target.
 */
export function homePodObjectDefinitions(target: DiscoveredHomePod): ObjectDefinition[] {
	const root = homePodObjectId(target.deviceId);
	return [
		{
			id: root,
			object: {
				type: 'device',
				common: { name: homePodDisplayName(target.name) },
				native: { deviceId: target.deviceId, deviceType: 'homepod' },
			},
		},
		channel(`${root}.info`, 'Information'),
		state(`${root}.info.name`, 'Display name', stringCommon('info.name', '')),
		state(`${root}.info.type`, 'Device type', stringCommon('info.type', 'homepod')),
		state(`${root}.info.model`, 'Hardware model', stringCommon('info.hardware', '')),
		state(`${root}.info.deviceId`, 'Stable protocol device ID', stringCommon('text', '')),
		state(`${root}.info.lastSeen`, 'Last seen', numberCommon('value.time', 0)),
		channel(`${root}.discovery`, 'Discovery'),
		state(`${root}.discovery.available`, 'Present in latest successful scan', booleanCommon('indicator', false)),
		channel(`${root}.services`, 'Advertised services'),
		state(`${root}.services.airplay`, 'AirPlay advertised', booleanCommon('indicator', false)),
		state(`${root}.services.raop`, 'RAOP advertised', booleanCommon('indicator', false)),
		channel(`${root}.connection`, 'Connection'),
		state(`${root}.connection.state`, 'Connection state', stringCommon('text', 'unavailable')),
		state(`${root}.connection.online`, 'Online', booleanCommon('indicator.connected', false)),
		state(`${root}.connection.lastError`, 'Connection error', stringCommon('text', '')),
		channel(`${root}.pairing`, 'Pairing'),
		state(`${root}.pairing.mode`, 'Pairing mode', stringCommon('text', 'transient')),
		state(`${root}.pairing.status`, 'Pairing status', stringCommon('text', 'idle')),
		channel(`${root}.capabilities`, 'Capabilities'),
		state(`${root}.capabilities.playback`, 'Playback control', booleanCommon('indicator', false)),
		state(`${root}.capabilities.nowPlaying`, 'Now Playing', booleanCommon('indicator', false)),
		state(`${root}.capabilities.volume`, 'Volume control', booleanCommon('indicator', false)),
		channel(`${root}.nowPlaying`, 'Now Playing'),
		state(`${root}.nowPlaying.title`, 'Title', stringCommon('media.title', '')),
		state(`${root}.nowPlaying.artist`, 'Artist', stringCommon('media.artist', '')),
		state(`${root}.nowPlaying.album`, 'Album', stringCommon('media.album', '')),
		state(`${root}.nowPlaying.duration`, 'Duration', numberCommon('value.interval', 0, { min: 0, unit: 's' })),
		state(`${root}.nowPlaying.position`, 'Position', numberCommon('value.interval', 0, { min: 0, unit: 's' })),
		state(`${root}.nowPlaying.isPlaying`, 'Playing', booleanCommon('media.state', false)),
		channel(`${root}.volume`, 'Volume'),
		state(`${root}.volume.available`, 'Volume available', booleanCommon('indicator', false)),
		state(`${root}.volume.level`, 'Volume', numberCommon('level.volume', 0, { min: 0, max: 100, unit: '%' })),
		state(`${root}.volume.muted`, 'Muted', booleanCommon('media.mute', false)),
		channel(`${root}.lastCommand`, 'Last command'),
		state(`${root}.lastCommand.name`, 'Command name', stringCommon('text', '')),
		state(`${root}.lastCommand.status`, 'Command status', stringCommon('text', 'idle')),
		state(`${root}.lastCommand.error`, 'Command error', stringCommon('text', '')),
		state(`${root}.lastCommand.completedAt`, 'Command completed at', numberCommon('value.time', 0)),
	];
}

/**
 * Returns HomePod controls only after their owning capability is confirmed.
 *
 * @param deviceId - Stable normalized HomePod identifier.
 * @param playbackAvailable - Whether media transport is supported.
 * @param volumeAvailable - Whether volume state and control are currently available.
 */
export function homePodControlObjectDefinitions(
	deviceId: string,
	playbackAvailable: boolean,
	volumeAvailable: boolean,
): ObjectDefinition[] {
	const root = homePodObjectId(deviceId);
	const definitions: ObjectDefinition[] = [];
	if (playbackAvailable) {
		definitions.push(
			channel(`${root}.playback`, 'Playback'),
			...HOME_POD_PLAYBACK_COMMANDS.map(command =>
				state(`${root}.playback.${command}`, `playback ${command}`, {
					type: 'boolean',
					role: 'button',
					read: false,
					write: true,
					def: false,
				}),
			),
		);
	}
	definitions.push(
		state(`${root}.volume.level`, 'Volume', {
			type: 'number',
			role: 'level.volume',
			read: true,
			write: volumeAvailable,
			def: 0,
			min: 0,
			max: 100,
			unit: '%',
		}),
		state(`${root}.volume.muted`, 'Muted', {
			type: 'boolean',
			role: 'media.mute',
			read: true,
			write: volumeAvailable,
			def: false,
		}),
	);
	return definitions;
}

/**
 * Builds a readable HomePod label without affecting stable identity.
 *
 * @param name - Current receiver display name.
 */
export function homePodDisplayName(name: string): string {
	const trimmed = name.trim();
	return /^homepod(?:\b|$)/iu.test(trimmed) ? trimmed : `HomePod ${trimmed}`;
}

/**
 * Builds a readable generic-receiver label without affecting identity.
 *
 * @param name - Current receiver display name.
 */
export function airPlayReceiverDisplayName(name: string): string {
	const trimmed = name.trim();
	return /^airplay\s+receiver(?:\b|$)/iu.test(trimmed) ? trimmed : `AirPlay Receiver ${trimmed}`;
}

/**
 * Builds the readable ioBroker device label without changing stable object IDs.
 *
 * @param name - Current display name reported by Apple TV.
 */
export function deviceDisplayName(name: string): string {
	const trimmed = name.trim();
	return /^apple\s*tv(?:\b|$)/iu.test(trimmed) ? trimmed : `AppleTV ${trimmed}`;
}

/**
 * Returns writable app controls only after Companion Link app capability is confirmed.
 *
 * @param deviceId - Stable normalized device identifier.
 */
export function appleTvAppsObjectDefinitions(deviceId: string): ObjectDefinition[] {
	const root = deviceObjectId(deviceId);
	return [
		state(`${root}.apps.openurl`, 'Open URL', {
			type: 'string',
			role: 'text',
			read: false,
			write: true,
			def: '',
		}),
		state(`${root}.apps.refresh`, 'Refresh launchable apps', {
			type: 'boolean',
			role: 'button',
			read: false,
			write: true,
			def: false,
		}),
	];
}

/**
 * Returns one stable per-app channel with metadata and a launch button.
 *
 * @param deviceId - Stable normalized device identifier.
 * @param app - Normalized launchable application.
 * @param entryKey - Collision-safe readable object segment.
 */
export function appleTvAppEntryObjectDefinitions(
	deviceId: string,
	app: AppleTvApp,
	entryKey: string,
): ObjectDefinition[] {
	if (!isAppEntryKey(entryKey)) {
		throw new Error('invalid_app_entry_key');
	}
	const root = `${deviceObjectId(deviceId)}.apps.entries.${entryKey}`;
	return [
		channel(root, app.name),
		state(`${root}.name`, 'App name', stringCommon('info.name', '')),
		state(`${root}.bundleId`, 'App bundle ID', stringCommon('text', '')),
		state(`${root}.launch`, 'Launch app', {
			type: 'boolean',
			role: 'button',
			read: false,
			write: true,
			def: false,
		}),
	];
}

/**
 * Creates deterministic, human-readable object keys for one complete app catalog.
 *
 * Equal sanitized names receive a short bundle-ID hash so keys stay unique and
 * independent of protocol ordering.
 *
 * @param apps - Complete normalized app catalog.
 */
export function appEntryKeys(apps: readonly AppleTvApp[]): ReadonlyMap<string, string> {
	const candidates = apps.map(app => ({ app, base: appEntryBaseKey(app.name) }));
	const counts = new Map<string, number>();
	for (const candidate of candidates) {
		counts.set(candidate.base, (counts.get(candidate.base) ?? 0) + 1);
	}
	return new Map(
		candidates.map(({ app, base }) => [
			app.bundleId,
			counts.get(base) === 1 ? base : `${base}_${shortBundleIdHash(app.bundleId)}`,
		]),
	);
}

/**
 * Validates one adapter-generated app entry object segment.
 *
 * @param value - Candidate segment from an ioBroker state ID.
 */
export function isAppEntryKey(value: string): boolean {
	return /^[\p{L}\p{N}_-]{1,89}$/u.test(value);
}

/**
 * Converts one display name into a readable, ioBroker-safe object segment.
 *
 * @param name - App-controlled display name.
 */
function appEntryBaseKey(name: string): string {
	const safe = name
		.normalize('NFKC')
		.trim()
		.replace(/[^\p{L}\p{N}]+/gu, '_')
		.replace(/^_+|_+$/g, '');
	const bounded = [...safe].slice(0, 80).join('').replace(/_+$/g, '');
	return bounded || 'App';
}

/**
 * Returns a short deterministic collision suffix without exposing the bundle ID.
 *
 * @param bundleId - Stable application bundle identifier.
 */
function shortBundleIdHash(bundleId: string): string {
	return createHash('sha256').update(bundleId).digest('hex').slice(0, 8);
}

/**
 * Returns capability-gated writable controls grouped by function.
 *
 * @param deviceId - Stable normalized device identifier.
 * @param remoteAvailable - Whether directional and menu commands are supported.
 * @param playbackAvailable - Whether media transport commands are supported.
 * @param powerAvailable - Whether power commands are supported.
 */
export function appleTvControlObjectDefinitions(
	deviceId: string,
	remoteAvailable = true,
	playbackAvailable = true,
	powerAvailable = false,
): ObjectDefinition[] {
	const root = deviceObjectId(deviceId);
	const definitions: ObjectDefinition[] = [];
	if (remoteAvailable) {
		definitions.push(
			channel(`${root}.remote`, 'Remote control'),
			...commandButtons(root, 'remote', NAVIGATION_COMMANDS),
		);
	}
	if (playbackAvailable) {
		definitions.push(
			channel(`${root}.playback`, 'Playback'),
			...commandButtons(root, 'playback', PLAYBACK_COMMANDS),
		);
	}
	if (powerAvailable) {
		definitions.push(...commandButtons(root, 'power', POWER_COMMANDS));
	}
	return definitions;
}

/**
 * Maps one public command to its capability-owned writable state.
 *
 * @param deviceId - Stable normalized device identifier.
 * @param command - Validated Apple TV command.
 */
export function appleTvCommandStateId(deviceId: string, command: AppleTvRemoteCommand): string {
	const root = deviceObjectId(deviceId);
	if (NAVIGATION_COMMANDS.includes(command as AppleTvNavigationCommand)) {
		return `${root}.remote.${command}`;
	}
	if (PLAYBACK_COMMANDS.includes(command as AppleTvPlaybackCommand)) {
		return `${root}.playback.${command}`;
	}
	return `${root}.power.${command}`;
}

/**
 * Converts one normalized device ID into the stable public object root.
 *
 * @param deviceId - Normalized 12-character protocol identifier.
 */
export function deviceObjectId(deviceId: string): string {
	return `devices.appletv.${normalizedDeviceSegment(deviceId)}`;
}

/**
 * Converts one receiver device ID into its stable public object root.
 *
 * @param deviceId - Normalized 12-character receiver identifier.
 */
export function airPlayReceiverObjectId(deviceId: string): string {
	return `devices.airplayReceiver.${normalizedDeviceSegment(deviceId)}`;
}

/**
 * Converts one HomePod device ID into its stable public object root.
 *
 * @param deviceId - Normalized 12-character HomePod identifier.
 */
export function homePodObjectId(deviceId: string): string {
	return `devices.homepod.${normalizedDeviceSegment(deviceId)}`;
}

/**
 * Validates and normalizes one 12-character protocol identifier.
 *
 * @param deviceId - AirPlay or RAOP device identifier.
 */
function normalizedDeviceSegment(deviceId: string): string {
	const normalized = deviceId.replaceAll(':', '').replaceAll('-', '');
	if (!/^[0-9A-F]{12}$/i.test(normalized)) {
		throw new Error('invalid_device_id');
	}
	return normalized.toLowerCase();
}

/**
 * Creates one structural folder.
 *
 * @param id - Adapter-relative folder ID.
 * @param name - Human-readable folder name.
 */
function folder(id: string, name: string): ObjectDefinition {
	return { id, object: { type: 'folder', common: { name }, native: {} } };
}

/**
 * Creates one structural channel.
 *
 * @param id - Adapter-relative channel ID.
 * @param name - Human-readable channel name.
 */
function channel(id: string, name: string): ObjectDefinition {
	return { id, object: { type: 'channel', common: { name }, native: {} } };
}

/**
 * Creates one leaf state.
 *
 * @param id - Adapter-relative state ID.
 * @param name - Human-readable state name.
 * @param common - State metadata except the name.
 */
function state(id: string, name: string, common: StateCommonWithoutName): ObjectDefinition {
	return { id, object: { type: 'state', common: { ...common, name }, native: {} } };
}

/**
 * Creates homogeneous boolean command buttons below one functional channel.
 *
 * @param root - Adapter-relative Apple TV device root.
 * @param channelId - Functional owner of the command buttons.
 * @param commands - Capability-specific command vocabulary.
 */
function commandButtons(
	root: string,
	channelId: 'remote' | 'playback' | 'power',
	commands: readonly AppleTvRemoteCommand[],
): ObjectDefinition[] {
	return commands.map(command =>
		state(`${root}.${channelId}.${command}`, `${channelId} ${command}`, {
			type: 'boolean',
			role: 'button',
			read: false,
			write: true,
			def: false,
		}),
	);
}

/**
 * Creates standard read-only boolean metadata.
 *
 * @param role - ioBroker state role.
 * @param def - Safe default value.
 */
function booleanCommon(role: string, def: boolean): StateCommonWithoutName {
	return { type: 'boolean', role, read: true, write: false, def };
}

/**
 * Creates standard read-only string metadata.
 *
 * @param role - ioBroker state role.
 * @param def - Safe default value.
 */
function stringCommon(role: string, def: string): StateCommonWithoutName {
	return { type: 'string', role, read: true, write: false, def };
}

/**
 * Creates standard read-only numeric metadata.
 *
 * @param role - ioBroker state role.
 * @param def - Safe default value.
 * @param metadata - Optional numeric bounds and unit.
 */
function numberCommon(
	role: string,
	def: number,
	metadata: Pick<ioBroker.StateCommon, 'min' | 'max' | 'unit'> = {},
): StateCommonWithoutName {
	return { type: 'number', role, read: true, write: false, def, ...metadata };
}
