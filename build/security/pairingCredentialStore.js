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
var pairingCredentialStore_exports = {};
__export(pairingCredentialStore_exports, {
  CredentialStoreError: () => CredentialStoreError,
  PairingCredentialStore: () => PairingCredentialStore
});
module.exports = __toCommonJS(pairingCredentialStore_exports);
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
var import_node_crypto = require("node:crypto");
class CredentialStoreError extends Error {
  /**
   * Creates a redacted stable credential-store error.
   *
   * @param code - Stable non-secret error code.
   */
  constructor(code) {
    super(code);
    this.code = code;
    this.name = "CredentialStoreError";
  }
}
class PairingCredentialStore {
  /**
   * Creates one instance-scoped encrypted store.
   *
   * @param filePath - Absolute encrypted database path.
   * @param cipher - ioBroker installation-secret cipher.
   */
  constructor(filePath, cipher) {
    this.filePath = filePath;
    this.cipher = cipher;
  }
  /** Current validated in-memory snapshot. */
  credentials = /* @__PURE__ */ new Map();
  /** Loads and validates the complete encrypted database. */
  async initialize() {
    let file;
    try {
      file = await (0, import_promises.readFile)(this.filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        this.credentials = /* @__PURE__ */ new Map();
        return;
      }
      throw new CredentialStoreError("invalid_store");
    }
    let envelope;
    try {
      envelope = JSON.parse(file);
    } catch {
      throw new CredentialStoreError("invalid_store");
    }
    if (!isEncryptedEnvelope(envelope)) {
      throw new CredentialStoreError("invalid_store");
    }
    let decrypted;
    try {
      decrypted = this.cipher.decrypt(envelope.ciphertext);
    } catch {
      throw new CredentialStoreError("decrypt_failed");
    }
    let database;
    try {
      database = JSON.parse(decrypted);
    } catch {
      throw new CredentialStoreError("invalid_store");
    }
    if (!isCredentialDatabase(database)) {
      throw new CredentialStoreError("invalid_store");
    }
    this.credentials = new Map(
      Object.entries(database.devices).map(([deviceId, value]) => [deviceId, deserializeCredentials(value)])
    );
  }
  /**
   * Gets a defensive credential copy.
   *
   * @param deviceId - Normalized protocol device identifier.
   * @returns Credentials or undefined when the device is not paired.
   */
  get(deviceId) {
    const value = this.credentials.get(normalizedDeviceId(deviceId));
    return value === void 0 ? void 0 : cloneCredentials(value);
  }
  /**
   * Lists paired normalized device identifiers.
   *
   * @returns Sorted identifiers.
   */
  deviceIds() {
    return [...this.credentials.keys()].sort();
  }
  /**
   * Atomically adds or replaces one pairing.
   *
   * @param deviceId - Normalized protocol device identifier.
   * @param credentials - Long-term pairing credentials.
   */
  async set(deviceId, credentials) {
    const next = new Map(this.credentials);
    next.set(normalizedDeviceId(deviceId), cloneCredentials(credentials));
    await this.persist(next);
    this.credentials = next;
  }
  /**
   * Atomically removes one pairing.
   *
   * @param deviceId - Normalized protocol device identifier.
   * @returns Whether a record was removed.
   */
  async remove(deviceId) {
    const next = new Map(this.credentials);
    const removed = next.delete(normalizedDeviceId(deviceId));
    if (!removed) {
      return false;
    }
    await this.persist(next);
    this.credentials = next;
    return true;
  }
  /**
   * Persists a complete snapshot as one encrypted atomic replacement.
   *
   * @param values - Complete validated snapshot to persist.
   */
  async persist(values) {
    const database = {
      version: 1,
      devices: Object.fromEntries(
        [...values.entries()].map(([deviceId, value]) => [deviceId, serializeCredentials(value)])
      )
    };
    let ciphertext;
    try {
      ciphertext = this.cipher.encrypt(JSON.stringify(database));
    } catch {
      throw new CredentialStoreError("write_failed");
    }
    if (ciphertext.length === 0) {
      throw new CredentialStoreError("write_failed");
    }
    const envelope = { version: 1, ciphertext };
    const directory = (0, import_node_path.dirname)(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.${(0, import_node_crypto.randomUUID)()}.tmp`;
    try {
      await (0, import_promises.mkdir)(directory, { recursive: true, mode: 448 });
      await (0, import_promises.chmod)(directory, 448);
      await (0, import_promises.writeFile)(temporaryPath, `${JSON.stringify(envelope)}
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
      throw new CredentialStoreError("write_failed");
    }
  }
  /** Returns current file permission bits for diagnostics and tests. */
  async fileMode() {
    return (await (0, import_promises.stat)(this.filePath)).mode & 511;
  }
}
function serializeCredentials(credentials) {
  return {
    accessoryIdentifier: credentials.accessoryIdentifier,
    accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString("base64"),
    pairingId: credentials.pairingId.toString("base64"),
    publicKey: credentials.publicKey.toString("base64"),
    secretKey: credentials.secretKey.toString("base64")
  };
}
function deserializeCredentials(credentials) {
  return {
    accessoryIdentifier: credentials.accessoryIdentifier,
    accessoryLongTermPublicKey: Buffer.from(credentials.accessoryLongTermPublicKey, "base64"),
    pairingId: Buffer.from(credentials.pairingId, "base64"),
    publicKey: Buffer.from(credentials.publicKey, "base64"),
    secretKey: Buffer.from(credentials.secretKey, "base64")
  };
}
function cloneCredentials(credentials) {
  return {
    accessoryIdentifier: credentials.accessoryIdentifier,
    accessoryLongTermPublicKey: Buffer.from(credentials.accessoryLongTermPublicKey),
    pairingId: Buffer.from(credentials.pairingId),
    publicKey: Buffer.from(credentials.publicKey),
    secretKey: Buffer.from(credentials.secretKey)
  };
}
function isEncryptedEnvelope(value) {
  return isRecord(value) && value.version === 1 && typeof value.ciphertext === "string" && value.ciphertext.length > 0;
}
function isCredentialDatabase(value) {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.devices)) {
    return false;
  }
  return Object.entries(value.devices).every(
    ([deviceId, credentials]) => isDeviceId(deviceId) && isSerializedCredentials(credentials)
  );
}
function isSerializedCredentials(value) {
  return isRecord(value) && typeof value.accessoryIdentifier === "string" && value.accessoryIdentifier.length > 0 && isBase64(value.accessoryLongTermPublicKey) && isBase64(value.pairingId) && isBase64(value.publicKey) && isBase64(value.secretKey);
}
function isBase64(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.length > 0 && decoded.toString("base64") === value;
}
function normalizedDeviceId(value) {
  const normalized = value.replaceAll(":", "").replaceAll("-", "").toUpperCase();
  if (!isDeviceId(normalized)) {
    throw new CredentialStoreError("invalid_store");
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
  CredentialStoreError,
  PairingCredentialStore
});
//# sourceMappingURL=pairingCredentialStore.js.map
