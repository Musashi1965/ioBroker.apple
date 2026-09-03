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
var appleTvAdminApi_exports = {};
__export(appleTvAdminApi_exports, {
  pairedDeviceItems: () => pairedDeviceItems,
  pairedDeviceStatus: () => pairedDeviceStatus,
  pairingCandidateItems: () => pairingCandidateItems,
  pairingStatusPayload: () => pairingStatusPayload
});
module.exports = __toCommonJS(appleTvAdminApi_exports);
function pairingCandidateItems(candidates) {
  return candidates.filter((candidate) => !candidate.paired).map((candidate) => ({
    ...candidate,
    label: `${candidate.name} (${candidate.model})`,
    value: candidate.deviceId
  }));
}
function pairedDeviceItems(devices) {
  return devices.map((device) => ({
    ...device,
    label: `${device.name}${device.model ? ` (${device.model})` : ""} \u2014 ${pairedDeviceStatus(device)}`,
    value: device.deviceId
  }));
}
function pairingStatusPayload(status) {
  return {
    text: status.error === void 0 ? status.status : `${status.status}: ${status.error}`,
    status: status.status,
    deviceId: status.deviceId,
    pairingError: status.error
  };
}
function pairedDeviceStatus(device) {
  return !device.enabled ? "passive" : device.connected ? "online, active" : device.discovered ? "discovered, active" : "offline, active";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  pairedDeviceItems,
  pairedDeviceStatus,
  pairingCandidateItems,
  pairingStatusPayload
});
//# sourceMappingURL=appleTvAdminApi.js.map
