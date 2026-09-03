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
var sdkConversion_exports = {};
__export(sdkConversion_exports, {
  toSdkDiscoveryResult: () => toSdkDiscoveryResult
});
module.exports = __toCommonJS(sdkConversion_exports);
function toSdkDiscoveryResult(service) {
  return {
    id: service.id,
    fqdn: service.fqdn,
    address: service.address,
    modelName: service.modelName,
    familyName: service.familyName,
    service: service.service,
    packet: {},
    txt: service.txt,
    features: service.features === void 0 ? void 0 : BigInt(service.features)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  toSdkDiscoveryResult
});
//# sourceMappingURL=sdkConversion.js.map
