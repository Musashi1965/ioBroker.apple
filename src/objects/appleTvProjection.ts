import type {
	AppleDeviceCounts,
	DiscoveredAirPlayReceiver,
	DiscoveredAppleTv,
	DiscoveredHomePod,
} from '../backends/apple/discoveryTypes';
import {
	emptyAppleTvSnapshot,
	type AppleTvApp,
	type AppleTvConnectionState,
	type AppleTvConnectionStatus,
	type AppleTvRemoteCommand,
	type AppleTvSnapshot,
} from '../domain/appleTv';
import {
	emptyHomePodSnapshot,
	type HomePodCommand,
	type HomePodConnectionStatus,
	type HomePodSnapshot,
} from '../domain/homePod';
import {
	airPlayReceiverObjectDefinitions,
	airPlayReceiverObjectId,
	appleTvAppsObjectDefinitions,
	appleTvAppEntryObjectDefinitions,
	appEntryKeys,
	appleTvCommandStateId,
	appleTvControlObjectDefinitions,
	appleTvObjectDefinitions,
	deviceObjectId,
	homePodControlObjectDefinitions,
	homePodObjectDefinitions,
	homePodObjectId,
	HOME_POD_PLAYBACK_COMMANDS,
	instanceObjectDefinitions,
	isAppEntryKey,
} from './objectDefinitions';

type ProjectionAdapter = Pick<
	ioBroker.Adapter,
	'delObjectAsync' | 'extendObjectAsync' | 'getObjectListAsync' | 'namespace' | 'setStateAsync'
>;

type AppleTvAppAction = 'refresh' | 'launch' | 'openurl';

/** Idempotent ioBroker object and state projection for the current contract. */
export class AppleTvProjection {
	/**
	 * Creates one public projection.
	 *
	 * @param adapter - Narrow ioBroker object and state API.
	 */
	public constructor(private readonly adapter: ProjectionAdapter) {}

	/** Reconciles instance objects and safe startup defaults. */
	public async initialize(): Promise<void> {
		await this.reconcile(instanceObjectDefinitions());
		await this.markAirPlayReceiversUnavailable(new Set());
		await this.markHomePodsUnavailable(new Set());
		await Promise.all([
			this.write('info.connection', false),
			this.write('info.discoveryRunning', false),
			this.write('info.deviceCount', 0),
			this.write('info.lastError', ''),
			this.write('devices.appletv.info.deviceCount', 0),
			this.write('devices.homepod.info.deviceCount', 0),
			this.write('devices.airplayReceiver.info.deviceCount', 0),
		]);
	}

	/**
	 * Reconciles strongly identified HomePods from one successful scan.
	 *
	 * @param targets - Controllable HomePods in the successful scan.
	 * @param seenAt - Shared scan completion time.
	 */
	public async homePods(targets: readonly DiscoveredHomePod[], seenAt: number): Promise<void> {
		const currentRoots = new Set(targets.map(target => homePodObjectId(target.deviceId)));
		await this.markHomePodsUnavailable(currentRoots);
		for (const target of targets) {
			await this.reconcile(homePodObjectDefinitions(target));
			const root = homePodObjectId(target.deviceId);
			await Promise.all([
				this.write(`${root}.info.name`, target.name),
				this.write(`${root}.info.type`, 'homepod'),
				this.write(`${root}.info.model`, target.model),
				this.write(`${root}.info.deviceId`, target.deviceId),
				this.write(`${root}.info.lastSeen`, seenAt),
				this.write(`${root}.discovery.available`, true),
				this.write(`${root}.services.airplay`, true),
				this.write(`${root}.services.raop`, target.raop !== undefined),
				this.write(`${root}.pairing.mode`, 'transient'),
			]);
		}
	}

	/**
	 * Writes safe HomePod defaults before the first transient connection.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 */
	public async initializeHomePod(deviceId: string): Promise<void> {
		const root = homePodObjectId(deviceId);
		await this.homePodConnection(deviceId, {
			state: 'discovered',
			online: false,
			pairing: 'idle',
		});
		await this.homePodSnapshot(deviceId, emptyHomePodSnapshot());
		await Promise.all([
			this.write(`${root}.lastCommand.name`, ''),
			this.write(`${root}.lastCommand.status`, 'idle'),
			this.write(`${root}.lastCommand.error`, ''),
			this.write(`${root}.lastCommand.completedAt`, 0),
		]);
	}

	/**
	 * Projects one HomePod connection and transient-pairing transition.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param status - Normalized connection state.
	 */
	public async homePodConnection(deviceId: string, status: HomePodConnectionStatus): Promise<void> {
		const root = homePodObjectId(deviceId);
		await Promise.all([
			this.write(`${root}.connection.state`, status.state),
			this.write(`${root}.connection.online`, status.online),
			this.write(`${root}.connection.lastError`, status.error ?? ''),
			this.write(`${root}.pairing.status`, status.pairing),
		]);
	}

	/**
	 * Projects push-driven HomePod media and capability state.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param snapshot - Normalized scalar snapshot.
	 */
	public async homePodSnapshot(deviceId: string, snapshot: HomePodSnapshot): Promise<void> {
		const root = homePodObjectId(deviceId);
		await this.reconcile(
			homePodControlObjectDefinitions(deviceId, snapshot.capabilities.playback, snapshot.capabilities.volume),
		);
		await Promise.all([
			this.write(`${root}.capabilities.playback`, snapshot.capabilities.playback),
			this.write(`${root}.capabilities.nowPlaying`, snapshot.capabilities.nowPlaying),
			this.write(`${root}.capabilities.volume`, snapshot.capabilities.volume),
			this.write(`${root}.nowPlaying.title`, snapshot.title),
			this.write(`${root}.nowPlaying.artist`, snapshot.artist),
			this.write(`${root}.nowPlaying.album`, snapshot.album),
			this.write(`${root}.nowPlaying.duration`, snapshot.duration),
			this.write(`${root}.nowPlaying.position`, snapshot.position),
			this.write(`${root}.nowPlaying.isPlaying`, snapshot.isPlaying),
			this.write(`${root}.volume.available`, snapshot.volumeAvailable),
			this.write(`${root}.volume.level`, snapshot.volume),
			this.write(`${root}.volume.muted`, snapshot.muted),
		]);
	}

	/**
	 * Marks one accepted HomePod command pending.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param command - Accepted normalized command.
	 */
	public async homePodCommandStarted(deviceId: string, command: HomePodCommand): Promise<void> {
		const root = homePodObjectId(deviceId);
		await Promise.all([
			this.write(`${root}.lastCommand.name`, command),
			this.write(`${root}.lastCommand.status`, 'pending'),
			this.write(`${root}.lastCommand.error`, ''),
			this.write(`${root}.lastCommand.completedAt`, 0),
		]);
	}

	/**
	 * Projects one HomePod command result and acknowledges its submitted state.
	 *
	 * @param deviceId - Stable normalized HomePod identifier.
	 * @param command - Completed normalized command.
	 * @param status - Stable operation result.
	 * @param error - Optional stable error code.
	 * @param acknowledgedValue - Submitted or restored writable scalar.
	 */
	public async homePodCommandResult(
		deviceId: string,
		command: HomePodCommand,
		status: 'success' | 'error',
		error = '',
		acknowledgedValue?: number | boolean,
	): Promise<void> {
		const root = homePodObjectId(deviceId);
		const writes = [
			this.write(`${root}.lastCommand.name`, command),
			this.write(`${root}.lastCommand.status`, status),
			this.write(`${root}.lastCommand.error`, error),
			this.write(`${root}.lastCommand.completedAt`, Date.now()),
		];
		if (HOME_POD_PLAYBACK_COMMANDS.some(value => value === command)) {
			writes.push(this.write(`${root}.playback.${command}`, false));
		} else if (command === 'setVolume' && typeof acknowledgedValue === 'number') {
			writes.push(this.write(`${root}.volume.level`, acknowledgedValue));
		} else if (command === 'setMuted' && typeof acknowledgedValue === 'boolean') {
			writes.push(this.write(`${root}.volume.muted`, acknowledgedValue));
		}
		await Promise.all(writes);
	}

	/**
	 * Reconciles receivers from one successful scan and marks absent known roots unavailable.
	 *
	 * @param targets - Generic receivers backed by durable protocol identifiers.
	 * @param seenAt - Completion time shared by the complete successful scan.
	 */
	public async airPlayReceivers(targets: readonly DiscoveredAirPlayReceiver[], seenAt: number): Promise<void> {
		const currentRoots = new Set(targets.map(target => airPlayReceiverObjectId(target.deviceId)));
		await this.markAirPlayReceiversUnavailable(currentRoots);
		for (const target of targets) {
			await this.reconcile(airPlayReceiverObjectDefinitions(target));
			const root = airPlayReceiverObjectId(target.deviceId);
			await Promise.all([
				this.write(`${root}.info.name`, target.name),
				this.write(`${root}.info.type`, 'airplayReceiver'),
				this.write(`${root}.info.model`, target.model),
				this.write(`${root}.info.deviceId`, target.deviceId),
				this.write(`${root}.info.lastSeen`, seenAt),
				this.write(`${root}.discovery.available`, true),
				this.write(`${root}.services.airplay`, target.airplay !== undefined),
				this.write(`${root}.services.raop`, target.raop !== undefined),
			]);
		}
	}

	/**
	 * Removes HomePod trees that are not both locally managed and active.
	 *
	 * @param deviceIds
	 */
	public async retainManagedHomePods(deviceIds: readonly string[]): Promise<void> {
		await this.removeUnretainedDeviceRoots('homepod', new Set(deviceIds.map(homePodObjectId)));
	}

	/**
	 * Removes AirPlay Receiver trees that are not both locally managed and active.
	 *
	 * @param deviceIds
	 */
	public async retainManagedAirPlayReceivers(deviceIds: readonly string[]): Promise<void> {
		await this.removeUnretainedDeviceRoots('airplayReceiver', new Set(deviceIds.map(airPlayReceiverObjectId)));
	}

	/**
	 * Removes one complete adapter-owned HomePod tree.
	 *
	 * @param deviceId
	 */
	public async removeHomePod(deviceId: string): Promise<void> {
		await this.removeObjectTreeIfPresent(homePodObjectId(deviceId));
	}

	/**
	 * Removes one complete adapter-owned AirPlay Receiver tree.
	 *
	 * @param deviceId
	 */
	public async removeAirPlayReceiver(deviceId: string): Promise<void> {
		await this.removeObjectTreeIfPresent(airPlayReceiverObjectId(deviceId));
	}

	/**
	 * Removes current Apple TV trees that are not both paired and active.
	 *
	 * @param pairedDeviceIds - Complete set of paired and active identifiers to retain.
	 */
	public async removeUnpairedDevices(pairedDeviceIds: readonly string[]): Promise<void> {
		const retainedRoots = new Set(pairedDeviceIds.map(deviceObjectId));
		const relativePrefix = 'devices.';
		const absolutePrefix = `${this.adapter.namespace}.${relativePrefix}`;
		const objects = await this.adapter.getObjectListAsync({
			startkey: absolutePrefix,
			endkey: `${absolutePrefix}\u9999`,
		});
		const staleRoots = new Set<string>();
		for (const row of objects.rows) {
			const relativeId = row.id.slice(`${this.adapter.namespace}.`.length);
			const currentMatch = /^(devices\.appletv\.[0-9a-f]{12})(?:\.|$)/.exec(relativeId);
			const root = currentMatch?.[1];
			if (root !== undefined && !retainedRoots.has(root)) {
				staleRoots.add(root);
			}
		}
		for (const root of staleRoots) {
			await this.adapter.delObjectAsync(root, { recursive: true });
		}
	}

	/**
	 * Removes one complete adapter-owned Apple TV device tree.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 */
	public async removeDevice(deviceId: string): Promise<void> {
		await this.removeObjectTreeIfPresent(deviceObjectId(deviceId));
	}

	/**
	 * Reconciles and projects a discovered target.
	 *
	 * @param target - Correlated Apple TV.
	 * @param paired - Whether credentials exist.
	 * @param remoteAvailable - Whether remote commands may be exposed.
	 */
	public async discovered(target: DiscoveredAppleTv, paired: boolean, remoteAvailable: boolean): Promise<void> {
		await this.reconcile(appleTvObjectDefinitions(target, remoteAvailable));
		const root = deviceObjectId(target.deviceId);
		await Promise.all([
			this.write(`${root}.info.name`, target.name),
			this.write(`${root}.info.type`, 'appletv'),
			this.write(`${root}.info.model`, target.model),
			this.write(`${root}.info.paired`, paired),
			this.write(`${root}.info.lastSeen`, Date.now()),
			this.write(`${root}.connection.raopAvailable`, target.raop !== undefined),
		]);
		await this.removeSupersededDeviceObjects(target.deviceId);
	}

	/**
	 * Writes deterministic defaults once when a target first enters the runtime.
	 *
	 * @param deviceId - Stable normalized identifier.
	 * @param state - Initial pairing-aware connection state.
	 */
	public async initializeDevice(deviceId: string, state: AppleTvConnectionState): Promise<void> {
		const root = deviceObjectId(deviceId);
		await this.removeStaleAppEntries(deviceId, new Set());
		await this.connection(deviceId, {
			state,
			online: false,
			airplay: false,
			companion: false,
		});
		await this.snapshot(deviceId, emptyAppleTvSnapshot());
		await Promise.all([
			this.write(`${root}.lastCommand.name`, ''),
			this.write(`${root}.lastCommand.target`, ''),
			this.write(`${root}.lastCommand.status`, 'idle'),
			this.write(`${root}.lastCommand.error`, ''),
			this.write(`${root}.lastCommand.completedAt`, 0),
			this.write(`${root}.apps.count`, 0),
			this.write(`${root}.apps.lastRefresh`, 0),
			this.write(`${root}.apps.refreshStatus`, 'idle'),
			this.write(`${root}.apps.lastError`, ''),
			this.write(`${root}.apps.available`, '[]'),
		]);
	}

	/**
	 * Projects independent connection health.
	 *
	 * @param deviceId - Stable normalized identifier.
	 * @param status - Normalized backend status.
	 */
	public async connection(deviceId: string, status: AppleTvConnectionStatus): Promise<void> {
		const root = deviceObjectId(deviceId);
		await Promise.all([
			this.write(`${root}.connection.state`, status.state),
			this.write(`${root}.connection.online`, status.online),
			this.write(`${root}.connection.airplay`, status.airplay),
			this.write(`${root}.connection.companion`, status.companion),
			this.write(`${root}.connection.lastError`, status.error ?? ''),
		]);
	}

	/**
	 * Projects one complete scalar snapshot.
	 *
	 * @param deviceId - Stable normalized identifier.
	 * @param snapshot - Normalized backend snapshot.
	 */
	public async snapshot(deviceId: string, snapshot: AppleTvSnapshot): Promise<void> {
		const root = deviceObjectId(deviceId);
		if (snapshot.capabilities.remote || snapshot.capabilities.playback || snapshot.capabilities.power) {
			await this.reconcileControls(
				deviceId,
				snapshot.capabilities.remote,
				snapshot.capabilities.playback,
				snapshot.capabilities.power,
			);
		}
		if (snapshot.capabilities.apps) {
			await this.reconcileApps(deviceId);
		}
		await Promise.all([
			this.write(`${root}.capabilities.remote`, snapshot.capabilities.remote),
			this.write(`${root}.capabilities.playback`, snapshot.capabilities.playback),
			this.write(`${root}.capabilities.power`, snapshot.capabilities.power),
			this.write(`${root}.capabilities.nowPlaying`, snapshot.capabilities.nowPlaying),
			this.write(`${root}.capabilities.volume`, snapshot.capabilities.volume),
			this.write(`${root}.capabilities.apps`, snapshot.capabilities.apps),
			this.write(`${root}.power.state`, snapshot.powerState),
			this.write(`${root}.nowPlaying.title`, snapshot.title),
			this.write(`${root}.nowPlaying.artist`, snapshot.artist),
			this.write(`${root}.nowPlaying.album`, snapshot.album),
			this.write(`${root}.nowPlaying.app`, snapshot.app),
			this.write(`${root}.nowPlaying.bundleId`, snapshot.appBundleId),
			this.write(`${root}.nowPlaying.duration`, snapshot.duration),
			this.write(`${root}.nowPlaying.position`, snapshot.position),
			this.write(`${root}.nowPlaying.isPlaying`, snapshot.isPlaying),
			this.write(`${root}.volume.available`, snapshot.volumeAvailable),
			this.write(`${root}.volume.level`, snapshot.volume),
			this.write(`${root}.volume.muted`, snapshot.muted),
		]);
	}

	/**
	 * Projects one complete, deterministically ordered launchable-app catalog.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param apps - Complete normalized launchable-app catalog.
	 */
	public async apps(deviceId: string, apps: readonly AppleTvApp[]): Promise<void> {
		const root = deviceObjectId(deviceId);
		const entryKeys = appEntryKeys(apps);
		await this.reconcileApps(deviceId);
		await this.removeStaleAppEntries(deviceId, new Set(entryKeys.values()));
		for (const app of apps) {
			const entryKey = entryKeys.get(app.bundleId);
			if (entryKey === undefined) {
				throw new Error('invalid_app_catalog');
			}
			await this.reconcile(appleTvAppEntryObjectDefinitions(deviceId, app, entryKey));
			const entry = `${root}.apps.entries.${entryKey}`;
			await Promise.all([
				this.write(`${entry}.name`, app.name),
				this.write(`${entry}.bundleId`, app.bundleId),
				this.write(`${entry}.launch`, false),
			]);
		}
		await Promise.all([
			this.write(`${root}.apps.count`, apps.length),
			this.write(`${root}.apps.lastRefresh`, Date.now()),
			this.write(`${root}.apps.available`, JSON.stringify(apps)),
		]);
	}

	/**
	 * Marks one accepted app operation as pending.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param action - Accepted app operation.
	 * @param target - Optional non-secret command target.
	 */
	public async appCommandStarted(deviceId: string, action: AppleTvAppAction, target = ''): Promise<void> {
		const root = deviceObjectId(deviceId);
		const writes = [
			this.write(`${root}.lastCommand.name`, appCommandName(action)),
			this.write(`${root}.lastCommand.target`, target),
			this.write(`${root}.lastCommand.status`, 'pending'),
			this.write(`${root}.lastCommand.error`, ''),
			this.write(`${root}.lastCommand.completedAt`, 0),
		];
		if (action === 'refresh') {
			writes.push(this.write(`${root}.apps.refreshStatus`, 'pending'), this.write(`${root}.apps.lastError`, ''));
		}
		await Promise.all(writes);
	}

	/**
	 * Projects an app operation result and acknowledges its writable control.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param action - Completed app operation.
	 * @param status - Stable operation result.
	 * @param error - Optional stable error code.
	 * @param entryKey - Optional per-app control key to acknowledge.
	 * @param target - Optional non-secret command target.
	 */
	public async appCommandResult(
		deviceId: string,
		action: AppleTvAppAction,
		status: 'success' | 'error',
		error = '',
		entryKey?: string,
		target = '',
	): Promise<void> {
		const root = deviceObjectId(deviceId);
		const writes = [
			this.write(`${root}.lastCommand.name`, appCommandName(action)),
			this.write(`${root}.lastCommand.target`, target),
			this.write(`${root}.lastCommand.status`, status),
			this.write(`${root}.lastCommand.error`, error),
			this.write(`${root}.lastCommand.completedAt`, Date.now()),
		];
		if (action === 'refresh') {
			writes.push(
				this.write(`${root}.apps.refresh`, false),
				this.write(`${root}.apps.refreshStatus`, status),
				this.write(`${root}.apps.lastError`, error),
			);
		}
		if (action === 'openurl') {
			writes.push(this.write(`${root}.apps.openurl`, ''));
		}
		if (entryKey !== undefined && isAppEntryKey(entryKey)) {
			writes.push(this.write(`${root}.apps.entries.${entryKey}.launch`, false));
		}
		await Promise.all(writes);
	}

	/**
	 * Marks one accepted command as pending.
	 *
	 * @param deviceId - Stable normalized identifier.
	 * @param command - Public remote command name.
	 * @param target - Optional non-secret command target.
	 */
	public async commandStarted(deviceId: string, command: AppleTvRemoteCommand, target = ''): Promise<void> {
		const root = deviceObjectId(deviceId);
		await Promise.all([
			this.write(`${root}.lastCommand.name`, command),
			this.write(`${root}.lastCommand.target`, target),
			this.write(`${root}.lastCommand.status`, 'pending'),
			this.write(`${root}.lastCommand.error`, ''),
			this.write(`${root}.lastCommand.completedAt`, 0),
		]);
	}

	/**
	 * Projects one command result and acknowledges the button reset.
	 *
	 * @param deviceId - Stable normalized identifier.
	 * @param command - Public remote command name.
	 * @param status - Stable result status.
	 * @param error - Optional stable error code.
	 */
	public async commandResult(
		deviceId: string,
		command: AppleTvRemoteCommand,
		status: 'success' | 'error',
		error = '',
	): Promise<void> {
		const root = deviceObjectId(deviceId);
		await Promise.all([
			this.write(`${root}.lastCommand.name`, command),
			this.write(`${root}.lastCommand.status`, status),
			this.write(`${root}.lastCommand.error`, error),
			this.write(`${root}.lastCommand.completedAt`, Date.now()),
			this.write(appleTvCommandStateId(deviceId, command), false),
		]);
	}

	/**
	 * Writes aggregate adapter status.
	 *
	 * @param deviceCounts - Exclusive device-class counts from the latest scan.
	 * @param connected - Whether at least one target is usable.
	 * @param error - Optional stable scan error.
	 */
	public async aggregate(deviceCounts: AppleDeviceCounts, connected: boolean, error = ''): Promise<void> {
		const total = deviceCounts.appletv + deviceCounts.homepod + deviceCounts.airplayReceiver;
		await Promise.all([
			this.write('info.deviceCount', total),
			this.write('info.connection', connected),
			this.write('info.lastError', error),
			this.write('info.lastDiscovery', Date.now()),
			this.write('devices.appletv.info.deviceCount', deviceCounts.appletv),
			this.write('devices.homepod.info.deviceCount', deviceCounts.homepod),
			this.write('devices.airplayReceiver.info.deviceCount', deviceCounts.airplayReceiver),
		]);
	}

	/**
	 * Updates only the aggregate connection flag between discovery runs.
	 *
	 * @param connected - Whether at least one target is usable.
	 */
	public async adapterConnection(connected: boolean): Promise<void> {
		await this.write('info.connection', connected);
	}

	/**
	 * Writes the bounded discovery activity flag.
	 *
	 * @param running - Whether the isolated scan is active.
	 */
	public async discoveryRunning(running: boolean): Promise<void> {
		await this.write('info.discoveryRunning', running);
	}

	/**
	 * Ensures writable states once their owning capabilities are confirmed.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param remoteAvailable - Whether directional and menu commands are supported.
	 * @param playbackAvailable - Whether media transport commands are supported.
	 * @param powerAvailable - Whether power commands are supported.
	 */
	private async reconcileControls(
		deviceId: string,
		remoteAvailable: boolean,
		playbackAvailable: boolean,
		powerAvailable: boolean,
	): Promise<void> {
		await this.reconcile(
			appleTvControlObjectDefinitions(deviceId, remoteAvailable, playbackAvailable, powerAvailable),
		);
	}

	/**
	 * Ensures writable app states once Companion Link app capability is confirmed.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 */
	private async reconcileApps(deviceId: string): Promise<void> {
		await this.reconcile(appleTvAppsObjectDefinitions(deviceId));
	}

	/**
	 * Removes only obsolete adapter-owned app channels after a successful refresh.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 * @param currentKeys - Complete set of current readable app keys.
	 */
	private async removeStaleAppEntries(deviceId: string, currentKeys: ReadonlySet<string>): Promise<void> {
		const root = `${deviceObjectId(deviceId)}.apps.entries`;
		const absolutePrefix = `${this.adapter.namespace}.${root}.`;
		const objects = await this.adapter.getObjectListAsync({
			startkey: absolutePrefix,
			endkey: `${absolutePrefix}\u9999`,
		});
		const staleKeys = new Set<string>();
		for (const row of objects.rows) {
			const suffix = row.id.slice(absolutePrefix.length);
			const key = suffix.split('.', 1)[0];
			if (key !== undefined && !currentKeys.has(key)) {
				if (!isAppEntryKey(key)) {
					continue;
				}
				staleKeys.add(key);
			}
		}
		for (const key of staleKeys) {
			await this.adapter.delObjectAsync(`${root}.${key}`, { recursive: true });
		}
	}

	/**
	 * Removes superseded channels and controls after their replacements exist.
	 *
	 * @param deviceId - Stable normalized device identifier.
	 */
	private async removeSupersededDeviceObjects(deviceId: string): Promise<void> {
		const root = deviceObjectId(deviceId);
		for (const obsoleteId of [
			`${root}.command`,
			`${root}.apps.command`,
			`${root}.apps.launch`,
			`${root}.remote.playPause`,
			`${root}.remote.powerOn`,
			`${root}.remote.powerOff`,
		]) {
			await this.removeObjectTreeIfPresent(obsoleteId);
		}
	}

	/**
	 * Marks learned HomePod roots safe and unavailable after startup or a successful absence scan.
	 *
	 * @param currentRoots - HomePod roots present in the successful scan.
	 */
	private async markHomePodsUnavailable(currentRoots: ReadonlySet<string>): Promise<void> {
		const relativePrefix = 'devices.homepod.';
		const absolutePrefix = `${this.adapter.namespace}.${relativePrefix}`;
		const objects = await this.adapter.getObjectListAsync({
			startkey: absolutePrefix,
			endkey: `${absolutePrefix}\u9999`,
		});
		const roots = new Set<string>();
		for (const row of objects.rows) {
			const relativeId = row.id.slice(`${this.adapter.namespace}.`.length);
			const match = /^(devices\.homepod\.[0-9a-f]{12})(?:\.|$)/.exec(relativeId);
			if (match?.[1] !== undefined && !currentRoots.has(match[1])) {
				roots.add(match[1]);
			}
		}
		for (const root of roots) {
			await Promise.all([
				this.write(`${root}.discovery.available`, false),
				this.write(`${root}.services.airplay`, false),
				this.write(`${root}.services.raop`, false),
				this.write(`${root}.connection.state`, 'unavailable'),
				this.write(`${root}.connection.online`, false),
				this.write(`${root}.connection.lastError`, ''),
				this.write(`${root}.pairing.status`, 'idle'),
				this.write(`${root}.capabilities.playback`, false),
				this.write(`${root}.capabilities.nowPlaying`, false),
				this.write(`${root}.capabilities.volume`, false),
				this.write(`${root}.nowPlaying.title`, ''),
				this.write(`${root}.nowPlaying.artist`, ''),
				this.write(`${root}.nowPlaying.album`, ''),
				this.write(`${root}.nowPlaying.duration`, 0),
				this.write(`${root}.nowPlaying.position`, 0),
				this.write(`${root}.nowPlaying.isPlaying`, false),
				this.write(`${root}.volume.available`, false),
				this.write(`${root}.volume.level`, 0),
				this.write(`${root}.volume.muted`, false),
			]);
		}
	}

	/**
	 * Marks known receiver roots absent only after a successful complete scan.
	 *
	 * @param currentRoots - Receiver roots present in the successful scan.
	 */
	private async markAirPlayReceiversUnavailable(currentRoots: ReadonlySet<string>): Promise<void> {
		const relativePrefix = 'devices.airplayReceiver.';
		const absolutePrefix = `${this.adapter.namespace}.${relativePrefix}`;
		const objects = await this.adapter.getObjectListAsync({
			startkey: absolutePrefix,
			endkey: `${absolutePrefix}\u9999`,
		});
		const roots = new Set<string>();
		for (const row of objects.rows) {
			const relativeId = row.id.slice(`${this.adapter.namespace}.`.length);
			const match = /^(devices\.airplayReceiver\.[0-9a-f]{12})(?:\.|$)/.exec(relativeId);
			if (match?.[1] !== undefined && !currentRoots.has(match[1])) {
				roots.add(match[1]);
			}
		}
		for (const root of roots) {
			await Promise.all([
				this.write(`${root}.discovery.available`, false),
				this.write(`${root}.services.airplay`, false),
				this.write(`${root}.services.raop`, false),
			]);
		}
	}

	/**
	 * Deletes device roots excluded by the explicit local management inventory.
	 *
	 * @param deviceClass - Technical object-tree class segment.
	 * @param retainedRoots - Complete set of active roots to preserve.
	 */
	private async removeUnretainedDeviceRoots(
		deviceClass: 'homepod' | 'airplayReceiver',
		retainedRoots: ReadonlySet<string>,
	): Promise<void> {
		const relativePrefix = `devices.${deviceClass}.`;
		const absolutePrefix = `${this.adapter.namespace}.${relativePrefix}`;
		const objects = await this.adapter.getObjectListAsync({
			startkey: absolutePrefix,
			endkey: `${absolutePrefix}\u9999`,
		});
		const expression = new RegExp(`^(devices\\.${deviceClass}\\.[0-9a-f]{12})(?:\\.|$)`);
		const staleRoots = new Set<string>();
		for (const row of objects.rows) {
			const relativeId = row.id.slice(`${this.adapter.namespace}.`.length);
			const root = expression.exec(relativeId)?.[1];
			if (root !== undefined && !retainedRoots.has(root)) {
				staleRoots.add(root);
			}
		}
		for (const root of staleRoots) {
			await this.adapter.delObjectAsync(root, { recursive: true });
		}
	}

	/**
	 * Removes one adapter-owned root only when it currently exists.
	 *
	 * @param root - Adapter-relative object-tree root.
	 */
	private async removeObjectTreeIfPresent(root: string): Promise<void> {
		const absoluteRoot = `${this.adapter.namespace}.${root}`;
		const objects = await this.adapter.getObjectListAsync({
			startkey: absoluteRoot,
			endkey: `${absoluteRoot}\u9999`,
		});
		if (objects.rows.some(row => row.id === absoluteRoot || row.id.startsWith(`${absoluteRoot}.`))) {
			await this.adapter.delObjectAsync(root, { recursive: true });
		}
	}

	/**
	 * Reconciles object fragments idempotently.
	 *
	 * @param definitions - Complete fragments to merge.
	 */
	private async reconcile(definitions: readonly { id: string; object: ioBroker.PartialObject }[]): Promise<void> {
		for (const definition of definitions) {
			await this.adapter.extendObjectAsync(definition.id, definition.object);
		}
	}

	/**
	 * Writes one adapter-confirmed state.
	 *
	 * @param id - Adapter-relative state ID.
	 * @param value - Adapter-confirmed scalar value.
	 */
	private async write(id: string, value: ioBroker.StateValue): Promise<void> {
		await this.adapter.setStateAsync(id, value, true);
	}
}

/**
 * Maps internal app actions to stable public command names.
 *
 * @param action - Internal app-operation discriminator.
 */
function appCommandName(action: AppleTvAppAction): 'refreshApps' | 'launchApp' | 'openUrl' {
	return action === 'refresh' ? 'refreshApps' : action === 'launch' ? 'launchApp' : 'openUrl';
}
