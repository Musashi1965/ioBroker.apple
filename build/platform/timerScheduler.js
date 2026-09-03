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
var timerScheduler_exports = {};
__export(timerScheduler_exports, {
  createIoBrokerTimerScheduler: () => createIoBrokerTimerScheduler
});
module.exports = __toCommonJS(timerScheduler_exports);
function createIoBrokerTimerScheduler(adapter) {
  return {
    scheduleTimeout: (callback, delayMs) => adapter.setTimeout(callback, delayMs),
    cancelTimeout: (handle) => adapter.clearTimeout(handle),
    scheduleInterval: (callback, delayMs) => adapter.setInterval(callback, delayMs),
    cancelInterval: (handle) => adapter.clearInterval(handle)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createIoBrokerTimerScheduler
});
//# sourceMappingURL=timerScheduler.js.map
