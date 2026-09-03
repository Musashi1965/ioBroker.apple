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
var managedDeviceStore_exports = {};
__export(managedDeviceStore_exports, {
  ManagedDeviceStore: () => ManagedDeviceStore,
  ManagedDeviceStoreError: () => ManagedDeviceStoreError
});
module.exports = __toCommonJS(managedDeviceStore_exports);
var import_node_crypto = require("node:crypto");
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
class ManagedDeviceStoreError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "ManagedDeviceStoreError";
  }
}
class ManagedDeviceStore {
  constructor(filePath) {
    this.filePath = filePath;
  }
  devices = /* @__PURE__ */ new Map();
  /** Loads and validates the complete local inventory. */
  async initialize() {
    let file;
    try {
      file = await (0, import_promises.readFile)(this.filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        this.devices = /* @__PURE__ */ new Map();
        return;
      }
      throw new ManagedDeviceStoreError("invalid_managed_devices");
    }
    let database;
    try {
      database = JSON.parse(file);
    } catch {
      throw new ManagedDeviceStoreError("invalid_managed_devices");
    }
    if (!isManagedDeviceDatabase(database)) {
      throw new ManagedDeviceStoreError("invalid_managed_devices");
    }
    this.devices = new Map(
      database.devices.map((device) => [deviceKey(device.deviceClass, device.deviceId), device])
    );
  }
  /**
   * Returns immutable copies of all locally managed devices in one class.
   *
   * @param deviceClass
   */
  list(deviceClass) {
    return [...this.devices.values()].filter((device) => device.deviceClass === deviceClass).map((device) => ({ ...device })).sort((left, right) => left.name.localeCompare(right.name) || left.deviceId.localeCompare(right.deviceId));
  }
  /**
   * Returns whether one stable device ID has been explicitly adopted.
   *
   * @param deviceClass
   * @param deviceId
   */
  has(deviceClass, deviceId) {
    return this.devices.has(deviceKey(deviceClass, normalizeDeviceId(deviceId)));
  }
  /**
   * Returns whether one adopted device may receive a public object tree.
   *
   * @param deviceClass
   * @param deviceId
   */
  isEnabled(deviceClass, deviceId) {
    var _a, _b;
    return (_b = (_a = this.devices.get(deviceKey(deviceClass, normalizeDeviceId(deviceId)))) == null ? void 0 : _a.enabled) != null ? _b : false;
  }
  /**
   * Adopts one current discovery target as active and stores fallback metadata.
   *
   * @param deviceClass
   * @param device
   */
  async manage(deviceClass, device) {
    const record = normalizedRecord({ ...device, deviceClass, enabled: true });
    const next = new Map(this.devices);
    next.set(deviceKey(deviceClass, record.deviceId), record);
    await this.persist(next);
    this.devices = next;
  }
  /**
   * Updates fallback display metadata only for an already managed device.
   *
   * @param deviceClass
   * @param device
   */
  async observe(deviceClass, device) {
    const key = deviceKey(deviceClass, normalizeDeviceId(device.deviceId));
    const current = this.devices.get(key);
    if (current === void 0) {
      return;
    }
    const record = normalizedRecord({ ...current, name: device.name, model: device.model });
    if (current.name === record.name && current.model === record.model) {
      return;
    }
    const next = new Map(this.devices);
    next.set(key, record);
    await this.persist(next);
    this.devices = next;
  }
  /**
   * Changes one adopted device's active/passive state.
   *
   * @param deviceClass
   * @param deviceId
   * @param enabled
   */
  async setEnabled(deviceClass, deviceId, enabled) {
    const key = deviceKey(deviceClass, normalizeDeviceId(deviceId));
    const current = this.devices.get(key);
    if (current === void 0) {
      throw new ManagedDeviceStoreError("managed_device_not_found");
    }
    if (current.enabled === enabled) {
      return;
    }
    const next = new Map(this.devices);
    next.set(key, { ...current, enabled });
    await this.persist(next);
    this.devices = next;
  }
  /**
   * Forgets one local management record without suppressing future discovery.
   *
   * @param deviceClass
   * @param deviceId
   */
  async remove(deviceClass, deviceId) {
    const next = new Map(this.devices);
    if (!next.delete(deviceKey(deviceClass, normalizeDeviceId(deviceId)))) {
      return false;
    }
    await this.persist(next);
    this.devices = next;
    return true;
  }
  /** Returns current file permission bits for diagnostics and tests. */
  async fileMode() {
    return (await (0, import_promises.stat)(this.filePath)).mode & 511;
  }
  async persist(devices) {
    const database = {
      version: 1,
      devices: [...devices.values()].map((device) => ({ ...device })).sort(compareRecords)
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
      throw new ManagedDeviceStoreError("managed_devices_write_failed");
    }
  }
}
function normalizedRecord(record) {
  const normalized = {
    ...record,
    deviceId: normalizeDeviceId(record.deviceId),
    name: record.name.trim(),
    model: record.model.trim()
  };
  if (!isManagedDeviceRecord(normalized)) {
    throw new ManagedDeviceStoreError("invalid_managed_devices");
  }
  return normalized;
}
function isManagedDeviceDatabase(value) {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.devices)) {
    return false;
  }
  if (!value.devices.every(isManagedDeviceRecord)) {
    return false;
  }
  const keys = value.devices.map((device) => deviceKey(device.deviceClass, device.deviceId));
  return new Set(keys).size === keys.length;
}
function isManagedDeviceRecord(value) {
  return isRecord(value) && (value.deviceClass === "homepod" || value.deviceClass === "airplayReceiver") && typeof value.deviceId === "string" && /^[0-9A-F]{12}$/.test(value.deviceId) && typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 256 && typeof value.model === "string" && value.model.length <= 128 && typeof value.enabled === "boolean";
}
function normalizeDeviceId(value) {
  const normalized = value.replaceAll(":", "").replaceAll("-", "").toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(normalized)) {
    throw new ManagedDeviceStoreError("invalid_managed_devices");
  }
  return normalized;
}
function deviceKey(deviceClass, deviceId) {
  return `${deviceClass}:${deviceId}`;
}
function compareRecords(left, right) {
  return left.deviceClass.localeCompare(right.deviceClass) || left.deviceId.localeCompare(right.deviceId);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(value) {
  return value instanceof Error && "code" in value;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ManagedDeviceStore,
  ManagedDeviceStoreError
});
//# sourceMappingURL=managedDeviceStore.js.map
