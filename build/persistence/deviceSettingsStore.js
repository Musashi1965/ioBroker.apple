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
var deviceSettingsStore_exports = {};
__export(deviceSettingsStore_exports, {
  DeviceSettingsStore: () => DeviceSettingsStore,
  DeviceSettingsStoreError: () => DeviceSettingsStoreError
});
module.exports = __toCommonJS(deviceSettingsStore_exports);
var import_node_crypto = require("node:crypto");
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
class DeviceSettingsStoreError extends Error {
  /**
   * Creates one redacted store error.
   *
   * @param code - Stable non-secret error code.
   */
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "DeviceSettingsStoreError";
  }
}
class DeviceSettingsStore {
  /**
   * Creates one device-settings store.
   *
   * @param filePath - Absolute instance-scoped database path.
   */
  constructor(filePath) {
    this.filePath = filePath;
  }
  disabledAppleTvDeviceIds = /* @__PURE__ */ new Set();
  /** Loads and validates the complete settings database. */
  async initialize() {
    let file;
    try {
      file = await (0, import_promises.readFile)(this.filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        this.disabledAppleTvDeviceIds = /* @__PURE__ */ new Set();
        return;
      }
      throw new DeviceSettingsStoreError("invalid_device_settings");
    }
    let database;
    try {
      database = JSON.parse(file);
    } catch {
      throw new DeviceSettingsStoreError("invalid_device_settings");
    }
    if (!isDeviceSettingsDatabase(database)) {
      throw new DeviceSettingsStoreError("invalid_device_settings");
    }
    this.disabledAppleTvDeviceIds = new Set(database.disabledAppleTvDeviceIds);
  }
  /**
   * Returns whether one paired Apple TV participates in runtime projection.
   *
   * @param deviceId - Stable normalized Apple TV identifier.
   */
  isEnabled(deviceId) {
    return !this.disabledAppleTvDeviceIds.has(normalizedDeviceId(deviceId));
  }
  /**
   * Atomically changes one Apple TV enablement flag.
   *
   * @param deviceId - Stable normalized Apple TV identifier.
   * @param enabled - Whether runtime projection is allowed.
   */
  async setEnabled(deviceId, enabled) {
    const normalized = normalizedDeviceId(deviceId);
    const next = new Set(this.disabledAppleTvDeviceIds);
    if (enabled) {
      next.delete(normalized);
    } else {
      next.add(normalized);
    }
    await this.persist(next);
    this.disabledAppleTvDeviceIds = next;
  }
  /**
   * Removes stale enablement metadata when a pairing is forgotten.
   *
   * @param deviceId - Stable normalized Apple TV identifier.
   */
  async remove(deviceId) {
    const next = new Set(this.disabledAppleTvDeviceIds);
    if (!next.delete(normalizedDeviceId(deviceId))) {
      return;
    }
    await this.persist(next);
    this.disabledAppleTvDeviceIds = next;
  }
  /** Returns current file permission bits for diagnostics and tests. */
  async fileMode() {
    return (await (0, import_promises.stat)(this.filePath)).mode & 511;
  }
  /**
   * Persists one validated complete snapshot as an atomic replacement.
   *
   * @param disabledAppleTvDeviceIds - Complete set of explicitly disabled identifiers.
   */
  async persist(disabledAppleTvDeviceIds) {
    const database = {
      version: 1,
      disabledAppleTvDeviceIds: [...disabledAppleTvDeviceIds].sort()
    };
    const directory = (0, import_node_path.dirname)(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.${(0, import_node_crypto.randomUUID)()}.tmp`;
    try {
      await (0, import_promises.mkdir)(directory, { recursive: true, mode: 448 });
      await (0, import_promises.chmod)(directory, 448);
      await (0, import_promises.writeFile)(temporaryPath, `${JSON.stringify(database)}
`, {
        encoding: "utf8",
        flag: "wx",
        mode: 384
      });
      await (0, import_promises.chmod)(temporaryPath, 384);
      await (0, import_promises.rename)(temporaryPath, this.filePath);
      await (0, import_promises.chmod)(this.filePath, 384);
    } catch {
      await (0, import_promises.unlink)(temporaryPath).catch(() => void 0);
      throw new DeviceSettingsStoreError("device_settings_write_failed");
    }
  }
}
function isDeviceSettingsDatabase(value) {
  return isRecord(value) && value.version === 1 && Array.isArray(value.disabledAppleTvDeviceIds) && value.disabledAppleTvDeviceIds.every((deviceId) => typeof deviceId === "string" && isDeviceId(deviceId)) && new Set(value.disabledAppleTvDeviceIds).size === value.disabledAppleTvDeviceIds.length;
}
function normalizedDeviceId(value) {
  const normalized = value.replaceAll(":", "").replaceAll("-", "").toUpperCase();
  if (!isDeviceId(normalized)) {
    throw new DeviceSettingsStoreError("invalid_device_settings");
  }
  return normalized;
}
function isDeviceId(value) {
  return /^[0-9A-F]{12}$/.test(value);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(value) {
  return value instanceof Error && "code" in value;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeviceSettingsStore,
  DeviceSettingsStoreError
});
//# sourceMappingURL=deviceSettingsStore.js.map
