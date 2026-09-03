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
var appleTv_exports = {};
__export(appleTv_exports, {
  emptyAppleTvSnapshot: () => emptyAppleTvSnapshot
});
module.exports = __toCommonJS(appleTv_exports);
function emptyAppleTvSnapshot() {
  return {
    powerState: "unknown",
    title: "",
    artist: "",
    album: "",
    app: "",
    appBundleId: "",
    duration: 0,
    position: 0,
    isPlaying: false,
    volumeAvailable: false,
    volume: 0,
    muted: false,
    capabilities: {
      remote: false,
      playback: false,
      power: false,
      nowPlaying: false,
      volume: false,
      apps: false
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  emptyAppleTvSnapshot
});
//# sourceMappingURL=appleTv.js.map
