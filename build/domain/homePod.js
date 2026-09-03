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
var homePod_exports = {};
__export(homePod_exports, {
  emptyHomePodSnapshot: () => emptyHomePodSnapshot
});
module.exports = __toCommonJS(homePod_exports);
function emptyHomePodSnapshot() {
  return {
    title: "",
    artist: "",
    album: "",
    duration: 0,
    position: 0,
    isPlaying: false,
    volumeAvailable: false,
    volume: 0,
    muted: false,
    capabilities: { playback: false, nowPlaying: false, volume: false }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  emptyHomePodSnapshot
});
//# sourceMappingURL=homePod.js.map
