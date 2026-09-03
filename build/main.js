"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var import_node_path = require("node:path");
var utils = __toESM(require("@iobroker/adapter-core"));
var import_appleTvAdminApi = require("./admin/appleTvAdminApi");
var import_appleTvBackend = require("./backends/apple/appleTvBackend");
var import_homePodBackend = require("./backends/apple/homePodBackend");
var import_appleTvProjection = require("./objects/appleTvProjection");
var import_timerScheduler = require("./platform/timerScheduler");
var import_deviceSettingsStore = require("./persistence/deviceSettingsStore");
var import_managedDeviceStore = require("./persistence/managedDeviceStore");
var import_appleRuntime = require("./runtime/appleRuntime");
var import_pairingCredentialStore = require("./security/pairingCredentialStore");
class Apple extends utils.Adapter {
  runtime;
  constructor(options = {}) {
    super({ ...options, name: "apple" });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /** Initializes the encrypted store and complete Apple TV runtime. */
  async onReady() {
    const instanceDataDirectory = utils.getAbsoluteInstanceDataDir(this);
    const timers = (0, import_timerScheduler.createIoBrokerTimerScheduler)(this);
    const credentialStore = new import_pairingCredentialStore.PairingCredentialStore((0, import_node_path.join)(instanceDataDirectory, "pairings.v1.json"), {
      encrypt: (value) => this.encrypt(value),
      decrypt: (value) => this.decrypt(value)
    });
    const deviceSettings = new import_deviceSettingsStore.DeviceSettingsStore((0, import_node_path.join)(instanceDataDirectory, "device-settings.v1.json"));
    const managedDeviceStore = new import_managedDeviceStore.ManagedDeviceStore((0, import_node_path.join)(instanceDataDirectory, "managed-devices.v1.json"));
    this.runtime = new import_appleRuntime.AppleRuntime(
      new import_appleTvProjection.AppleTvProjection(this),
      credentialStore,
      {
        info: (message) => this.log.info(message),
        warn: (message) => this.log.warn(message),
        debug: (message) => this.log.debug(message)
      },
      discoveryIntervalMs(this.config.discoveryInterval),
      timers,
      void 0,
      void 0,
      void 0,
      deviceSettings,
      void 0,
      managedDeviceStore
    );
    try {
      await this.subscribeStatesAsync("devices.appletv.*.remote.*");
      await this.subscribeStatesAsync("devices.appletv.*.playback.*");
      await this.subscribeStatesAsync("devices.appletv.*.power.*");
      await this.subscribeStatesAsync("devices.appletv.*.apps.*");
      await this.subscribeStatesAsync("devices.homepod.*.playback.*");
      await this.subscribeStatesAsync("devices.homepod.*.volume.*");
      await this.runtime.start();
      this.log.info("Apple adapter runtime started");
    } catch (error) {
      const code = startupErrorCode(error);
      this.log.error(`Apple adapter startup failed: ${code}`);
      await this.setStateAsync("info.connection", false, true).catch(() => void 0);
      await this.setStateAsync("info.lastError", code, true).catch(() => void 0);
      await this.runtime.stop().catch(() => void 0);
      this.runtime = void 0;
    }
  }
  /**
   * Handles only true, unacknowledged, capability-created button writes.
   *
   * @param id - Fully qualified ioBroker state ID.
   * @param state - New state value.
   */
  onStateChange(id, state) {
    if (this.runtime === void 0) {
      return;
    }
    const command = (0, import_appleRuntime.parseAppleTvCommandWrite)(id, state);
    if (command !== void 0) {
      void this.runtime.executeRemote(command.deviceId, command.command).catch((error) => {
        const code = error instanceof import_appleTvBackend.AppleTvBackendError ? error.code : "protocol_error";
        this.log.warn(`Apple TV command failed: ${code}`);
      });
      return;
    }
    const homePod = (0, import_appleRuntime.parseHomePodWrite)(id, state);
    if (homePod !== void 0) {
      const operation2 = homePod.action === "playback" ? this.runtime.executeHomePodPlayback(homePod.deviceId, homePod.command) : homePod.action === "volume" ? this.runtime.setHomePodVolume(homePod.deviceId, homePod.percent) : this.runtime.setHomePodMuted(homePod.deviceId, homePod.muted);
      void operation2.catch((error) => {
        const code = error instanceof import_homePodBackend.HomePodBackendError ? error.code : "protocol_error";
        this.log.warn(`HomePod command failed: ${code}`);
      });
      return;
    }
    const app = (0, import_appleRuntime.parseAppWrite)(id, state);
    if (app === void 0) {
      return;
    }
    const operation = app.action === "refresh" ? this.runtime.refreshApps(app.deviceId) : app.action === "launchEntry" ? this.runtime.launchAppEntry(app.deviceId, app.entryKey) : this.runtime.openUrl(app.deviceId, app.url);
    void operation.catch((error) => {
      const code = error instanceof import_appleTvBackend.AppleTvBackendError ? error.code : "protocol_error";
      this.log.warn(`App command failed: ${code}`);
    });
  }
  /**
   * Serves the non-secret Admin pairing API.
   *
   * @param message - ioBroker adapter message.
   */
  async onMessage(message) {
    if (message.callback === void 0) {
      return;
    }
    let response;
    try {
      const runtime = this.runtime;
      if (runtime === void 0) {
        throw new import_appleTvBackend.AppleTvBackendError("unavailable");
      }
      switch (message.command) {
        case "getAppleTvDiscoveryOverview":
          response = {
            ...discoveryOverview(runtime, "appletv", "Apple TV"),
            style: { fontSize: "1.125rem", fontWeight: 500, lineHeight: 1.6 }
          };
          break;
        case "getHomePodDiscoveryOverview":
          response = discoveryOverview(runtime, "homepod", "HomePod");
          break;
        case "getAirPlayReceiverDiscoveryOverview":
          response = discoveryOverview(runtime, "airplayReceiver", "AirPlay Receiver");
          break;
        case "listPairingCandidates":
          response = (0, import_appleTvAdminApi.pairingCandidateItems)(runtime.pairingCandidates());
          break;
        case "listPairedDevices":
          response = (0, import_appleTvAdminApi.pairedDeviceItems)(runtime.pairedDevices());
          break;
        case "listManagedDeviceCandidates":
          response = runtime.managedDeviceCandidates(requiredManagedDeviceClass(message.message));
          break;
        case "listManagedDiscoveryDevices":
          response = runtime.managedDiscoveryDevices(requiredManagedDeviceClass(message.message));
          break;
        case "manageDiscoveredDevice":
          await runtime.manageDiscoveredDevice(
            requiredManagedDeviceClass(message.message),
            requiredString(message.message, "deviceId")
          );
          response = { result: "managed", reloadBrowser: true };
          break;
        case "setManagedDiscoveryDeviceEnabled":
          await runtime.setManagedDiscoveryDeviceEnabled(
            requiredManagedDeviceClass(message.message),
            requiredString(message.message, "deviceId"),
            requiredBoolean(message.message, "enabled")
          );
          response = { result: "updated", reloadBrowser: true };
          break;
        case "removeManagedDiscoveryDevice":
          await runtime.removeManagedDiscoveryDevice(
            requiredManagedDeviceClass(message.message),
            requiredString(message.message, "deviceId")
          );
          response = { result: "removed", reloadBrowser: true };
          break;
        case "getPairedDevicesOverview":
          {
            const devices = runtime.pairedDevices();
            response = {
              text: devices.length === 0 ? "No paired Apple TV devices" : devices.map(
                (device) => `${device.name}${device.model ? ` (${device.model})` : ""}: ${(0, import_appleTvAdminApi.pairedDeviceStatus)(device)}, ${device.appCount} app(s)`
              ).join("\n")
            };
          }
          break;
        case "removePairedDevice":
          await runtime.removePairedDevice(requiredString(message.message, "deviceId"));
          response = { result: "removed", reloadBrowser: true };
          break;
        case "setPairedDeviceEnabled":
          await runtime.setPairedDeviceEnabled(
            requiredString(message.message, "deviceId"),
            requiredBoolean(message.message, "enabled")
          );
          response = { result: "updated", reloadBrowser: true };
          break;
        case "startPairing":
          response = {
            result: (await runtime.startPairing(requiredString(message.message, "deviceId"))).status
          };
          break;
        case "finishPairing":
          response = {
            result: (await runtime.finishPairing(
              requiredString(message.message, "deviceId"),
              requiredString(message.message, "pin")
            )).status
          };
          break;
        case "cancelPairing":
          response = { result: runtime.cancelPairing().status };
          break;
        case "getPairingStatus":
          response = (0, import_appleTvAdminApi.pairingStatusPayload)(runtime.pairingStatus());
          break;
        default:
          response = { error: "unsupported" };
      }
    } catch (error) {
      response = { error: messageErrorCode(error) };
    }
    this.sendTo(message.from, message.command, response, message.callback);
  }
  /**
   * Stops discovery, pairing, protocol sessions, and pending projections.
   *
   * @param callback - ioBroker unload completion callback.
   */
  async onUnload(callback) {
    var _a;
    try {
      await ((_a = this.runtime) == null ? void 0 : _a.stop());
      await this.setStateAsync("info.connection", false, true);
    } catch {
      this.log.warn("Adapter cleanup failed: unavailable");
    } finally {
      callback();
    }
  }
}
function discoveryOverview(runtime, deviceClass, label) {
  const devices = runtime.discoveredDevices(deviceClass);
  return {
    text: devices.length === 0 ? `0 ${label} device(s) detected` : `${devices.length} ${label} device(s) detected
${devices.map((device) => `${device.name}${device.model ? ` (${device.model})` : ""}`).join("\n")}`
  };
}
function discoveryIntervalMs(configured) {
  const seconds = typeof configured === "number" && Number.isFinite(configured) ? configured : 60;
  return Math.min(3600, Math.max(30, Math.round(seconds))) * 1e3;
}
function requiredString(value, property) {
  if (typeof value !== "object" || value === null) {
    throw new import_appleTvBackend.AppleTvBackendError("unavailable");
  }
  const result = value[property];
  if (typeof result !== "string" || result.length === 0) {
    throw new import_appleTvBackend.AppleTvBackendError("unavailable");
  }
  return result;
}
function requiredBoolean(value, property) {
  if (typeof value !== "object" || value === null) {
    throw new import_appleTvBackend.AppleTvBackendError("unavailable");
  }
  const result = value[property];
  if (typeof result !== "boolean") {
    throw new import_appleTvBackend.AppleTvBackendError("unavailable");
  }
  return result;
}
function requiredManagedDeviceClass(value) {
  if (typeof value !== "object" || value === null) {
    throw new import_appleRuntime.DeviceManagementError("managed_device_not_found");
  }
  const deviceClass = value.deviceClass;
  if (deviceClass !== "homepod" && deviceClass !== "airplayReceiver") {
    throw new import_appleRuntime.DeviceManagementError("managed_device_not_found");
  }
  return deviceClass;
}
function startupErrorCode(error) {
  if (error instanceof import_pairingCredentialStore.CredentialStoreError || error instanceof import_deviceSettingsStore.DeviceSettingsStoreError || error instanceof import_managedDeviceStore.ManagedDeviceStoreError) {
    return error.code;
  }
  return messageErrorCode(error);
}
function messageErrorCode(error) {
  if (error instanceof import_appleTvBackend.AppleTvBackendError || error instanceof import_homePodBackend.HomePodBackendError || error instanceof import_appleRuntime.DeviceManagementError) {
    return error.code;
  }
  if (error instanceof import_deviceSettingsStore.DeviceSettingsStoreError) {
    return error.code;
  }
  if (error instanceof import_managedDeviceStore.ManagedDeviceStoreError) {
    return error.code;
  }
  if (error instanceof Error && ["pairing_pin_invalid", "pairing_not_active"].includes(error.message)) {
    return "unavailable";
  }
  return "protocol_error";
}
if (require.main !== module) {
  module.exports = (options) => new Apple(options);
} else {
  (() => new Apple())();
}
//# sourceMappingURL=main.js.map
