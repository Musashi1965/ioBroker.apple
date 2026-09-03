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
var discoveryProcess_exports = {};
__export(discoveryProcess_exports, {
  AppleDiscoveryError: () => AppleDiscoveryError,
  AppleDiscoveryProcess: () => AppleDiscoveryProcess
});
module.exports = __toCommonJS(discoveryProcess_exports);
var import_node_child_process = require("node:child_process");
var import_node_path = require("node:path");
class AppleDiscoveryError extends Error {
  /**
   * Creates one redacted discovery error.
   *
   * @param code - Stable error code.
   */
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "AppleDiscoveryError";
  }
}
class AppleDiscoveryProcess {
  /** @param timers - Adapter-owned scheduling boundary. */
  constructor(timers) {
    this.timers = timers;
  }
  activeChild;
  activeCancel;
  /**
   * Runs one bounded discovery scan.
   *
   * @param timeoutMs - Hard process timeout.
   * @returns Supported Apple TVs and exclusive device-class counts.
   */
  discover(timeoutMs = 9e3) {
    if (this.activeChild !== void 0) {
      return Promise.reject(new AppleDiscoveryError("busy"));
    }
    return new Promise((resolvePromise, rejectPromise) => {
      const child = (0, import_node_child_process.fork)((0, import_node_path.resolve)(__dirname, "discoveryWorker.js"), [], {
        stdio: ["ignore", "ignore", "ignore", "ipc"]
      });
      this.activeChild = child;
      let settled = false;
      const handles = {};
      const finish = (discovery, error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (handles.timeout !== void 0) {
          this.timers.cancelTimeout(handles.timeout);
        }
        child.removeAllListeners();
        this.activeChild = void 0;
        this.activeCancel = void 0;
        terminate(child, this.timers);
        if (error !== void 0) {
          rejectPromise(error);
        } else {
          resolvePromise(discovery != null ? discovery : emptyDiscoverySnapshot());
        }
      };
      this.activeCancel = () => finish(void 0, new AppleDiscoveryError("cancelled"));
      handles.timeout = this.timers.scheduleTimeout(
        () => finish(void 0, new AppleDiscoveryError("timeout")),
        timeoutMs
      );
      child.on("message", (message) => {
        if (isResultMessage(message)) {
          finish(message.discovery);
        } else if (isErrorMessage(message)) {
          finish(void 0, new AppleDiscoveryError(message.code));
        }
      });
      child.once("error", () => finish(void 0, new AppleDiscoveryError("discovery_failed")));
      child.once("exit", (code) => {
        if (code !== 0) {
          finish(void 0, new AppleDiscoveryError("discovery_failed"));
        }
      });
    });
  }
  /** Cancels the active worker during adapter unload. */
  cancel() {
    var _a;
    (_a = this.activeCancel) == null ? void 0 : _a.call(this);
  }
}
function terminate(child, timers) {
  if (child.connected) {
    child.disconnect();
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    const forceKill = timers.scheduleTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 1e3);
    child.once("exit", () => timers.cancelTimeout(forceKill));
  }
}
function isResultMessage(value) {
  if (!isRecord(value) || value.type !== "result" || !isRecord(value.discovery)) {
    return false;
  }
  const counts = value.discovery.deviceCounts;
  const details = value.discovery.deviceDetails;
  return Array.isArray(value.discovery.devices) && isHomePods(value.discovery.homePods) && isAirPlayReceivers(value.discovery.airplayReceivers) && isRecord(counts) && isNonNegativeInteger(counts.appletv) && isNonNegativeInteger(counts.homepod) && isNonNegativeInteger(counts.airplayReceiver) && isRecord(details) && isDeviceDetails(details.appletv, "appletv") && isDeviceDetails(details.homepod, "homepod") && isDeviceDetails(details.airplayReceiver, "airplayReceiver") && counts.appletv === details.appletv.length && counts.homepod === details.homepod.length && counts.airplayReceiver === details.airplayReceiver.length;
}
function isHomePods(value) {
  return Array.isArray(value) && value.every(
    (homePod) => isRecord(homePod) && typeof homePod.deviceId === "string" && /^[0-9A-F]{12}$/.test(homePod.deviceId) && typeof homePod.name === "string" && typeof homePod.model === "string" && /^AudioAccessory\d+,\d+$/i.test(homePod.model) && isDiscoveryService(homePod.airplay, "_airplay._tcp.local")
  );
}
function isDiscoveryService(value, expectedType) {
  return isRecord(value) && typeof value.id === "string" && typeof value.fqdn === "string" && typeof value.address === "string" && isRecord(value.service) && value.service.type === expectedType && typeof value.service.port === "number";
}
function isAirPlayReceivers(value) {
  return Array.isArray(value) && value.every(
    (receiver) => isRecord(receiver) && typeof receiver.deviceId === "string" && /^[0-9A-F]{12}$/.test(receiver.deviceId) && typeof receiver.name === "string" && typeof receiver.model === "string"
  );
}
function isDeviceDetails(value, deviceClass) {
  return Array.isArray(value) && value.every(
    (device) => isRecord(device) && device.deviceClass === deviceClass && typeof device.identity === "string" && device.identity.length > 0 && typeof device.name === "string" && typeof device.model === "string"
  );
}
function isErrorMessage(value) {
  return isRecord(value) && value.type === "error" && value.code === "discovery_failed";
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function emptyDiscoverySnapshot() {
  return {
    devices: [],
    homePods: [],
    airplayReceivers: [],
    deviceCounts: { appletv: 0, homepod: 0, airplayReceiver: 0 },
    deviceDetails: { appletv: [], homepod: [], airplayReceiver: [] }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AppleDiscoveryError,
  AppleDiscoveryProcess
});
//# sourceMappingURL=discoveryProcess.js.map
