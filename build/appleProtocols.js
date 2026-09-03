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
var appleProtocols_exports = {};
__export(appleProtocols_exports, {
  APPLE_PROTOCOLS: () => APPLE_PROTOCOLS,
  isAppleProtocol: () => isAppleProtocol
});
module.exports = __toCommonJS(appleProtocols_exports);
const APPLE_PROTOCOLS = ["airplay", "companion", "raop"];
function isAppleProtocol(value) {
  return typeof value === "string" && APPLE_PROTOCOLS.includes(value);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  APPLE_PROTOCOLS,
  isAppleProtocol
});
//# sourceMappingURL=appleProtocols.js.map
