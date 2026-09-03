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
var homePodBackend_exports = {};
__export(homePodBackend_exports, {
  HomePodBackend: () => HomePodBackend,
  HomePodBackendError: () => HomePodBackendError,
  diagnosticErrorKind: () => diagnosticErrorKind,
  normalizeHomePodError: () => normalizeHomePodError
});
module.exports = __toCommonJS(homePodBackend_exports);
var import_homePod = require("../../domain/homePod");
var import_sdkConversion = require("./sdkConversion");
class HomePodBackendError extends Error {
  /** @param code - Stable public error code. */
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "HomePodBackendError";
  }
}
class HomePodBackend {
  /**
   * Creates one HomePod transient backend.
   *
   * @param target - Current strongly identified discovery target.
   * @param callbacks - Normalized runtime callbacks.
   * @param logger - Privacy-preserving debug boundary.
   * @param timers - Adapter-owned scheduling boundary.
   * @param deviceFactory - Dynamically imported SDK construction boundary.
   * @param connectTimeoutMs - Hard deadline for one transient connection attempt.
   */
  constructor(target, callbacks, logger, timers, deviceFactory = createSdkHomePod, connectTimeoutMs = 2e4) {
    this.target = target;
    this.callbacks = callbacks;
    this.logger = logger;
    this.timers = timers;
    this.deviceFactory = deviceFactory;
    this.connectTimeoutMs = connectTimeoutMs;
  }
  device;
  stopping = false;
  snapshot = (0, import_homePod.emptyHomePodSnapshot)();
  /**
   * Refreshes the non-durable AirPlay endpoint after discovery.
   *
   * @param target - Latest target with the same durable device ID.
   */
  updateTarget(target) {
    if (target.deviceId !== this.target.deviceId) {
      throw new HomePodBackendError("not_discovered");
    }
    this.target = target;
    if (this.device !== void 0) {
      this.device.discoveryResult = (0, import_sdkConversion.toSdkDiscoveryResult)(target.airplay);
    }
    this.logger.debug(
      `${reference(target.deviceId)} target refreshed services=airplay${target.raop ? ",raop" : ""}`
    );
  }
  /** Connects using automatic transient pairing; no credentials are accepted or retained. */
  async connect() {
    var _a;
    if ((_a = this.device) == null ? void 0 : _a.isConnected) {
      this.publishConnection();
      return;
    }
    this.stopping = false;
    this.logger.debug(
      `${reference(this.target.deviceId)} transient connect starting model=${safeModel(this.target.model)}`
    );
    this.callbacks.onConnection({ state: "connecting", online: false, pairing: "pairing" });
    try {
      this.disposeDevice();
      this.device = await this.deviceFactory(this.target);
      this.subscribe(this.device);
      this.logger.debug(
        `${reference(this.target.deviceId)} advertised capabilities transient=${this.device.capabilities.supportsTransientPairing} unifiedMedia=${this.device.capabilities.supportsUnifiedMediaControl} hangdog=${this.device.capabilities.supportsHangdogRemoteControl}`
      );
      await withTimeout(this.device.connect(), this.connectTimeoutMs, this.timers);
      if (!this.device.isConnected) {
        throw new HomePodBackendError("protocol_error");
      }
      this.publishSnapshot("connected");
      this.publishConnection();
      this.logger.debug(`${reference(this.target.deviceId)} transient connect completed`);
    } catch (error) {
      const normalized = normalizeHomePodError(error);
      this.logger.debug(
        `${reference(this.target.deviceId)} transient connect failed code=${normalized.code} kind=${diagnosticErrorKind(error)}`
      );
      this.disposeDevice();
      this.callbacks.onConnection({
        state: "unavailable",
        online: false,
        pairing: "error",
        error: normalized.code
      });
      throw normalized;
    }
  }
  /**
   * Executes one transport command after current protocol capability checks.
   *
   * @param command - Normalized playback command.
   */
  async executePlayback(command) {
    const device = this.connectedDevice();
    if (!this.snapshot.capabilities.playback) {
      throw new HomePodBackendError("unsupported");
    }
    this.logger.debug(`${reference(this.target.deviceId)} playback dispatch command=${command}`);
    try {
      await device.playback[command]();
    } catch (error) {
      throw normalizeHomePodError(error);
    }
  }
  /**
   * Sets absolute volume after normalization by the runtime.
   *
   * @param percent - Finite public volume from 0 through 100.
   */
  async setVolume(percent) {
    const device = this.connectedDevice();
    if (!this.snapshot.capabilities.volume || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new HomePodBackendError("unsupported");
    }
    this.logger.debug(`${reference(this.target.deviceId)} volume dispatch percent=${Math.round(percent)}`);
    try {
      await device.volume.set(percent / 100);
    } catch (error) {
      throw normalizeHomePodError(error);
    }
  }
  /**
   * Applies an explicit mute state rather than a non-idempotent toggle.
   *
   * @param muted - Desired confirmed mute state.
   */
  async setMuted(muted) {
    const device = this.connectedDevice();
    if (!this.snapshot.capabilities.volume) {
      throw new HomePodBackendError("unsupported");
    }
    this.logger.debug(`${reference(this.target.deviceId)} mute dispatch muted=${muted}`);
    try {
      await (muted ? device.volume.mute() : device.volume.unmute());
    } catch (error) {
      throw normalizeHomePodError(error);
    }
  }
  /** Removes listeners and terminates the transient AirPlay session. */
  disconnect() {
    this.stopping = true;
    this.logger.debug(`${reference(this.target.deviceId)} disconnect starting`);
    this.disposeDevice();
    this.callbacks.onSnapshot((0, import_homePod.emptyHomePodSnapshot)());
    this.callbacks.onConnection({ state: "unavailable", online: false, pairing: "idle" });
    this.logger.debug(`${reference(this.target.deviceId)} disconnect completed`);
    return Promise.resolve();
  }
  connectedDevice() {
    if (this.device === void 0 || !this.device.isConnected) {
      throw new HomePodBackendError("not_connected");
    }
    return this.device;
  }
  subscribe(device) {
    device.on("disconnected", (unexpected) => {
      if (this.stopping) {
        return;
      }
      this.logger.debug(`${reference(this.target.deviceId)} disconnected unexpected=${unexpected}`);
      this.snapshot = (0, import_homePod.emptyHomePodSnapshot)();
      this.callbacks.onSnapshot(this.snapshot);
      this.callbacks.onConnection({
        state: unexpected ? "recovering" : "unavailable",
        online: false,
        pairing: unexpected ? "error" : "idle",
        error: unexpected ? "protocol_error" : void 0
      });
    });
    for (const event of [
      "nowPlayingChanged",
      "playbackStateChanged",
      "volumeChanged",
      "volumeMutedChanged",
      "supportedCommandsChanged"
    ]) {
      device.state.on(event, () => this.publishSnapshot(event));
    }
  }
  publishSnapshot(reason) {
    const device = this.device;
    if (device === void 0) {
      return;
    }
    const state = device.state;
    const playback = device.capabilities.supportsUnifiedMediaControl || device.capabilities.supportsHangdogRemoteControl;
    this.snapshot = {
      title: state.title || "",
      artist: state.artist || "",
      album: state.album || "",
      duration: finiteNonNegative(state.duration),
      position: finiteNonNegative(state.elapsedTime),
      isPlaying: state.isPlaying,
      volumeAvailable: state.volumeAvailable,
      volume: normalizeVolume(state.volume),
      muted: state.isMuted,
      capabilities: {
        playback,
        nowPlaying: device.isConnected,
        volume: state.volumeAvailable
      }
    };
    this.logger.debug(
      `${reference(this.target.deviceId)} state event=${reason} playing=${this.snapshot.isPlaying} metadata=${Boolean(this.snapshot.title || this.snapshot.artist || this.snapshot.album)} durationKnown=${this.snapshot.duration > 0} positionKnown=${this.snapshot.position > 0} volumeAvailable=${this.snapshot.volumeAvailable} muted=${this.snapshot.muted} capabilities=playback:${playback},nowPlaying:${device.isConnected},volume:${state.volumeAvailable}`
    );
    this.callbacks.onSnapshot({ ...this.snapshot, capabilities: { ...this.snapshot.capabilities } });
  }
  publishConnection() {
    var _a, _b;
    const online = (_b = (_a = this.device) == null ? void 0 : _a.isConnected) != null ? _b : false;
    this.callbacks.onConnection({
      state: online ? "online" : "unavailable",
      online,
      pairing: online ? "paired" : "idle"
    });
  }
  disposeDevice() {
    const device = this.device;
    this.device = void 0;
    if (device === void 0) {
      return;
    }
    device.removeAllListeners();
    device.state.removeAllListeners();
    device.disconnect();
    this.snapshot = (0, import_homePod.emptyHomePodSnapshot)();
  }
}
async function createSdkHomePod(target) {
  const sdk = await Promise.resolve().then(() => __toESM(require("@basmilius/apple-sdk")));
  return new sdk.HomePod({ airplay: (0, import_sdkConversion.toSdkDiscoveryResult)(target.airplay) });
}
function normalizeHomePodError(error) {
  if (error instanceof HomePodBackendError) {
    return error;
  }
  if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
    return new HomePodBackendError("timeout");
  }
  return new HomePodBackendError("protocol_error");
}
function diagnosticErrorKind(error) {
  if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)) {
    return "Error";
  }
  return error.name;
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
function reference(deviceId) {
  return `HomePod/\u2026${deviceId.slice(-4)}`;
}
function safeModel(model) {
  return /^AudioAccessory\d+,\d+$/i.test(model) ? model : "unknown";
}
function withTimeout(operation, timeoutMs, timers) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = timers.scheduleTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new HomePodConnectTimeoutError());
      }
    }, timeoutMs);
    operation.then(
      (value) => {
        if (!settled) {
          settled = true;
          timers.cancelTimeout(timer);
          resolve(value);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          timers.cancelTimeout(timer);
          reject(error instanceof Error ? error : new HomePodConnectionError());
        }
      }
    );
  });
}
class HomePodConnectTimeoutError extends Error {
  name = "HomePodConnectTimeoutError";
}
class HomePodConnectionError extends Error {
  name = "HomePodConnectionError";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HomePodBackend,
  HomePodBackendError,
  diagnosticErrorKind,
  normalizeHomePodError
});
//# sourceMappingURL=homePodBackend.js.map
