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
var appleTvPairing_exports = {};
__export(appleTvPairing_exports, {
  AppleTvPairing: () => AppleTvPairing
});
module.exports = __toCommonJS(appleTvPairing_exports);
var import_sdkConversion = require("./sdkConversion");
class AppleTvPairing {
  /**
   * Creates one bounded pairing coordinator.
   *
   * @param timers - Adapter-owned scheduling boundary.
   * @param timeoutMs - Total pairing session deadline.
   * @param sessionFactory - Upstream session factory.
   */
  constructor(timers, timeoutMs = 12e4, sessionFactory = createSdkPairingSession) {
    this.timers = timers;
    this.timeoutMs = timeoutMs;
    this.sessionFactory = sessionFactory;
  }
  session;
  deviceId;
  expiry = void 0;
  expiresAt;
  currentStatus = { status: "idle" };
  /**
   * Starts pairing and triggers the on-screen PIN.
   *
   * @param target - Currently discovered Apple TV.
   */
  async start(target) {
    this.cancel();
    this.currentStatus = { status: "starting" };
    this.expiresAt = Date.now() + this.timeoutMs;
    try {
      const session = await this.sessionFactory(target);
      this.session = session;
      this.deviceId = target.deviceId;
      await this.withDeadline(session.start());
      this.currentStatus = { status: "pinRequired" };
      this.armExpiry();
    } catch {
      const timedOut = this.currentStatus.error === "timeout";
      this.abortActive();
      if (!timedOut) {
        this.currentStatus = { status: "error", error: "protocol_error" };
      }
      throw new Error("pairing_start_failed");
    }
  }
  /**
   * Completes pairing with one PIN that is never retained.
   *
   * @param deviceId - Target ID selected when pairing started.
   * @param pin - Four digits shown on the Apple TV.
   * @returns Long-term credentials.
   */
  async finish(deviceId, pin) {
    if (this.session === void 0 || this.deviceId !== deviceId || this.currentStatus.status !== "pinRequired") {
      throw new Error("pairing_not_active");
    }
    if (!/^\d{4}$/.test(pin)) {
      throw new Error("pairing_pin_invalid");
    }
    const session = this.session;
    this.currentStatus = { status: "completing" };
    this.clearExpiry();
    try {
      const credentials = await this.withDeadline(session.pin(pin).then(() => session.end()));
      this.session = void 0;
      this.deviceId = void 0;
      this.expiresAt = void 0;
      this.currentStatus = { status: "paired" };
      return credentials;
    } catch {
      const timedOut = this.currentStatus.error === "timeout";
      this.abortActive();
      if (!timedOut) {
        this.currentStatus = { status: "error", error: "protocol_error" };
      }
      throw new Error("pairing_finish_failed");
    }
  }
  /** Cancels and forgets any active pairing session. */
  cancel() {
    this.abortActive();
    this.currentStatus = { status: "idle" };
  }
  /** Returns a defensive non-secret status snapshot. */
  status() {
    return { ...this.currentStatus, ...this.deviceId === void 0 ? {} : { deviceId: this.deviceId } };
  }
  /** Aborts the SDK session and clears the timeout. */
  abortActive() {
    var _a;
    this.clearExpiry();
    (_a = this.session) == null ? void 0 : _a.abort();
    this.session = void 0;
    this.deviceId = void 0;
    this.expiresAt = void 0;
  }
  /** Arms the remaining idle portion of the single pairing deadline. */
  armExpiry() {
    var _a;
    const remaining = Math.max(1, ((_a = this.expiresAt) != null ? _a : Date.now()) - Date.now());
    this.expiry = this.timers.scheduleTimeout(() => this.expireActive(), remaining);
  }
  /** Expires and forgets the active secret-bearing session. */
  expireActive() {
    var _a;
    this.clearExpiry();
    (_a = this.session) == null ? void 0 : _a.abort();
    this.session = void 0;
    this.deviceId = void 0;
    this.expiresAt = void 0;
    this.currentStatus = { status: "error", error: "timeout" };
  }
  /**
   * Bounds one SDK operation by the remaining pairing-session deadline.
   *
   * @param operation - In-flight SDK operation.
   */
  withDeadline(operation) {
    var _a;
    const remaining = Math.max(1, ((_a = this.expiresAt) != null ? _a : Date.now()) - Date.now());
    return new Promise((resolve, reject) => {
      let settled = false;
      this.expiry = this.timers.scheduleTimeout(() => {
        if (!settled) {
          settled = true;
          this.expireActive();
          reject(new Error("pairing_timeout"));
        }
      }, remaining);
      operation.then(
        (value) => {
          if (!settled) {
            settled = true;
            this.clearExpiry();
            resolve(value);
          }
        },
        (error) => {
          if (!settled) {
            settled = true;
            this.clearExpiry();
            reject(error instanceof Error ? error : new Error("pairing_operation_failed"));
          }
        }
      );
    });
  }
  /** Clears the bounded session timeout. */
  clearExpiry() {
    if (this.expiry !== void 0) {
      this.timers.cancelTimeout(this.expiry);
      this.expiry = void 0;
    }
  }
}
async function createSdkPairingSession(target) {
  const sdk = await Promise.resolve().then(() => __toESM(require("@basmilius/apple-sdk")));
  return new sdk.PairingSession((0, import_sdkConversion.toSdkDiscoveryResult)(target.airplay));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AppleTvPairing
});
//# sourceMappingURL=appleTvPairing.js.map
