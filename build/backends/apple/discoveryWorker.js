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
var import_discoveryCorrelation = require("./discoveryCorrelation");
async function run() {
  var _a, _b, _c;
  try {
    const common = await Promise.resolve().then(() => __toESM(require("@basmilius/apple-common")));
    const results = await common.Discovery.discoverAll();
    (_a = process.send) == null ? void 0 : _a.call(process, { type: "result", discovery: (0, import_discoveryCorrelation.summarizeAppleDiscovery)(results.map(serializeCombinedResult)) });
  } catch {
    (_b = process.send) == null ? void 0 : _b.call(process, { type: "error", code: "discovery_failed" });
  } finally {
    (_c = process.disconnect) == null ? void 0 : _c.call(process);
  }
}
function serializeCombinedResult(result) {
  return {
    name: result.name,
    airplay: serializeService(result.airplay),
    companionLink: serializeService(result.companionLink),
    raop: serializeService(result.raop)
  };
}
function serializeService(result) {
  var _a;
  if (result === void 0) {
    return void 0;
  }
  return {
    id: result.id,
    fqdn: result.fqdn,
    address: result.address,
    modelName: result.modelName,
    familyName: result.familyName,
    service: {
      port: result.service.port,
      protocol: result.service.protocol,
      type: result.service.type
    },
    txt: result.txt,
    features: (_a = result.features) == null ? void 0 : _a.toString()
  };
}
if (require.main === module) {
  void run();
}
//# sourceMappingURL=discoveryWorker.js.map
