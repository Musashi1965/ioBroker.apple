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
var appleRuntime_exports = {};
__export(appleRuntime_exports, {
  AppleRuntime: () => AppleRuntime,
  DeviceManagementError: () => DeviceManagementError,
  parseAppWrite: () => parseAppWrite,
  parseAppleTvCommandStateId: () => parseAppleTvCommandStateId,
  parseAppleTvCommandWrite: () => parseAppleTvCommandWrite,
  parseHomePodWrite: () => parseHomePodWrite
});
module.exports = __toCommonJS(appleRuntime_exports);
var import_objectDefinitions = require("../objects/objectDefinitions");
var import_discoveryProcess = require("../backends/apple/discoveryProcess");
var import_appleTvBackend = require("../backends/apple/appleTvBackend");
var import_appleTvPairing = require("../backends/apple/appleTvPairing");
var import_homePodBackend = require("../backends/apple/homePodBackend");
var import_homePod = require("../domain/homePod");
class DeviceManagementError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "DeviceManagementError";
  }
}
class AppleRuntime {
  /**
   * Creates one adapter runtime.
   *
   * @param projection - Public object/state projection.
   * @param credentialStore - Encrypted instance credential store.
   * @param logger - Redacted adapter logger.
   * @param discoveryIntervalMs - Bounded discovery interval.
   * @param timers - Adapter-owned scheduling boundary.
   * @param discovery - Isolated discovery process.
   * @param pairing - Bounded pairing coordinator.
   * @param backendFactory - Project-owned protocol backend factory.
   * @param deviceSettings - Durable non-secret device enablement boundary.
   * @param homePodBackendFactory - Project-owned transient HomePod backend factory.
   * @param managedDeviceStore - Explicit HomePod and AirPlay Receiver adoption inventory.
   */
  constructor(projection, credentialStore, logger, discoveryIntervalMs, timers, discovery = new import_discoveryProcess.AppleDiscoveryProcess(timers), pairing = new import_appleTvPairing.AppleTvPairing(timers), backendFactory = (target, callbacks) => new import_appleTvBackend.AppleTvBackend(target, callbacks), deviceSettings = new DefaultDeviceSettings(), homePodBackendFactory = (target, callbacks) => new import_homePodBackend.HomePodBackend(target, callbacks, this.logger, timers), managedDeviceStore = new DefaultManagedDeviceStore()) {
    this.projection = projection;
    this.credentialStore = credentialStore;
    this.logger = logger;
    this.discoveryIntervalMs = discoveryIntervalMs;
    this.timers = timers;
    this.discovery = discovery;
    this.pairing = pairing;
    this.backendFactory = backendFactory;
    this.deviceSettings = deviceSettings;
    this.homePodBackendFactory = homePodBackendFactory;
    this.managedDeviceStore = managedDeviceStore;
  }
  devices = /* @__PURE__ */ new Map();
  homePods = /* @__PURE__ */ new Map();
  currentDiscovery = /* @__PURE__ */ new Map();
  currentHomePods = /* @__PURE__ */ new Map();
  currentAirPlayReceivers = /* @__PURE__ */ new Map();
  currentDeviceCounts = { appletv: 0, homepod: 0, airplayReceiver: 0 };
  currentDeviceDetails = {
    appletv: [],
    homepod: [],
    airplayReceiver: []
  };
  connectionStates = /* @__PURE__ */ new Map();
  homePodConnectionStates = /* @__PURE__ */ new Map();
  appCatalogs = /* @__PURE__ */ new Map();
  automaticAppRefreshes = /* @__PURE__ */ new Set();
  timer;
  scanPromise;
  projectionQueue = Promise.resolve();
  managementQueue = Promise.resolve();
  stopping = false;
  /** Initializes durable state, runs discovery, and starts bounded refreshes. */
  async start() {
    this.stopping = false;
    await this.credentialStore.initialize();
    await this.deviceSettings.initialize();
    await this.managedDeviceStore.initialize();
    await this.projection.initialize();
    await this.projection.removeUnpairedDevices(
      this.credentialStore.deviceIds().filter((deviceId) => this.deviceSettings.isEnabled(deviceId))
    );
    await this.projection.retainManagedHomePods(this.activeManagedDeviceIds("homepod"));
    await this.projection.retainManagedAirPlayReceivers(this.activeManagedDeviceIds("airplayReceiver"));
    await this.refresh();
    if (!this.stopping) {
      this.timer = this.timers.scheduleInterval(() => void this.refresh(), this.discoveryIntervalMs);
    }
  }
  /** Runs one de-duplicated discovery cycle. */
  refresh() {
    if (this.scanPromise !== void 0) {
      this.logger.debug("Discovery refresh joined the active scan");
      return this.scanPromise;
    }
    const operation = this.runDiscovery().finally(() => {
      if (this.scanPromise === operation) {
        this.scanPromise = void 0;
      }
    });
    this.scanPromise = operation;
    return operation;
  }
  /** Lists only currently discovered, non-secret pairing candidates. */
  pairingCandidates() {
    return [...this.currentDiscovery.values()].map((target) => ({
      deviceId: target.deviceId,
      name: target.name,
      model: target.model,
      paired: this.credentialStore.get(target.deviceId) !== void 0
    })).sort((left, right) => left.name.localeCompare(right.name));
  }
  /**
   * Lists redacted devices from the latest successful discovery for one class.
   *
   * @param deviceClass - Exclusive device class from the discovery contract.
   */
  discoveredDevices(deviceClass) {
    return this.currentDeviceDetails[deviceClass].map((device) => ({ ...device }));
  }
  /** Lists all durable pairings, including devices that are currently offline. */
  pairedDevices() {
    return this.credentialStore.deviceIds().map((deviceId) => {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      const target = (_b = this.currentDiscovery.get(deviceId)) != null ? _b : (_a = this.devices.get(deviceId)) == null ? void 0 : _a.target;
      return {
        deviceId,
        name: (_c = target == null ? void 0 : target.name) != null ? _c : `Apple TV \u2026${deviceId.slice(-4)}`,
        model: (_d = target == null ? void 0 : target.model) != null ? _d : "",
        discovered: this.currentDiscovery.has(deviceId),
        connected: (_f = (_e = this.devices.get(deviceId)) == null ? void 0 : _e.status.online) != null ? _f : false,
        appCount: (_h = (_g = this.appCatalogs.get(deviceId)) == null ? void 0 : _g.size) != null ? _h : 0,
        enabled: this.deviceSettings.isEnabled(deviceId)
      };
    }).sort((left, right) => left.name.localeCompare(right.name));
  }
  /**
   * Lists current strongly identified devices that have not yet been adopted.
   *
   * @param deviceClass
   */
  managedDeviceCandidates(deviceClass) {
    return [...this.currentManagedTargets(deviceClass).values()].filter((target) => !this.managedDeviceStore.has(deviceClass, target.deviceId)).map((target) => ({
      deviceClass,
      deviceId: target.deviceId,
      name: target.name,
      model: target.model
    })).sort((left, right) => left.name.localeCompare(right.name) || left.deviceId.localeCompare(right.deviceId));
  }
  /**
   * Lists every adopted HomePod or receiver, including passive and offline devices.
   *
   * @param deviceClass
   */
  managedDiscoveryDevices(deviceClass) {
    const currentTargets = this.currentManagedTargets(deviceClass);
    return this.managedDeviceStore.list(deviceClass).map((record) => {
      var _a, _b, _c, _d, _e;
      const current = currentTargets.get(record.deviceId);
      const homePodStatus = deviceClass === "homepod" ? (_a = this.homePods.get(record.deviceId)) == null ? void 0 : _a.status : void 0;
      return {
        ...record,
        name: (_b = current == null ? void 0 : current.name) != null ? _b : record.name,
        model: (_c = current == null ? void 0 : current.model) != null ? _c : record.model,
        discovered: current !== void 0,
        connected: (_d = homePodStatus == null ? void 0 : homePodStatus.online) != null ? _d : false,
        connectionState: (_e = homePodStatus == null ? void 0 : homePodStatus.state) != null ? _e : current === void 0 ? "unavailable" : "discovered"
      };
    });
  }
  /**
   * Adopts one current strong-identity device and activates its projection.
   *
   * @param deviceClass
   * @param deviceId
   */
  manageDiscoveredDevice(deviceClass, deviceId) {
    return this.serializeManagement(async () => {
      const normalized = normalizeDeviceId(deviceId);
      const target = this.currentManagedTargets(deviceClass).get(normalized);
      if (target === void 0) {
        throw new DeviceManagementError("not_discovered");
      }
      await this.managedDeviceStore.manage(deviceClass, target);
      await this.reconcileManagedClass(deviceClass, Date.now());
    });
  }
  /**
   * Changes an adopted HomePod or receiver between active and passive.
   *
   * @param deviceClass
   * @param deviceId
   * @param enabled
   */
  setManagedDiscoveryDeviceEnabled(deviceClass, deviceId, enabled) {
    return this.serializeManagement(async () => {
      const normalized = normalizeDeviceId(deviceId);
      if (!this.managedDeviceStore.has(deviceClass, normalized)) {
        throw new DeviceManagementError("managed_device_not_found");
      }
      await this.managedDeviceStore.setEnabled(deviceClass, normalized, enabled);
      await this.reconcileManagedClass(deviceClass, Date.now());
    });
  }
  /**
   * Forgets one adopted device and removes its adapter-owned object tree.
   *
   * @param deviceClass
   * @param deviceId
   */
  removeManagedDiscoveryDevice(deviceClass, deviceId) {
    return this.serializeManagement(async () => {
      const normalized = normalizeDeviceId(deviceId);
      if (!this.managedDeviceStore.has(deviceClass, normalized)) {
        throw new DeviceManagementError("managed_device_not_found");
      }
      if (deviceClass === "homepod") {
        await this.disconnectHomePod(normalized);
      }
      await this.managedDeviceStore.remove(deviceClass, normalized);
      await this.removeManagedProjection(deviceClass, normalized);
      await this.projection.adapterConnection(this.anyDeviceOnline());
    });
  }
  /**
   * Starts pairing for a currently discovered target.
   *
   * @param deviceId - Selected stable device identifier.
   */
  async startPairing(deviceId) {
    const target = this.currentDiscovery.get(normalizeDeviceId(deviceId));
    if (target === void 0) {
      throw new import_appleTvBackend.AppleTvBackendError("not_discovered");
    }
    await this.pairing.start(target);
    return this.pairing.status();
  }
  /**
   * Completes pairing, atomically persists credentials, and connects the target.
   *
   * @param deviceId - Selected stable device identifier.
   * @param pin - Ephemeral four-digit PIN.
   */
  async finishPairing(deviceId, pin) {
    const normalized = normalizeDeviceId(deviceId);
    const credentials = await this.pairing.finish(normalized, pin);
    await this.deviceSettings.setEnabled(normalized, true);
    await this.credentialStore.set(normalized, credentials);
    const target = this.currentDiscovery.get(normalized);
    if (target !== void 0) {
      const firstDiscovery = !this.devices.has(normalized);
      await this.projection.discovered(target, true, false);
      if (firstDiscovery) {
        await this.projection.initializeDevice(normalized, "discovered");
      }
      void this.connectDevice(this.getOrCreateDevice(target));
    }
    return this.pairing.status();
  }
  /**
   * Enables or disables one paired Apple TV without changing its credentials.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param enabled - Whether runtime connection and public projection are allowed.
   */
  async setPairedDeviceEnabled(deviceId, enabled) {
    var _a;
    const normalized = normalizeDeviceId(deviceId);
    if (this.credentialStore.get(normalized) === void 0) {
      throw new import_appleTvBackend.AppleTvBackendError("not_paired");
    }
    if (this.deviceSettings.isEnabled(normalized) === enabled) {
      return;
    }
    await this.deviceSettings.setEnabled(normalized, enabled);
    if (enabled) {
      const target = this.currentDiscovery.get(normalized);
      if (target === void 0) {
        return;
      }
      const firstDiscovery = !this.devices.has(normalized);
      const device2 = this.getOrCreateDevice(target);
      await this.projection.discovered(target, true, false);
      if (firstDiscovery) {
        await this.projection.initializeDevice(normalized, "discovered");
      }
      void this.connectDevice(device2);
      return;
    }
    const device = this.devices.get(normalized);
    const execution = ((_a = device == null ? void 0 : device.commandQueue) != null ? _a : Promise.resolve()).then(async () => {
      var _a2;
      await ((_a2 = device == null ? void 0 : device.connectPromise) == null ? void 0 : _a2.catch(() => void 0));
      await (device == null ? void 0 : device.backend.disconnect().catch(() => {
        this.logger.warn("Apple TV disconnect during deactivation failed: unavailable");
      }));
      this.devices.delete(normalized);
      this.connectionStates.delete(normalized);
      this.appCatalogs.delete(normalized);
      this.automaticAppRefreshes.delete(normalized);
      await this.projectionQueue;
      await this.projection.removeDevice(normalized);
      await this.projection.adapterConnection(this.anyDeviceOnline());
    });
    if (device !== void 0) {
      device.commandQueue = execution.catch(() => void 0);
    }
    await execution;
  }
  /**
   * Forgets one local pairing and removes its complete public object tree.
   *
   * The Apple TV can still retain its controller record until the user removes
   * it in tvOS settings; this operation deletes only adapter-owned data.
   *
   * @param deviceId - Stable normalized device identifier.
   */
  async removePairedDevice(deviceId) {
    var _a;
    const normalized = normalizeDeviceId(deviceId);
    if (this.credentialStore.get(normalized) === void 0) {
      throw new import_appleTvBackend.AppleTvBackendError("not_paired");
    }
    const device = this.devices.get(normalized);
    const execution = ((_a = device == null ? void 0 : device.commandQueue) != null ? _a : Promise.resolve()).then(async () => {
      var _a2;
      const removed = await this.credentialStore.remove(normalized);
      if (!removed) {
        throw new import_appleTvBackend.AppleTvBackendError("not_paired");
      }
      let settingsFailure;
      try {
        await this.deviceSettings.remove(normalized);
      } catch (error) {
        settingsFailure = error instanceof Error ? error : new Error("device_settings_write_failed");
      }
      await ((_a2 = device == null ? void 0 : device.connectPromise) == null ? void 0 : _a2.catch(() => void 0));
      await (device == null ? void 0 : device.backend.disconnect().catch(() => {
        this.logger.warn("Apple TV disconnect during local removal failed: unavailable");
      }));
      this.devices.delete(normalized);
      this.connectionStates.delete(normalized);
      this.appCatalogs.delete(normalized);
      this.automaticAppRefreshes.delete(normalized);
      await this.projectionQueue;
      await this.projection.removeDevice(normalized);
      await this.projection.adapterConnection(this.anyDeviceOnline());
      if (settingsFailure !== void 0) {
        throw settingsFailure;
      }
    });
    if (device !== void 0) {
      device.commandQueue = execution.catch(() => void 0);
    }
    await execution;
  }
  /** Cancels an active pairing flow. */
  cancelPairing() {
    this.pairing.cancel();
    return this.pairing.status();
  }
  /** Returns only non-secret pairing lifecycle state. */
  pairingStatus() {
    return this.pairing.status();
  }
  /**
   * Executes one capability-gated, per-device serialized remote command.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param command - Frozen public command name.
   */
  async executeRemote(deviceId, command) {
    const normalized = normalizeDeviceId(deviceId);
    const device = this.devices.get(normalized);
    if (device === void 0) {
      await this.projectCommandError(normalized, command, "not_discovered");
      throw new import_appleTvBackend.AppleTvBackendError("not_discovered");
    }
    const execution = device.commandQueue.then(() => this.performRemote(device, normalized, command));
    device.commandQueue = execution.catch(() => void 0);
    return execution;
  }
  /**
   * Executes one capability-gated HomePod transport command in target order.
   *
   * @param deviceId - Stable normalized HomePod identifier.
   * @param command - Supported transport operation.
   */
  async executeHomePodPlayback(deviceId, command) {
    const normalized = normalizeDeviceId(deviceId);
    const device = this.homePods.get(normalized);
    if (device === void 0) {
      if (this.managedDeviceStore.isEnabled("homepod", normalized)) {
        await this.projectHomePodCommandError(normalized, command, "not_discovered");
      }
      throw new import_homePodBackend.HomePodBackendError("not_discovered");
    }
    const execution = device.commandQueue.then(
      () => this.performHomePodCommand(device, normalized, command, () => device.backend.executePlayback(command))
    );
    device.commandQueue = execution.catch(() => void 0);
    return execution;
  }
  /**
   * Applies one validated absolute HomePod volume level.
   *
   * @param deviceId - Stable normalized HomePod identifier.
   * @param percent - Desired volume from 0 through 100.
   */
  async setHomePodVolume(deviceId, percent) {
    const normalized = normalizeDeviceId(deviceId);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new import_homePodBackend.HomePodBackendError("unsupported");
    }
    const device = this.homePods.get(normalized);
    if (device === void 0) {
      if (this.managedDeviceStore.isEnabled("homepod", normalized)) {
        await this.projectHomePodCommandError(normalized, "setVolume", "not_discovered", 0);
      }
      throw new import_homePodBackend.HomePodBackendError("not_discovered");
    }
    const execution = device.commandQueue.then(
      () => this.performHomePodCommand(
        device,
        normalized,
        "setVolume",
        () => device.backend.setVolume(percent),
        percent
      )
    );
    device.commandQueue = execution.catch(() => void 0);
    return execution;
  }
  /**
   * Applies one explicit HomePod mute value.
   *
   * @param deviceId - Stable normalized HomePod identifier.
   * @param muted - Desired mute state.
   */
  async setHomePodMuted(deviceId, muted) {
    const normalized = normalizeDeviceId(deviceId);
    const device = this.homePods.get(normalized);
    if (device === void 0) {
      if (this.managedDeviceStore.isEnabled("homepod", normalized)) {
        await this.projectHomePodCommandError(normalized, "setMuted", "not_discovered", false);
      }
      throw new import_homePodBackend.HomePodBackendError("not_discovered");
    }
    const execution = device.commandQueue.then(
      () => this.performHomePodCommand(device, normalized, "setMuted", () => device.backend.setMuted(muted), muted)
    );
    device.commandQueue = execution.catch(() => void 0);
    return execution;
  }
  /**
   * Refreshes the launchable-app catalog in the same per-device command queue.
   *
   * @param deviceId - Stable normalized device identifier.
   */
  async refreshApps(deviceId) {
    const normalized = normalizeDeviceId(deviceId);
    const device = this.devices.get(normalized);
    if (device === void 0) {
      await this.projectAppCommandError(normalized, "refresh", "not_discovered");
      throw new import_appleTvBackend.AppleTvBackendError("not_discovered");
    }
    this.automaticAppRefreshes.add(normalized);
    const execution = device.commandQueue.then(() => this.performAppRefresh(device, normalized));
    device.commandQueue = execution.catch(() => void 0);
    return execution;
  }
  /**
   * Launches one validated app bundle ID in the per-device command queue.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param bundleId - Bundle identifier from the current catalog.
   */
  async launchApp(deviceId, bundleId) {
    var _a, _b;
    const normalized = normalizeDeviceId(deviceId);
    if (!(0, import_appleTvBackend.isBundleId)(bundleId)) {
      await this.projectAppCommandError(normalized, "launch", "unsupported");
      throw new import_appleTvBackend.AppleTvBackendError("unsupported");
    }
    const device = this.devices.get(normalized);
    if (device === void 0) {
      await this.projectAppCommandError(normalized, "launch", "not_discovered", void 0, bundleId);
      throw new import_appleTvBackend.AppleTvBackendError("not_discovered");
    }
    if (![...(_b = (_a = this.appCatalogs.get(normalized)) == null ? void 0 : _a.values()) != null ? _b : []].some((app) => app.bundleId === bundleId)) {
      await this.projectAppCommandError(normalized, "launch", "unsupported", void 0, bundleId);
      throw new import_appleTvBackend.AppleTvBackendError("unsupported");
    }
    const execution = device.commandQueue.then(() => this.performAppLaunch(device, normalized, bundleId));
    device.commandQueue = execution.catch(() => void 0);
    return execution;
  }
  /**
   * Launches one app selected through its stable per-app object key.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param entryKey - Readable per-app object key from the current catalog.
   */
  async launchAppEntry(deviceId, entryKey) {
    var _a;
    const normalized = normalizeDeviceId(deviceId);
    const app = (_a = this.appCatalogs.get(normalized)) == null ? void 0 : _a.get(entryKey);
    if (app === void 0) {
      await this.projectAppCommandError(normalized, "launch", "unsupported", entryKey, entryKey);
      throw new import_appleTvBackend.AppleTvBackendError("unsupported");
    }
    const device = this.devices.get(normalized);
    if (device === void 0) {
      await this.projectAppCommandError(normalized, "launch", "not_discovered", entryKey, app.bundleId);
      throw new import_appleTvBackend.AppleTvBackendError("not_discovered");
    }
    const execution = device.commandQueue.then(
      () => this.performAppLaunch(device, normalized, app.bundleId, entryKey)
    );
    device.commandQueue = execution.catch(() => void 0);
    return execution;
  }
  /**
   * Opens one validated URL in the per-device command queue.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param value - Universal link or application-specific URL.
   */
  async openUrl(deviceId, value) {
    const normalized = normalizeDeviceId(deviceId);
    let url;
    try {
      url = (0, import_appleTvBackend.normalizeOpenUrl)(value);
    } catch {
      await this.projectAppCommandError(normalized, "openurl", "unsupported");
      throw new import_appleTvBackend.AppleTvBackendError("unsupported");
    }
    const device = this.devices.get(normalized);
    if (device === void 0) {
      await this.projectAppCommandError(normalized, "openurl", "not_discovered");
      throw new import_appleTvBackend.AppleTvBackendError("not_discovered");
    }
    const execution = device.commandQueue.then(() => this.performOpenUrl(device, normalized, url));
    device.commandQueue = execution.catch(() => void 0);
    return execution;
  }
  /**
   * Executes and projects one HomePod operation within its per-target queue.
   *
   * @param device - Active transient runtime device.
   * @param deviceId - Stable normalized HomePod identifier.
   * @param command - Normalized command name.
   * @param operation - Backend dispatch operation.
   * @param requestedValue - Submitted writable scalar when the command owns one.
   */
  async performHomePodCommand(device, deviceId, command, operation, requestedValue) {
    await this.projection.homePodCommandStarted(deviceId, command);
    this.logger.debug(`${homePodReference(deviceId)} command starting name=${command}`);
    try {
      if (!device.status.online) {
        throw new import_homePodBackend.HomePodBackendError("not_connected");
      }
      await operation();
      await this.projection.homePodCommandResult(deviceId, command, "success", "", requestedValue);
      this.logger.debug(`${homePodReference(deviceId)} command completed name=${command}`);
    } catch (error) {
      const code = runtimeErrorCode(error);
      const restoredValue = command === "setVolume" ? device.snapshot.volume : command === "setMuted" ? device.snapshot.muted : void 0;
      await this.projection.homePodCommandResult(deviceId, command, "error", code, restoredValue);
      this.logger.debug(`${homePodReference(deviceId)} command failed name=${command} code=${code}`);
      throw new import_homePodBackend.HomePodBackendError(code);
    }
  }
  /**
   * Projects a HomePod write rejected before an active target queue exists.
   *
   * @param deviceId - Stable normalized HomePod identifier.
   * @param command - Rejected normalized command.
   * @param code - Stable public error code.
   * @param acknowledgedValue - Safe scalar used to clear an unacknowledged write.
   */
  async projectHomePodCommandError(deviceId, command, code, acknowledgedValue) {
    await this.projection.homePodCommandStarted(deviceId, command);
    await this.projection.homePodCommandResult(deviceId, command, "error", code, acknowledgedValue);
    this.logger.debug(`${homePodReference(deviceId)} command rejected name=${command} code=${code}`);
  }
  /**
   * Executes and projects one command within its per-target queue.
   *
   * @param device - Target runtime record.
   * @param deviceId - Stable normalized target ID.
   * @param command - Frozen remote command.
   */
  async performRemote(device, deviceId, command) {
    await this.projection.commandStarted(deviceId, command);
    try {
      if (this.credentialStore.get(deviceId) === void 0) {
        throw new import_appleTvBackend.AppleTvBackendError("not_paired");
      }
      await device.backend.executeRemote(command);
      await this.projection.commandResult(deviceId, command, "success");
    } catch (error) {
      const code = runtimeErrorCode(error);
      await this.projection.commandResult(deviceId, command, "error", code);
      throw new import_appleTvBackend.AppleTvBackendError(code);
    }
  }
  /**
   * Fetches, validates, and projects one app catalog refresh.
   *
   * @param device - Target runtime record.
   * @param deviceId - Stable normalized device identifier.
   */
  async performAppRefresh(device, deviceId) {
    await this.projection.appCommandStarted(deviceId, "refresh");
    try {
      this.requirePairing(deviceId);
      const apps = await device.backend.listApps();
      await this.projection.apps(deviceId, apps);
      const entryKeys = (0, import_objectDefinitions.appEntryKeys)(apps);
      this.appCatalogs.set(
        deviceId,
        new Map(
          apps.map((app) => {
            const entryKey = entryKeys.get(app.bundleId);
            if (entryKey === void 0) {
              throw new import_appleTvBackend.AppleTvBackendError("protocol_error");
            }
            return [entryKey, app];
          })
        )
      );
      await this.projection.appCommandResult(deviceId, "refresh", "success");
    } catch (error) {
      const code = runtimeErrorCode(error);
      await this.projection.appCommandResult(deviceId, "refresh", "error", code);
      throw new import_appleTvBackend.AppleTvBackendError(code);
    }
  }
  /**
   * Executes one validated app launch and projects its result.
   *
   * @param device - Target runtime record.
   * @param deviceId - Stable normalized device identifier.
   * @param bundleId - Validated bundle identifier.
   * @param entryKey - Optional per-app control key to acknowledge.
   */
  async performAppLaunch(device, deviceId, bundleId, entryKey) {
    await this.projection.appCommandStarted(deviceId, "launch", bundleId);
    try {
      this.requirePairing(deviceId);
      await device.backend.launchApp(bundleId);
      await this.projection.appCommandResult(deviceId, "launch", "success", "", entryKey, bundleId);
    } catch (error) {
      const code = runtimeErrorCode(error);
      await this.projection.appCommandResult(deviceId, "launch", "error", code, entryKey, bundleId);
      throw new import_appleTvBackend.AppleTvBackendError(code);
    }
  }
  /**
   * Executes one validated URL command without projecting the URL itself.
   *
   * @param device - Target runtime record.
   * @param deviceId - Stable normalized device identifier.
   * @param url - Validated URL kept only in memory for the command duration.
   */
  async performOpenUrl(device, deviceId, url) {
    await this.projection.appCommandStarted(deviceId, "openurl");
    try {
      this.requirePairing(deviceId);
      await device.backend.openUrl(url);
      await this.projection.appCommandResult(deviceId, "openurl", "success");
    } catch (error) {
      const code = runtimeErrorCode(error);
      await this.projection.appCommandResult(deviceId, "openurl", "error", code);
      throw new import_appleTvBackend.AppleTvBackendError(code);
    }
  }
  /**
   * Rejects app operations that do not have persisted pairing credentials.
   *
   * @param deviceId - Stable normalized device identifier.
   */
  requirePairing(deviceId) {
    if (this.credentialStore.get(deviceId) === void 0) {
      throw new import_appleTvBackend.AppleTvBackendError("not_paired");
    }
  }
  /**
   * Projects a rejected command whose target has no active queue.
   *
   * @param deviceId - Stable normalized target ID.
   * @param command - Rejected remote command.
   * @param code - Stable public error code.
   */
  async projectCommandError(deviceId, command, code) {
    await this.projection.commandStarted(deviceId, command);
    await this.projection.commandResult(deviceId, command, "error", code);
  }
  /**
   * Projects an app command failure when no active device queue is available.
   *
   * @param deviceId - Stable normalized device identifier.
   * @param action - Rejected app operation.
   * @param code - Stable public error code.
   * @param entryKey - Optional per-app control key to acknowledge.
   * @param target - Optional non-secret command target.
   */
  async projectAppCommandError(deviceId, action, code, entryKey, target = "") {
    await this.projection.appCommandStarted(deviceId, action, target);
    await this.projection.appCommandResult(deviceId, action, "error", code, entryKey, target);
  }
  /** Cancels work, disconnects devices, and flushes owned projections. */
  async stop() {
    var _a;
    this.stopping = true;
    if (this.timer !== void 0) {
      this.timers.cancelInterval(this.timer);
      this.timer = void 0;
    }
    this.discovery.cancel();
    this.pairing.cancel();
    await ((_a = this.scanPromise) == null ? void 0 : _a.catch(() => void 0));
    await this.managementQueue.catch(() => void 0);
    this.logger.debug(
      `Runtime stop starting appleTv=${this.devices.size} homePod=${this.homePods.size} scanActive=${this.scanPromise !== void 0}`
    );
    await Promise.allSettled([
      ...[...this.devices.values()].map((device) => device.backend.disconnect()),
      ...[...this.homePods.values()].map((device) => device.backend.disconnect())
    ]);
    await this.projectionQueue;
    await this.projection.discoveryRunning(false);
    await this.projection.adapterConnection(false);
    this.logger.debug("Runtime stop completed");
  }
  /**
   * Serializes Admin management actions with discovery reconciliation.
   *
   * @param operation
   */
  serializeManagement(operation) {
    const execution = this.managementQueue.then(operation);
    this.managementQueue = execution.then(
      () => void 0,
      () => void 0
    );
    return execution;
  }
  /**
   * Returns the current strong-identity targets for one explicitly managed class.
   *
   * @param deviceClass
   */
  currentManagedTargets(deviceClass) {
    return deviceClass === "homepod" ? this.currentHomePods : this.currentAirPlayReceivers;
  }
  /**
   * Returns all active adopted IDs, including devices that are currently offline.
   *
   * @param deviceClass
   */
  activeManagedDeviceIds(deviceClass) {
    return this.managedDeviceStore.list(deviceClass).filter((device) => device.enabled).map((device) => device.deviceId);
  }
  /**
   * Applies the complete active inventory of one managed discovery class.
   *
   * @param deviceClass
   * @param seenAt
   */
  async reconcileManagedClass(deviceClass, seenAt) {
    const activeIds = new Set(this.activeManagedDeviceIds(deviceClass));
    const currentTargets = [...this.currentManagedTargets(deviceClass).values()].filter(
      (target) => activeIds.has(target.deviceId)
    );
    if (deviceClass === "airplayReceiver") {
      await this.projection.retainManagedAirPlayReceivers([...activeIds]);
      await this.projection.airPlayReceivers(currentTargets, seenAt);
      return;
    }
    const homePods = currentTargets;
    await this.disconnectAbsentHomePods(new Set(homePods.map((target) => target.deviceId)));
    await this.projectionQueue;
    await this.projection.retainManagedHomePods([...activeIds]);
    await this.projection.homePods(homePods, seenAt);
    for (const target of homePods) {
      const firstDiscovery = !this.homePods.has(target.deviceId);
      const device = this.getOrCreateHomePod(target);
      if (firstDiscovery) {
        await this.projection.initializeHomePod(target.deviceId);
      }
      if (!device.status.online) {
        void this.connectHomePod(device);
      }
    }
  }
  /**
   * Disconnects one managed HomePod and waits for its final queued projections.
   *
   * @param deviceId
   */
  async disconnectHomePod(deviceId) {
    var _a;
    const device = this.homePods.get(deviceId);
    if (device === void 0) {
      return;
    }
    await device.commandQueue.catch(() => void 0);
    await ((_a = device.connectPromise) == null ? void 0 : _a.catch(() => void 0));
    await device.backend.disconnect().catch(() => {
      this.logger.warn(`${homePodReference(deviceId)} disconnect during management failed: unavailable`);
    });
    this.homePods.delete(deviceId);
    this.homePodConnectionStates.delete(deviceId);
    await this.projectionQueue;
  }
  /**
   * Removes one managed class projection after deactivation or local forget.
   *
   * @param deviceClass
   * @param deviceId
   */
  async removeManagedProjection(deviceClass, deviceId) {
    if (deviceClass === "homepod") {
      await this.projection.removeHomePod(deviceId);
      return;
    }
    await this.projection.removeAirPlayReceiver(deviceId);
  }
  /** Performs one isolated scan and reconciles its supported targets. */
  async runDiscovery() {
    if (this.stopping) {
      return;
    }
    await this.projection.discoveryRunning(true);
    this.logger.debug("Discovery scan starting in isolated worker");
    let error = "";
    try {
      const discovery = await this.discovery.discover();
      if (this.stopping) {
        return;
      }
      const discovered = discovery.devices;
      const seenAt = Date.now();
      this.currentDeviceCounts = discovery.deviceCounts;
      this.currentDeviceDetails = discovery.deviceDetails;
      this.currentDiscovery = new Map(discovered.map((target) => [target.deviceId, target]));
      this.currentHomePods = new Map(discovery.homePods.map((target) => [target.deviceId, target]));
      this.currentAirPlayReceivers = new Map(discovery.airplayReceivers.map((target) => [target.deviceId, target]));
      await this.serializeManagement(async () => {
        for (const target of discovery.homePods) {
          await this.managedDeviceStore.observe("homepod", target);
        }
        for (const target of discovery.airplayReceivers) {
          await this.managedDeviceStore.observe("airplayReceiver", target);
        }
        await this.reconcileManagedClass("homepod", seenAt);
        await this.reconcileManagedClass("airplayReceiver", seenAt);
      });
      for (const target of discovered) {
        const credentials = this.credentialStore.get(target.deviceId);
        if (credentials === void 0 || !this.deviceSettings.isEnabled(target.deviceId)) {
          continue;
        }
        const firstDiscovery = !this.devices.has(target.deviceId);
        const device = this.getOrCreateDevice(target);
        await this.projection.discovered(target, true, false);
        if (firstDiscovery) {
          await this.projection.initializeDevice(target.deviceId, "discovered");
        }
        if (!device.status.online) {
          void this.connectDevice(device);
        }
      }
      this.logger.info(
        `Discovery completed: Apple TV=${discovery.deviceCounts.appletv}, HomePod=${discovery.deviceCounts.homepod}, AirPlay Receiver=${discovery.deviceCounts.airplayReceiver}`
      );
      this.logger.debug(
        `Discovery controllable targets appleTv=${discovered.length} homePod=${discovery.homePods.length} airPlayReceiver=${discovery.airplayReceivers.length}`
      );
      for (const target of discovery.homePods) {
        this.logger.debug(
          `${homePodReference(target.deviceId)} discovered model=${safeHomePodModel(target.model)} services=airplay${target.raop ? ",raop" : ""}`
        );
      }
    } catch (cause) {
      if (!(this.stopping && cause instanceof import_discoveryProcess.AppleDiscoveryError && cause.code === "cancelled")) {
        error = runtimeErrorCode(cause);
        this.logger.warn(`Discovery failed: ${error}`);
      }
    } finally {
      if (!this.stopping) {
        await this.projection.aggregate(this.currentDeviceCounts, this.anyDeviceOnline(), error);
        await this.projection.discoveryRunning(false);
      }
    }
  }
  /**
   * Creates or refreshes one device backend.
   *
   * @param target - Latest correlated target.
   */
  getOrCreateDevice(target) {
    const existing = this.devices.get(target.deviceId);
    if (existing !== void 0) {
      existing.target = target;
      existing.backend.updateTarget(target);
      return existing;
    }
    const backend = this.backendFactory(target, {
      onSnapshot: (snapshot) => {
        const current = this.devices.get(target.deviceId);
        if (current === void 0) {
          return;
        }
        current.appsCapable = snapshot.capabilities.apps;
        this.enqueueProjection(() => this.projection.snapshot(target.deviceId, snapshot));
        this.tryAutomaticAppRefresh(target.deviceId);
      },
      onConnection: (status) => {
        const current = this.devices.get(target.deviceId);
        if (current === void 0) {
          return;
        }
        const wasCompanionConnected = current.status.companion;
        current.status = status;
        if (wasCompanionConnected && !status.companion) {
          this.automaticAppRefreshes.delete(target.deviceId);
        }
        this.connectionStates.set(target.deviceId, status);
        this.enqueueProjection(async () => {
          await this.projection.connection(target.deviceId, status);
          await this.projection.adapterConnection(this.anyDeviceOnline());
        });
        this.tryAutomaticAppRefresh(target.deviceId);
      }
    });
    const device = {
      target,
      status: {
        state: "discovered",
        online: false,
        airplay: false,
        companion: false
      },
      backend,
      commandQueue: Promise.resolve(),
      appsCapable: false
    };
    this.devices.set(target.deviceId, device);
    this.connectionStates.set(target.deviceId, device.status);
    return device;
  }
  /**
   * Creates or refreshes one transient HomePod backend.
   *
   * @param target - Latest strongly identified HomePod target.
   */
  getOrCreateHomePod(target) {
    const existing = this.homePods.get(target.deviceId);
    if (existing !== void 0) {
      existing.target = target;
      existing.backend.updateTarget(target);
      return existing;
    }
    const backend = this.homePodBackendFactory(target, {
      onSnapshot: (snapshot) => {
        const current = this.homePods.get(target.deviceId);
        if (current === void 0) {
          return;
        }
        current.snapshot = snapshot;
        this.enqueueProjection(() => this.projection.homePodSnapshot(target.deviceId, snapshot));
      },
      onConnection: (status) => {
        var _a;
        const current = this.homePods.get(target.deviceId);
        if (current === void 0) {
          return;
        }
        const previous = current.status;
        current.status = status;
        this.homePodConnectionStates.set(target.deviceId, status);
        this.logger.debug(
          `${homePodReference(target.deviceId)} connection ${previous.state}/${previous.pairing} -> ${status.state}/${status.pairing} online=${status.online} error=${(_a = status.error) != null ? _a : "none"}`
        );
        this.enqueueProjection(async () => {
          await this.projection.homePodConnection(target.deviceId, status);
          await this.projection.adapterConnection(this.anyDeviceOnline());
        });
      }
    });
    const device = {
      target,
      backend,
      status: { state: "discovered", online: false, pairing: "idle" },
      commandQueue: Promise.resolve(),
      snapshot: (0, import_homePod.emptyHomePodSnapshot)()
    };
    this.homePods.set(target.deviceId, device);
    this.homePodConnectionStates.set(target.deviceId, device.status);
    return device;
  }
  /**
   * Starts at most one transient HomePod connection attempt.
   *
   * @param device - Current HomePod runtime record.
   */
  connectHomePod(device) {
    if (device.connectPromise !== void 0) {
      this.logger.debug(`${homePodReference(device.target.deviceId)} connect joined active attempt`);
      return device.connectPromise;
    }
    this.logger.debug(`${homePodReference(device.target.deviceId)} connect queued`);
    const operation = device.backend.connect().catch((error) => {
      this.logger.warn(
        `${homePodReference(device.target.deviceId)} connection failed: ${runtimeErrorCode(error)}`
      );
    }).finally(() => {
      if (device.connectPromise === operation) {
        device.connectPromise = void 0;
      }
    });
    device.connectPromise = operation;
    return operation;
  }
  /**
   * Disconnects transient sessions absent from one successful complete scan.
   *
   * @param currentDeviceIds - Complete HomePod IDs from that scan.
   */
  async disconnectAbsentHomePods(currentDeviceIds) {
    var _a;
    for (const [deviceId, device] of this.homePods) {
      if (currentDeviceIds.has(deviceId)) {
        continue;
      }
      this.logger.debug(
        `${homePodReference(deviceId)} absent from successful scan; disconnecting transient session`
      );
      await device.commandQueue.catch(() => void 0);
      await ((_a = device.connectPromise) == null ? void 0 : _a.catch(() => void 0));
      await device.backend.disconnect().catch(() => {
        this.logger.warn(`${homePodReference(deviceId)} disconnect after absence failed: unavailable`);
      });
      this.homePods.delete(deviceId);
      this.homePodConnectionStates.delete(deviceId);
    }
  }
  /** Returns aggregate health across Apple TV and HomePod sessions. */
  anyDeviceOnline() {
    return [...this.connectionStates.values()].some((status) => status.online) || [...this.homePodConnectionStates.values()].some((status) => status.online);
  }
  /**
   * Starts at most one connection attempt per device.
   *
   * @param device - Runtime device record.
   */
  connectDevice(device) {
    if (device.connectPromise !== void 0) {
      return device.connectPromise;
    }
    const credentials = this.credentialStore.get(device.target.deviceId);
    if (credentials === void 0) {
      return Promise.reject(new import_appleTvBackend.AppleTvBackendError("not_paired"));
    }
    const operation = device.backend.connect(credentials).catch((error) => {
      this.logger.warn(`Apple TV connection failed: ${runtimeErrorCode(error)}`);
    }).finally(() => {
      if (device.connectPromise === operation) {
        device.connectPromise = void 0;
      }
    });
    device.connectPromise = operation;
    return operation;
  }
  /**
   * Queues one best-effort catalog load after Companion app capability appears.
   *
   * @param deviceId - Stable normalized device identifier.
   */
  tryAutomaticAppRefresh(deviceId) {
    const device = this.devices.get(deviceId);
    if (device === void 0 || !device.appsCapable || !device.status.companion || this.credentialStore.get(deviceId) === void 0 || this.automaticAppRefreshes.has(deviceId)) {
      return;
    }
    this.automaticAppRefreshes.add(deviceId);
    const execution = device.commandQueue.then(() => this.performAppRefresh(device, deviceId));
    device.commandQueue = execution.catch(() => void 0);
    void execution.catch((error) => {
      this.logger.warn(`Automatic app catalog refresh failed: ${runtimeErrorCode(error)}`);
    });
  }
  /**
   * Serializes async projections emitted by synchronous SDK events.
   *
   * @param operation - Async state update emitted by an SDK callback.
   */
  enqueueProjection(operation) {
    if (this.stopping) {
      return;
    }
    this.projectionQueue = this.projectionQueue.then(operation).catch(() => {
      this.logger.warn("State projection failed: unavailable");
    });
  }
}
function parseAppleTvCommandStateId(id) {
  const match = /(?:^|\.)devices\.appletv\.([0-9a-f]{12})\.(remote|playback|power)\.([A-Za-z]+)$/.exec(id);
  if (match === null) {
    return void 0;
  }
  const command = match[3];
  const allowed = match[2] === "remote" ? import_objectDefinitions.NAVIGATION_COMMANDS : match[2] === "playback" ? import_objectDefinitions.PLAYBACK_COMMANDS : import_objectDefinitions.POWER_COMMANDS;
  if (!allowed.includes(command)) {
    return void 0;
  }
  return { deviceId: match[1].toUpperCase(), command };
}
function parseAppleTvCommandWrite(id, state) {
  if (state === null || state === void 0 || state.ack || state.val !== true) {
    return void 0;
  }
  return parseAppleTvCommandStateId(id);
}
function parseHomePodWrite(id, state) {
  if (state === null || state === void 0 || state.ack) {
    return void 0;
  }
  const playback = /(?:^|\.)devices\.homepod\.([0-9a-f]{12})\.playback\.([A-Za-z]+)$/.exec(id);
  if (playback !== null) {
    const command = playback[2];
    return state.val === true && import_objectDefinitions.HOME_POD_PLAYBACK_COMMANDS.includes(command) ? { deviceId: playback[1].toUpperCase(), action: "playback", command } : void 0;
  }
  const volume = /(?:^|\.)devices\.homepod\.([0-9a-f]{12})\.volume\.(level|muted)$/.exec(id);
  if (volume === null) {
    return void 0;
  }
  const deviceId = volume[1].toUpperCase();
  if (volume[2] === "level") {
    return typeof state.val === "number" && Number.isFinite(state.val) && state.val >= 0 && state.val <= 100 ? { deviceId, action: "volume", percent: state.val } : void 0;
  }
  return typeof state.val === "boolean" ? { deviceId, action: "muted", muted: state.val } : void 0;
}
function parseAppWrite(id, state) {
  if (state === null || state === void 0 || state.ack) {
    return void 0;
  }
  const entryMatch = /(?:^|\.)devices\.appletv\.([0-9a-f]{12})\.apps\.entries\.([^.]+)\.launch$/u.exec(id);
  if (entryMatch !== null && (0, import_objectDefinitions.isAppEntryKey)(entryMatch[2])) {
    return state.val === true ? { deviceId: entryMatch[1].toUpperCase(), action: "launchEntry", entryKey: entryMatch[2] } : void 0;
  }
  const openUrlMatch = /(?:^|\.)devices\.appletv\.([0-9a-f]{12})\.apps\.openurl$/.exec(id);
  if (openUrlMatch !== null) {
    return typeof state.val === "string" && state.val.trim().length > 0 ? { deviceId: openUrlMatch[1].toUpperCase(), action: "openurl", url: state.val } : void 0;
  }
  const match = /(?:^|\.)devices\.appletv\.([0-9a-f]{12})\.apps\.refresh$/.exec(id);
  if (match === null) {
    return void 0;
  }
  const deviceId = match[1].toUpperCase();
  return state.val === true ? { deviceId, action: "refresh" } : void 0;
}
function normalizeDeviceId(deviceId) {
  const normalized = deviceId.replaceAll(":", "").replaceAll("-", "").toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(normalized)) {
    throw new import_appleTvBackend.AppleTvBackendError("not_discovered");
  }
  return normalized;
}
function runtimeErrorCode(error) {
  if (error instanceof import_appleTvBackend.AppleTvBackendError || error instanceof import_homePodBackend.HomePodBackendError) {
    return error.code;
  }
  if (error instanceof import_discoveryProcess.AppleDiscoveryError) {
    if (error.code === "timeout") {
      return "timeout";
    }
    if (error.code === "busy") {
      return "busy";
    }
    return "unavailable";
  }
  return "protocol_error";
}
function homePodReference(deviceId) {
  return `HomePod/\u2026${deviceId.slice(-4)}`;
}
function safeHomePodModel(model) {
  return /^AudioAccessory\d+,\d+$/i.test(model) ? model : "unknown";
}
class DefaultDeviceSettings {
  disabled = /* @__PURE__ */ new Set();
  initialize() {
    return Promise.resolve();
  }
  isEnabled(deviceId) {
    return !this.disabled.has(normalizeDeviceId(deviceId));
  }
  setEnabled(deviceId, enabled) {
    const normalized = normalizeDeviceId(deviceId);
    if (enabled) {
      this.disabled.delete(normalized);
    } else {
      this.disabled.add(normalized);
    }
    return Promise.resolve();
  }
  remove(deviceId) {
    this.disabled.delete(normalizeDeviceId(deviceId));
    return Promise.resolve();
  }
}
class DefaultManagedDeviceStore {
  devices = /* @__PURE__ */ new Map();
  initialize() {
    return Promise.resolve();
  }
  list(deviceClass) {
    return [...this.devices.values()].filter((device) => device.deviceClass === deviceClass).map((device) => ({ ...device }));
  }
  has(deviceClass, deviceId) {
    return this.devices.has(`${deviceClass}:${normalizeDeviceId(deviceId)}`);
  }
  isEnabled(deviceClass, deviceId) {
    var _a, _b;
    return (_b = (_a = this.devices.get(`${deviceClass}:${normalizeDeviceId(deviceId)}`)) == null ? void 0 : _a.enabled) != null ? _b : false;
  }
  manage(deviceClass, device) {
    const deviceId = normalizeDeviceId(device.deviceId);
    this.devices.set(`${deviceClass}:${deviceId}`, { ...device, deviceClass, deviceId, enabled: true });
    return Promise.resolve();
  }
  observe(deviceClass, device) {
    const key = `${deviceClass}:${normalizeDeviceId(device.deviceId)}`;
    const current = this.devices.get(key);
    if (current !== void 0) {
      this.devices.set(key, { ...current, name: device.name, model: device.model });
    }
    return Promise.resolve();
  }
  setEnabled(deviceClass, deviceId, enabled) {
    const key = `${deviceClass}:${normalizeDeviceId(deviceId)}`;
    const current = this.devices.get(key);
    if (current === void 0) {
      return Promise.reject(new DeviceManagementError("managed_device_not_found"));
    }
    this.devices.set(key, { ...current, enabled });
    return Promise.resolve();
  }
  remove(deviceClass, deviceId) {
    return Promise.resolve(this.devices.delete(`${deviceClass}:${normalizeDeviceId(deviceId)}`));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AppleRuntime,
  DeviceManagementError,
  parseAppWrite,
  parseAppleTvCommandStateId,
  parseAppleTvCommandWrite,
  parseHomePodWrite
});
//# sourceMappingURL=appleRuntime.js.map
