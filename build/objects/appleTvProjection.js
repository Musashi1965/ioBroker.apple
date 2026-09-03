"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var appleTvProjection_exports = {};
__export(appleTvProjection_exports, {
  AppleTvProjection: () => AppleTvProjection
});
module.exports = __toCommonJS(appleTvProjection_exports);
var import_appleTv = require("../domain/appleTv");
var import_homePod = require("../domain/homePod");
var import_objectDefinitions = require("./objectDefinitions");
class AppleTvProjection {
  /**
   * Creates one public projection.
   *
   * @param adapter - Narrow ioBroker object and state API.
   */
  constructor(adapter) {
    this.adapter = adapter;
  }
  /** Reconciles instance objects and safe startup defaults. */
  async initialize() {
    await this.reconcile((0, import_objectDefinitions.instanceObjectDefinitions)());
    await this.markAirPlayReceiversUnavailable(/* @__PURE__ */ new Set());
    await this.markHomePodsUnavailable(/* @__PURE__ */ new Set());
    await Promise.all([
      this.write("info.connection", false),
      this.write("info.discoveryRunning", false),
      this.write("info.deviceCount", 0),
      this.write("info.lastError", ""),
      this.write("devices.appletv.info.deviceCount", 0),
      this.write("devices.homepod.info.deviceCount", 0),
      this.write("devices.airplayReceiver.info.deviceCount", 0)
    ]);
  }
  /**
   * Reconciles strongly identified HomePods from one successful scan.
   *
   * @param targets - Controllable HomePods in the successful scan.
   * @param seenAt - Shared scan completion time.
   */
  async homePods(targets, seenAt) {
    const currentRoots = new Set(targets.map((target) => (0, import_objectDefinitions.homePodObjectId)(target.deviceId)));
    await this.markHomePodsUnavailable(currentRoots);
    for (const target of targets) {
      await this.reconcile((0, import_objectDefinitions.homePodObjectDefinitions)(target));
      const root = (0, import_objectDefinitions.homePodObjectId)(target.deviceId);
      await Promise.all([
        this.write(`${root}.info.name`, target.name),
        this.write(`${root}.info.type`, "homepod"),
        this.write(`${root}.info.model`, target.model),
        this.write(`${root}.info.deviceId`, target.deviceId),
        this.write(`${root}.info.lastSeen`, seenAt),
        this.write(`${root}.discovery.available`, true),
        this.write(`${root}.services.airplay`, true),
        this.write(`${root}.services.raop`, target.raop !== void 0),
        this.write(`${root}.pairing.mode`, "transient")
      ]);
    }
  }
  /**
   * Writes safe HomePod defaults before the first transient connection.
   *
   * @param deviceId - Stable normalized HomePod identifier.
   */
  async initializeHomePod(deviceId) {
    const root = (0, import_objectDefinitions.homePodObjectId)(deviceId);
    await this.homePodConnection(deviceId, {
      state: "discovered",
      online: false,
      pairing: "idle"
    });
    await this.homePodSnapshot(deviceId, (0, import_homePod.emptyHomePodSnapshot)());
    await Promise.all([
      this.write(`${root}.lastCommand.name`, ""),
      this.write(`${root}.lastCommand.status`, "idle"),
      this.write(`${root}.lastCommand.error`, ""),
      this.write(`${root}.lastCommand.completedAt`, 0)
    ]);
  }
  /**
   * Projects one HomePod connection and transient-pairing transition.
   *
   * @param deviceId - Stable normalized HomePod identifier.
   * @param status - Normalized connection state.
   */
  async homePodConnection(deviceId, status) {
    var _a;
    const root = (0, import_objectDefinitions.homePodObjectId)(deviceId);
    await Promise.all([
      this.write(`${root}.connection.state`, status.state),
      this.write(`${root}.connection.online`, status.online),
      this.write(`${root}.connection.lastError`, (_a = status.error) != null ? _a : ""),
      this.write(`${root}.pairing.status`, status.pairing)
    ]);
  }
  /**
   * Projects push-driven HomePod media and capability state.
   *
   * @param deviceId - Stable normalized HomePod identifier.
   * @param snapshot - Normalized scalar snapshot.
   */
  async homePodSnapshot(deviceId, snapshot) {
    const root = (0, import_objectDefinitions.homePodObjectId)(deviceId);
    await this.reconcile(
      (0, import_objectDefinitions.homePodControlObjectDefinitions)(deviceId, snapshot.capabilities.playback, snapshot.capabilities.volume)
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
      this.write(`${root}.volume.muted`, snapshot.muted)
    ]);
  }
  /**
   * Marks one accepted HomePod command pending.
   *
   * @param deviceId - Stable normalized HomePod identifier.
   * @param command - Accepted normalized command.
   */
  async homePodCommandStarted(deviceId, command) {
    const root = (0, import_objectDefinitions.homePodObjectId)(deviceId);
    await Promise.all([
      this.write(`${root}.lastCommand.name`, command),
      this.write(`${root}.lastCommand.status`, "pending"),
      this.write(`${root}.lastCommand.error`, ""),
      this.write(`${root}.lastCommand.completedAt`, 0)
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
  async homePodCommandResult(deviceId, command, status, error = "", acknowledgedValue) {
    const root = (0, import_objectDefinitions.homePodObjectId)(deviceId);
    const writes = [
      this.write(`${root}.lastCommand.name`, command),
      this.write(`${root}.lastCommand.status`, status),
      this.write(`${root}.lastCommand.error`, error),
      this.write(`${root}.lastCommand.completedAt`, Date.now())
    ];
    if (import_objectDefinitions.HOME_POD_PLAYBACK_COMMANDS.some((value) => value === command)) {
      writes.push(this.write(`${root}.playback.${command}`, false));
    } else if (command === "setVolume" && typeof acknowledgedValue === "number") {
      writes.push(this.write(`${root}.volume.level`, acknowledgedValue));
    } else if (command === "setMuted" && typeof acknowledgedValue === "boolean") {
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
  async airPlayReceivers(targets, seenAt) {
    const currentRoots = new Set(targets.map((target) => (0, import_objectDefinitions.airPlayReceiverObjectId)(target.deviceId)));
    await this.markAirPlayReceiversUnavailable(currentRoots);
    for (const target of targets) {
      await this.reconcile((0, import_objectDefinitions.airPlayReceiverObjectDefinitions)(target));
      const root = (0, import_objectDefinitions.airPlayReceiverObjectId)(target.deviceId);
      await Promise.all([
        this.write(`${root}.info.name`, target.name),
        this.write(`${root}.info.type`, "airplayReceiver"),
        this.write(`${root}.info.model`, target.model),
        this.write(`${root}.info.deviceId`, target.deviceId),
        this.write(`${root}.info.lastSeen`, seenAt),
        this.write(`${root}.discovery.available`, true),
        this.write(`${root}.services.airplay`, target.airplay !== void 0),
        this.write(`${root}.services.raop`, target.raop !== void 0)
      ]);
    }
  }
  /**
   * Removes HomePod trees that are not both locally managed and active.
   *
   * @param deviceIds
   */
  async retainManagedHomePods(deviceIds) {
    await this.removeUnretainedDeviceRoots("homepod", new Set(deviceIds.map(import_objectDefinitions.homePodObjectId)));
  }
  /**
   * Removes AirPlay Receiver trees that are not both locally managed and active.
   *
   * @param deviceIds
   */
  async retainManagedAirPlayReceivers(deviceIds) {
    await this.removeUnretainedDeviceRoots("airplayReceiver", new Set(deviceIds.map(import_objectDefinitions.airPlayReceiverObjectId)));
  }
  /**
   * Removes one complete adapter-owned HomePod tree.
   *
   * @param deviceId
   */
  async removeHomePod(deviceId) {
    await this.removeObjectTreeIfPresent((0, import_objectDefinitions.homePodObjectId)(deviceId));
  }
  /**
   * Removes one complete adapter-owned AirPlay Receiver tree.
   *
   * @param deviceId
   */
  async removeAirPlayReceiver(deviceId) {
    await this.removeObjectTreeIfPresent((0, import_objectDefinitions.airPlayReceiverObjectId)(deviceId));
  }
  /**
   * Removes current Apple TV trees that are not both paired and active.
   *
   * @param pairedDeviceIds - Complete set of paired and active identifiers to retain.
   */
  async removeUnpairedDevices(pairedDeviceIds) {
    const retainedRoots = new Set(pairedDeviceIds.map(import_objectDefinitions.deviceObjectId));
    const relativePrefix = "devices.";
    const absolutePrefix = `${this.adapter.namespace}.${relativePrefix}`;
    const objects = await this.adapter.getObjectListAsync({
      startkey: absolutePrefix,
      endkey: `${absolutePrefix}\u9999`
    });
    const staleRoots = /* @__PURE__ */ new Set();
    for (const row of objects.rows) {
      const relativeId = row.id.slice(`${this.adapter.namespace}.`.length);
      const currentMatch = /^(devices\.appletv\.[0-9a-f]{12})(?:\.|$)/.exec(relativeId);
      const root = currentMatch == null ? void 0 : currentMatch[1];
      if (root !== void 0 && !retainedRoots.has(root)) {
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
  async removeDevice(deviceId) {
    await this.removeObjectTreeIfPresent((0, import_objectDefinitions.deviceObjectId)(deviceId));
  }
  /**
   * Reconciles and projects a discovered target.
   *
   * @param target - Correlated Apple TV.
   * @param paired - Whether credentials exist.
   * @param remoteAvailable - Whether remote commands may be exposed.
   */
  async discovered(target, paired, remoteAvailable) {
    await this.reconcile((0, import_objectDefinitions.appleTvObjectDefinitions)(target, remoteAvailable));
    const root = (0, import_objectDefinitions.deviceObjectId)(target.deviceId);
    await Promise.all([
      this.write(`${root}.info.name`, target.name),
      this.write(`${root}.info.type`, "appletv"),
      this.write(`${root}.info.model`, target.model),
      this.write(`${root}.info.paired`, paired),
      this.write(`${root}.info.lastSeen`, Date.now()),
      this.write(`${root}.connection.raopAvailable`, target.raop !== void 0)
    ]);
    await this.removeSupersededDeviceObjects(target.deviceId);
  }
  /**
   * Writes deterministic defaults once when a target first enters the runtime.
   *
   * @param deviceId - Stable normalized identifier.
   * @param state - Initial pairing-aware connection state.
   */
  async initializeDevice(deviceId, state) {
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    await this.removeStaleAppEntries(deviceId, /* @__PURE__ */ new Set());
    await this.connection(deviceId, {
      state,
      online: false,
      airplay: false,
      companion: false
    });
    await this.snapshot(deviceId, (0, import_appleTv.emptyAppleTvSnapshot)());
    await Promise.all([
      this.write(`${root}.lastCommand.name`, ""),
      this.write(`${root}.lastCommand.target`, ""),
      this.write(`${root}.lastCommand.status`, "idle"),
      this.write(`${root}.lastCommand.error`, ""),
      this.write(`${root}.lastCommand.completedAt`, 0),
      this.write(`${root}.apps.count`, 0),
      this.write(`${root}.apps.lastRefresh`, 0),
      this.write(`${root}.apps.refreshStatus`, "idle"),
      this.write(`${root}.apps.lastError`, ""),
      this.write(`${root}.apps.available`, "[]")
    ]);
  }
  /**
   * Projects independent connection health.
   *
   * @param deviceId - Stable normalized identifier.
   * @param status - Normalized backend status.
   */
  async connection(deviceId, status) {
    var _a;
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    await Promise.all([
      this.write(`${root}.connection.state`, status.state),
      this.write(`${root}.connection.online`, status.online),
      this.write(`${root}.connection.airplay`, status.airplay),
      this.write(`${root}.connection.companion`, status.companion),
      this.write(`${root}.connection.lastError`, (_a = status.error) != null ? _a : "")
    ]);
  }
  /**
   * Projects one complete scalar snapshot.
   *
   * @param deviceId - Stable normalized identifier.
   * @param snapshot - Normalized backend snapshot.
   */
  async snapshot(deviceId, snapshot) {
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    if (snapshot.capabilities.remote || snapshot.capabilities.playback || snapshot.capabilities.power) {
      await this.reconcileControls(
        deviceId,
        snapshot.capabilities.remote,
        snapshot.capabilities.playback,
        snapshot.capabilities.power
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
      this.write(`${root}.volume.muted`, snapshot.muted)
    ]);
  }
  /**
   * Projects one complete, deterministically ordered launchable-app catalog.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param apps - Complete normalized launchable-app catalog.
   */
  async apps(deviceId, apps) {
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    const entryKeys = (0, import_objectDefinitions.appEntryKeys)(apps);
    await this.reconcileApps(deviceId);
    await this.removeStaleAppEntries(deviceId, new Set(entryKeys.values()));
    for (const app of apps) {
      const entryKey = entryKeys.get(app.bundleId);
      if (entryKey === void 0) {
        throw new Error("invalid_app_catalog");
      }
      await this.reconcile((0, import_objectDefinitions.appleTvAppEntryObjectDefinitions)(deviceId, app, entryKey));
      const entry = `${root}.apps.entries.${entryKey}`;
      await Promise.all([
        this.write(`${entry}.name`, app.name),
        this.write(`${entry}.bundleId`, app.bundleId),
        this.write(`${entry}.launch`, false)
      ]);
    }
    await Promise.all([
      this.write(`${root}.apps.count`, apps.length),
      this.write(`${root}.apps.lastRefresh`, Date.now()),
      this.write(`${root}.apps.available`, JSON.stringify(apps))
    ]);
  }
  /**
   * Marks one accepted app operation as pending.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param action - Accepted app operation.
   * @param target - Optional non-secret command target.
   */
  async appCommandStarted(deviceId, action, target = "") {
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    const writes = [
      this.write(`${root}.lastCommand.name`, appCommandName(action)),
      this.write(`${root}.lastCommand.target`, target),
      this.write(`${root}.lastCommand.status`, "pending"),
      this.write(`${root}.lastCommand.error`, ""),
      this.write(`${root}.lastCommand.completedAt`, 0)
    ];
    if (action === "refresh") {
      writes.push(this.write(`${root}.apps.refreshStatus`, "pending"), this.write(`${root}.apps.lastError`, ""));
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
  async appCommandResult(deviceId, action, status, error = "", entryKey, target = "") {
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    const writes = [
      this.write(`${root}.lastCommand.name`, appCommandName(action)),
      this.write(`${root}.lastCommand.target`, target),
      this.write(`${root}.lastCommand.status`, status),
      this.write(`${root}.lastCommand.error`, error),
      this.write(`${root}.lastCommand.completedAt`, Date.now())
    ];
    if (action === "refresh") {
      writes.push(
        this.write(`${root}.apps.refresh`, false),
        this.write(`${root}.apps.refreshStatus`, status),
        this.write(`${root}.apps.lastError`, error)
      );
    }
    if (action === "openurl") {
      writes.push(this.write(`${root}.apps.openurl`, ""));
    }
    if (entryKey !== void 0 && (0, import_objectDefinitions.isAppEntryKey)(entryKey)) {
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
  async commandStarted(deviceId, command, target = "") {
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    await Promise.all([
      this.write(`${root}.lastCommand.name`, command),
      this.write(`${root}.lastCommand.target`, target),
      this.write(`${root}.lastCommand.status`, "pending"),
      this.write(`${root}.lastCommand.error`, ""),
      this.write(`${root}.lastCommand.completedAt`, 0)
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
  async commandResult(deviceId, command, status, error = "") {
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    await Promise.all([
      this.write(`${root}.lastCommand.name`, command),
      this.write(`${root}.lastCommand.status`, status),
      this.write(`${root}.lastCommand.error`, error),
      this.write(`${root}.lastCommand.completedAt`, Date.now()),
      this.write((0, import_objectDefinitions.appleTvCommandStateId)(deviceId, command), false)
    ]);
  }
  /**
   * Writes aggregate adapter status.
   *
   * @param deviceCounts - Exclusive device-class counts from the latest scan.
   * @param connected - Whether at least one target is usable.
   * @param error - Optional stable scan error.
   */
  async aggregate(deviceCounts, connected, error = "") {
    const total = deviceCounts.appletv + deviceCounts.homepod + deviceCounts.airplayReceiver;
    await Promise.all([
      this.write("info.deviceCount", total),
      this.write("info.connection", connected),
      this.write("info.lastError", error),
      this.write("info.lastDiscovery", Date.now()),
      this.write("devices.appletv.info.deviceCount", deviceCounts.appletv),
      this.write("devices.homepod.info.deviceCount", deviceCounts.homepod),
      this.write("devices.airplayReceiver.info.deviceCount", deviceCounts.airplayReceiver)
    ]);
  }
  /**
   * Updates only the aggregate connection flag between discovery runs.
   *
   * @param connected - Whether at least one target is usable.
   */
  async adapterConnection(connected) {
    await this.write("info.connection", connected);
  }
  /**
   * Writes the bounded discovery activity flag.
   *
   * @param running - Whether the isolated scan is active.
   */
  async discoveryRunning(running) {
    await this.write("info.discoveryRunning", running);
  }
  /**
   * Ensures writable states once their owning capabilities are confirmed.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param remoteAvailable - Whether directional and menu commands are supported.
   * @param playbackAvailable - Whether media transport commands are supported.
   * @param powerAvailable - Whether power commands are supported.
   */
  async reconcileControls(deviceId, remoteAvailable, playbackAvailable, powerAvailable) {
    await this.reconcile(
      (0, import_objectDefinitions.appleTvControlObjectDefinitions)(deviceId, remoteAvailable, playbackAvailable, powerAvailable)
    );
  }
  /**
   * Ensures writable app states once Companion Link app capability is confirmed.
   *
   * @param deviceId - Stable normalized device identifier.
   */
  async reconcileApps(deviceId) {
    await this.reconcile((0, import_objectDefinitions.appleTvAppsObjectDefinitions)(deviceId));
  }
  /**
   * Removes only obsolete adapter-owned app channels after a successful refresh.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param currentKeys - Complete set of current readable app keys.
   */
  async removeStaleAppEntries(deviceId, currentKeys) {
    const root = `${(0, import_objectDefinitions.deviceObjectId)(deviceId)}.apps.entries`;
    const absolutePrefix = `${this.adapter.namespace}.${root}.`;
    const objects = await this.adapter.getObjectListAsync({
      startkey: absolutePrefix,
      endkey: `${absolutePrefix}\u9999`
    });
    const staleKeys = /* @__PURE__ */ new Set();
    for (const row of objects.rows) {
      const suffix = row.id.slice(absolutePrefix.length);
      const key = suffix.split(".", 1)[0];
      if (key !== void 0 && !currentKeys.has(key)) {
        if (!(0, import_objectDefinitions.isAppEntryKey)(key)) {
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
  async removeSupersededDeviceObjects(deviceId) {
    const root = (0, import_objectDefinitions.deviceObjectId)(deviceId);
    for (const obsoleteId of [
      `${root}.command`,
      `${root}.apps.command`,
      `${root}.apps.launch`,
      `${root}.remote.playPause`,
      `${root}.remote.powerOn`,
      `${root}.remote.powerOff`
    ]) {
      await this.removeObjectTreeIfPresent(obsoleteId);
    }
  }
  /**
   * Marks learned HomePod roots safe and unavailable after startup or a successful absence scan.
   *
   * @param currentRoots - HomePod roots present in the successful scan.
   */
  async markHomePodsUnavailable(currentRoots) {
    const relativePrefix = "devices.homepod.";
    const absolutePrefix = `${this.adapter.namespace}.${relativePrefix}`;
    const objects = await this.adapter.getObjectListAsync({
      startkey: absolutePrefix,
      endkey: `${absolutePrefix}\u9999`
    });
    const roots = /* @__PURE__ */ new Set();
    for (const row of objects.rows) {
      const relativeId = row.id.slice(`${this.adapter.namespace}.`.length);
      const match = /^(devices\.homepod\.[0-9a-f]{12})(?:\.|$)/.exec(relativeId);
      if ((match == null ? void 0 : match[1]) !== void 0 && !currentRoots.has(match[1])) {
        roots.add(match[1]);
      }
    }
    for (const root of roots) {
      await Promise.all([
        this.write(`${root}.discovery.available`, false),
        this.write(`${root}.services.airplay`, false),
        this.write(`${root}.services.raop`, false),
        this.write(`${root}.connection.state`, "unavailable"),
        this.write(`${root}.connection.online`, false),
        this.write(`${root}.connection.lastError`, ""),
        this.write(`${root}.pairing.status`, "idle"),
        this.write(`${root}.capabilities.playback`, false),
        this.write(`${root}.capabilities.nowPlaying`, false),
        this.write(`${root}.capabilities.volume`, false),
        this.write(`${root}.nowPlaying.title`, ""),
        this.write(`${root}.nowPlaying.artist`, ""),
        this.write(`${root}.nowPlaying.album`, ""),
        this.write(`${root}.nowPlaying.duration`, 0),
        this.write(`${root}.nowPlaying.position`, 0),
        this.write(`${root}.nowPlaying.isPlaying`, false),
        this.write(`${root}.volume.available`, false),
        this.write(`${root}.volume.level`, 0),
        this.write(`${root}.volume.muted`, false)
      ]);
    }
  }
  /**
   * Marks known receiver roots absent only after a successful complete scan.
   *
   * @param currentRoots - Receiver roots present in the successful scan.
   */
  async markAirPlayReceiversUnavailable(currentRoots) {
    const relativePrefix = "devices.airplayReceiver.";
    const absolutePrefix = `${this.adapter.namespace}.${relativePrefix}`;
    const objects = await this.adapter.getObjectListAsync({
      startkey: absolutePrefix,
      endkey: `${absolutePrefix}\u9999`
    });
    const roots = /* @__PURE__ */ new Set();
    for (const row of objects.rows) {
      const relativeId = row.id.slice(`${this.adapter.namespace}.`.length);
      const match = /^(devices\.airplayReceiver\.[0-9a-f]{12})(?:\.|$)/.exec(relativeId);
      if ((match == null ? void 0 : match[1]) !== void 0 && !currentRoots.has(match[1])) {
        roots.add(match[1]);
      }
    }
    for (const root of roots) {
      await Promise.all([
        this.write(`${root}.discovery.available`, false),
        this.write(`${root}.services.airplay`, false),
        this.write(`${root}.services.raop`, false)
      ]);
    }
  }
  /**
   * Deletes device roots excluded by the explicit local management inventory.
   *
   * @param deviceClass - Technical object-tree class segment.
   * @param retainedRoots - Complete set of active roots to preserve.
   */
  async removeUnretainedDeviceRoots(deviceClass, retainedRoots) {
    var _a;
    const relativePrefix = `devices.${deviceClass}.`;
    const absolutePrefix = `${this.adapter.namespace}.${relativePrefix}`;
    const objects = await this.adapter.getObjectListAsync({
      startkey: absolutePrefix,
      endkey: `${absolutePrefix}\u9999`
    });
    const expression = new RegExp(`^(devices\\.${deviceClass}\\.[0-9a-f]{12})(?:\\.|$)`);
    const staleRoots = /* @__PURE__ */ new Set();
    for (const row of objects.rows) {
      const relativeId = row.id.slice(`${this.adapter.namespace}.`.length);
      const root = (_a = expression.exec(relativeId)) == null ? void 0 : _a[1];
      if (root !== void 0 && !retainedRoots.has(root)) {
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
  async removeObjectTreeIfPresent(root) {
    const absoluteRoot = `${this.adapter.namespace}.${root}`;
    const objects = await this.adapter.getObjectListAsync({
      startkey: absoluteRoot,
      endkey: `${absoluteRoot}\u9999`
    });
    if (objects.rows.some((row) => row.id === absoluteRoot || row.id.startsWith(`${absoluteRoot}.`))) {
      await this.adapter.delObjectAsync(root, { recursive: true });
    }
  }
  /**
   * Reconciles object fragments idempotently.
   *
   * @param definitions - Complete fragments to merge.
   */
  async reconcile(definitions) {
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
  async write(id, value) {
    await this.adapter.setStateAsync(id, value, true);
  }
}
function appCommandName(action) {
  return action === "refresh" ? "refreshApps" : action === "launch" ? "launchApp" : "openUrl";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AppleTvProjection
});
//# sourceMappingURL=appleTvProjection.js.map
