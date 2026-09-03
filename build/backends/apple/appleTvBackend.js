"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var appleTvBackend_exports = {};
__export(appleTvBackend_exports, {
  AppleTvBackend: () => AppleTvBackend,
  AppleTvBackendError: () => AppleTvBackendError,
  executePowerCommand: () => executePowerCommand,
  isBundleId: () => isBundleId,
  normalizeBackendError: () => normalizeBackendError,
  normalizeLaunchableApps: () => normalizeLaunchableApps,
  normalizeOpenUrl: () => normalizeOpenUrl
});
module.exports = __toCommonJS(appleTvBackend_exports);
var import_appleTv = require("../../domain/appleTv");
var import_sdkConversion = require("./sdkConversion");
class AppleTvBackendError extends Error {
  /**
   * Creates one normalized backend error.
   *
   * @param code - Stable public error code.
   */
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "AppleTvBackendError";
  }
}
class AppleTvBackend {
  /**
   * Creates one target facade.
   *
   * @param target - Current correlated target.
   * @param callbacks - Normalized adapter callbacks.
   */
  constructor(target, callbacks) {
    this.target = target;
    this.callbacks = callbacks;
  }
  device;
  hasCompanion = false;
  stopping = false;
  snapshot = (0, import_appleTv.emptyAppleTvSnapshot)();
  /**
   * Updates non-durable service endpoints after every discovery.
   *
   * @param target - Newly correlated target with the same stable ID.
   */
  updateTarget(target) {
    if (target.deviceId !== this.target.deviceId) {
      throw new AppleTvBackendError("not_discovered");
    }
    this.target = target;
    if (this.device !== void 0) {
      this.device.discoveryResult = (0, import_sdkConversion.toSdkDiscoveryResult)(target.airplay);
      if (this.device.companionLink !== void 0 && target.companionLink !== void 0) {
        this.device.companionLink.discoveryResult = (0, import_sdkConversion.toSdkDiscoveryResult)(target.companionLink);
      }
    }
  }
  /**
   * Connects both available protocols using persisted credentials.
   *
   * @param credentials - Validated long-term credentials.
   */
  async connect(credentials) {
    var _a, _b, _c, _d, _e;
    if ((_a = this.device) == null ? void 0 : _a.airplay.isConnected) {
      this.publishConnection();
      return;
    }
    this.stopping = false;
    this.callbacks.onConnection({
      state: "connecting",
      online: false,
      airplay: false,
      companion: false
    });
    try {
      if (this.device === void 0 || this.hasCompanion !== (this.target.companionLink !== void 0)) {
        await this.disposeDevice();
        await this.createDevice();
      }
      await ((_b = this.device) == null ? void 0 : _b.connect(credentials));
      if (!((_c = this.device) == null ? void 0 : _c.airplay.isConnected)) {
        throw new AppleTvBackendError("protocol_error");
      }
      this.snapshot.powerState = (_e = await ((_d = this.device.power) == null ? void 0 : _d.getState().catch(() => "unknown"))) != null ? _e : "unknown";
      this.publishSnapshot();
      this.publishConnection();
    } catch (error) {
      await this.disposeDevice();
      const normalized = normalizeBackendError(error);
      this.callbacks.onConnection({
        state: "unavailable",
        online: false,
        airplay: false,
        companion: false,
        error: normalized.code
      });
      throw normalized;
    }
  }
  /**
   * Serializes one capability-checked remote command.
   *
   * @param command - Normalized public command.
   */
  async executeRemote(command) {
    const device = this.device;
    if (device === void 0 || !device.airplay.isConnected) {
      throw new AppleTvBackendError("not_connected");
    }
    try {
      if (command === "powerOn" || command === "powerOff") {
        if (!this.snapshot.capabilities.power || device.power === void 0) {
          throw new AppleTvBackendError("unsupported");
        }
        await executePowerCommand(device.power, command);
        return;
      }
      if (!this.snapshot.capabilities.remote) {
        throw new AppleTvBackendError("unsupported");
      }
      await device.remote[command]();
    } catch (error) {
      throw normalizeBackendError(error);
    }
  }
  /** Returns the current launchable-app catalog through Companion Link. */
  async listApps() {
    const apps = this.connectedApps();
    try {
      return normalizeLaunchableApps(await apps.list());
    } catch (error) {
      throw normalizeBackendError(error);
    }
  }
  /**
   * Launches one app by its validated bundle identifier through Companion Link.
   *
   * @param bundleId - Validated application bundle identifier.
   */
  async launchApp(bundleId) {
    const apps = this.connectedApps();
    try {
      await apps.launch(bundleId);
    } catch (error) {
      throw normalizeBackendError(error);
    }
  }
  /**
   * Opens one validated URL through Companion Link without retaining it.
   *
   * @param url - Validated universal link or application-specific URL.
   */
  async openUrl(url) {
    const apps = this.connectedApps();
    try {
      await apps.openUrl(url);
    } catch (error) {
      throw normalizeBackendError(error);
    }
  }
  /** Disconnects protocols and removes every external event listener. */
  async disconnect() {
    this.stopping = true;
    await this.disposeDevice();
    this.callbacks.onConnection({
      state: "unavailable",
      online: false,
      airplay: false,
      companion: false
    });
  }
  /** Creates and subscribes one fresh SDK device. */
  async createDevice() {
    const sdk = await Promise.resolve().then(() => __toESM(require("@basmilius/apple-sdk")));
    const device = new sdk.AppleTV({
      airplay: (0, import_sdkConversion.toSdkDiscoveryResult)(this.target.airplay),
      companionLink: this.target.companionLink === void 0 ? void 0 : (0, import_sdkConversion.toSdkDiscoveryResult)(this.target.companionLink)
    });
    this.hasCompanion = this.target.companionLink !== void 0;
    this.device = device;
    device.on("disconnected", (unexpected) => {
      var _a, _b;
      if (!this.stopping) {
        this.callbacks.onConnection({
          state: unexpected ? "recovering" : "unavailable",
          online: false,
          airplay: false,
          companion: (_b = (_a = device.companionLink) == null ? void 0 : _a.isConnected) != null ? _b : false,
          error: unexpected ? "protocol_error" : void 0
        });
      }
    });
    device.on("power", (state) => {
      this.snapshot.powerState = state;
      this.publishSnapshot();
    });
    device.state.on("nowPlayingChanged", () => this.publishSnapshot());
    device.state.on("playbackStateChanged", () => this.publishSnapshot());
    device.state.on("volumeChanged", () => this.publishSnapshot());
    device.state.on("volumeMutedChanged", () => this.publishSnapshot());
    device.state.on("activeAppChanged", () => this.publishSnapshot());
    device.state.on("supportedCommandsChanged", () => this.publishSnapshot());
  }
  /** Captures current SDK getters as normalized scalars. */
  publishSnapshot() {
    var _a, _b, _c, _d, _e, _f;
    const device = this.device;
    if (device === void 0) {
      return;
    }
    const capabilities = device.capabilities;
    const state = device.state;
    const remoteAvailable = capabilities.supportsUnifiedMediaControl || capabilities.supportsHangdogRemoteControl;
    this.snapshot = {
      powerState: this.snapshot.powerState,
      title: state.title || "",
      artist: state.artist || "",
      album: state.album || "",
      app: (_b = (_a = state.activeApp) == null ? void 0 : _a.displayName) != null ? _b : "",
      appBundleId: (_d = (_c = state.activeApp) == null ? void 0 : _c.bundleIdentifier) != null ? _d : "",
      duration: finiteNonNegative(state.duration),
      position: finiteNonNegative(state.elapsedTime),
      isPlaying: state.isPlaying,
      volumeAvailable: state.volumeAvailable,
      volume: normalizeVolume(state.volume),
      muted: state.isMuted,
      capabilities: {
        remote: remoteAvailable,
        playback: remoteAvailable,
        power: device.power !== void 0,
        nowPlaying: device.airplay.isConnected,
        volume: state.volumeAvailable,
        apps: device.apps !== void 0 && ((_f = (_e = device.companionLink) == null ? void 0 : _e.isConnected) != null ? _f : false)
      }
    };
    this.callbacks.onSnapshot({ ...this.snapshot, capabilities: { ...this.snapshot.capabilities } });
  }
  /** Returns the currently usable Companion Link app controller. */
  connectedApps() {
    var _a, _b;
    const device = this.device;
    if (device === void 0 || !device.airplay.isConnected || !((_b = (_a = device.companionLink) == null ? void 0 : _a.isConnected) != null ? _b : false)) {
      throw new AppleTvBackendError("not_connected");
    }
    if (device.apps === void 0) {
      throw new AppleTvBackendError("unsupported");
    }
    return device.apps;
  }
  /** Publishes independent AirPlay and Companion health. */
  publishConnection() {
    var _a, _b, _c, _d, _e;
    const airplay = (_b = (_a = this.device) == null ? void 0 : _a.airplay.isConnected) != null ? _b : false;
    const companion = (_e = (_d = (_c = this.device) == null ? void 0 : _c.companionLink) == null ? void 0 : _d.isConnected) != null ? _e : false;
    this.callbacks.onConnection({
      state: airplay && (this.target.companionLink === void 0 || companion) ? "online" : airplay ? "degraded" : "unavailable",
      online: airplay,
      airplay,
      companion
    });
  }
  /** Disconnects and releases one SDK instance. */
  async disposeDevice() {
    var _a;
    const device = this.device;
    this.device = void 0;
    if (device === void 0) {
      return;
    }
    device.removeAllListeners();
    device.state.removeAllListeners();
    device.disconnect();
    await ((_a = device.companionLink) == null ? void 0 : _a.disconnectSafely());
    this.snapshot = (0, import_appleTv.emptyAppleTvSnapshot)();
  }
}
async function executePowerCommand(controller, command) {
  if (command === "powerOn") {
    await controller.on();
    return;
  }
  await controller.off();
}
function normalizeLaunchableApps(values) {
  if (values.length > 500) {
    throw new AppleTvBackendError("protocol_error");
  }
  const apps = /* @__PURE__ */ new Map();
  for (const value of values) {
    if (typeof value !== "object" || value === null) {
      throw new AppleTvBackendError("protocol_error");
    }
    const bundleId = value.bundleId;
    const name = value.name;
    if (typeof bundleId !== "string" || !isBundleId(bundleId) || typeof name !== "string" || name.trim().length === 0 || name.length > 256) {
      throw new AppleTvBackendError("protocol_error");
    }
    apps.set(bundleId, { bundleId, name: name.trim() });
  }
  return [...apps.values()].sort(
    (left, right) => left.name.localeCompare(right.name) || left.bundleId.localeCompare(right.bundleId)
  );
}
function isBundleId(value) {
  return value.length <= 255 && /[.-]/.test(value) && /^[A-Za-z0-9.-]+$/.test(value);
}
function normalizeOpenUrl(value) {
  var _a;
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 2048) {
    throw new AppleTvBackendError("unsupported");
  }
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new AppleTvBackendError("unsupported");
  }
  if (!/[A-Za-z]/.test((_a = parsed.protocol[0]) != null ? _a : "") || parsed.username !== "" || parsed.password !== "" || ["about:", "blob:", "data:", "file:", "javascript:"].includes(parsed.protocol.toLowerCase())) {
    throw new AppleTvBackendError("unsupported");
  }
  return candidate;
}
function normalizeBackendError(error) {
  if (error instanceof AppleTvBackendError) {
    return error;
  }
  if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
    return new AppleTvBackendError("timeout");
  }
  return new AppleTvBackendError("protocol_error");
}
function finiteNonNegative(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function normalizeVolume(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, percent));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AppleTvBackend,
  AppleTvBackendError,
  executePowerCommand,
  isBundleId,
  normalizeBackendError,
  normalizeLaunchableApps,
  normalizeOpenUrl
});
//# sourceMappingURL=appleTvBackend.js.map
