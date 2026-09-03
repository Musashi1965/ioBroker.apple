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
var objectDefinitions_exports = {};
__export(objectDefinitions_exports, {
  APPLE_TV_COMMANDS: () => APPLE_TV_COMMANDS,
  HOME_POD_PLAYBACK_COMMANDS: () => HOME_POD_PLAYBACK_COMMANDS,
  NAVIGATION_COMMANDS: () => NAVIGATION_COMMANDS,
  PLAYBACK_COMMANDS: () => PLAYBACK_COMMANDS,
  POWER_COMMANDS: () => POWER_COMMANDS,
  airPlayReceiverDisplayName: () => airPlayReceiverDisplayName,
  airPlayReceiverObjectDefinitions: () => airPlayReceiverObjectDefinitions,
  airPlayReceiverObjectId: () => airPlayReceiverObjectId,
  appEntryKeys: () => appEntryKeys,
  appleTvAppEntryObjectDefinitions: () => appleTvAppEntryObjectDefinitions,
  appleTvAppsObjectDefinitions: () => appleTvAppsObjectDefinitions,
  appleTvCommandStateId: () => appleTvCommandStateId,
  appleTvControlObjectDefinitions: () => appleTvControlObjectDefinitions,
  appleTvObjectDefinitions: () => appleTvObjectDefinitions,
  deviceDisplayName: () => deviceDisplayName,
  deviceObjectId: () => deviceObjectId,
  homePodControlObjectDefinitions: () => homePodControlObjectDefinitions,
  homePodDisplayName: () => homePodDisplayName,
  homePodObjectDefinitions: () => homePodObjectDefinitions,
  homePodObjectId: () => homePodObjectId,
  instanceObjectDefinitions: () => instanceObjectDefinitions,
  isAppEntryKey: () => isAppEntryKey
});
module.exports = __toCommonJS(objectDefinitions_exports);
var import_node_crypto = require("node:crypto");
const NAVIGATION_COMMANDS = [
  "up",
  "down",
  "left",
  "right",
  "select",
  "menu",
  "home"
];
const PLAYBACK_COMMANDS = ["playPause"];
const POWER_COMMANDS = ["powerOn", "powerOff"];
const HOME_POD_PLAYBACK_COMMANDS = [
  "play",
  "pause",
  "playPause",
  "stop",
  "next",
  "previous"
];
const APPLE_TV_COMMANDS = [
  ...NAVIGATION_COMMANDS,
  ...PLAYBACK_COMMANDS,
  ...POWER_COMMANDS
];
function instanceObjectDefinitions() {
  return [
    channel("info", "Information"),
    state("info.connection", "Device connected", booleanCommon("indicator.connected", false)),
    state("info.discoveryRunning", "Discovery running", booleanCommon("indicator.working", false)),
    state("info.lastDiscovery", "Last discovery", numberCommon("value.time", 0)),
    state("info.deviceCount", "Discovered device count", numberCommon("value", 0, { min: 0 })),
    state("info.lastError", "Last adapter error", stringCommon("text", "")),
    folder("devices", "Devices"),
    folder("devices.appletv", "Apple TV"),
    channel("devices.appletv.info", "Information"),
    state("devices.appletv.info.deviceCount", "Discovered Apple TV count", numberCommon("value", 0, { min: 0 })),
    folder("devices.homepod", "HomePod"),
    channel("devices.homepod.info", "Information"),
    state("devices.homepod.info.deviceCount", "Discovered HomePod count", numberCommon("value", 0, { min: 0 })),
    folder("devices.airplayReceiver", "AirPlay Receiver"),
    channel("devices.airplayReceiver.info", "Information"),
    state(
      "devices.airplayReceiver.info.deviceCount",
      "Discovered AirPlay receiver count",
      numberCommon("value", 0, { min: 0 })
    )
  ];
}
function appleTvObjectDefinitions(target, remoteAvailable, powerAvailable = false, playbackAvailable = remoteAvailable) {
  const root = deviceObjectId(target.deviceId);
  const definitions = [
    {
      id: root,
      object: {
        type: "device",
        common: { name: deviceDisplayName(target.name) },
        native: { deviceId: target.deviceId, deviceType: "appletv" }
      }
    },
    channel(`${root}.info`, "Information"),
    state(`${root}.info.name`, "Display name", stringCommon("info.name", "")),
    state(`${root}.info.type`, "Device type", stringCommon("info.type", "appletv")),
    state(`${root}.info.model`, "Hardware model", stringCommon("info.hardware", "")),
    state(`${root}.info.paired`, "Paired", booleanCommon("indicator", false)),
    state(`${root}.info.lastSeen`, "Last seen", numberCommon("value.time", 0)),
    channel(`${root}.connection`, "Connection"),
    state(`${root}.connection.state`, "Connection state", stringCommon("text", "discovered")),
    state(`${root}.connection.online`, "Online", booleanCommon("indicator.connected", false)),
    state(`${root}.connection.airplay`, "AirPlay connected", booleanCommon("indicator.connected", false)),
    state(`${root}.connection.companion`, "Companion Link connected", booleanCommon("indicator.connected", false)),
    state(`${root}.connection.raopAvailable`, "RAOP discovered", booleanCommon("indicator", false)),
    state(`${root}.connection.lastError`, "Connection error", stringCommon("text", "")),
    channel(`${root}.capabilities`, "Capabilities"),
    state(`${root}.capabilities.remote`, "Remote control", booleanCommon("indicator", false)),
    state(`${root}.capabilities.playback`, "Playback control", booleanCommon("indicator", false)),
    state(`${root}.capabilities.power`, "Power state", booleanCommon("indicator", false)),
    state(`${root}.capabilities.nowPlaying`, "Now Playing", booleanCommon("indicator", false)),
    state(`${root}.capabilities.volume`, "Volume state", booleanCommon("indicator", false)),
    state(`${root}.capabilities.apps`, "App catalog and launch", booleanCommon("indicator", false)),
    channel(`${root}.power`, "Power"),
    state(`${root}.power.state`, "Power state", stringCommon("text", "unknown")),
    channel(`${root}.nowPlaying`, "Now Playing"),
    state(`${root}.nowPlaying.title`, "Title", stringCommon("media.title", "")),
    state(`${root}.nowPlaying.artist`, "Artist", stringCommon("media.artist", "")),
    state(`${root}.nowPlaying.album`, "Album", stringCommon("media.album", "")),
    state(`${root}.nowPlaying.app`, "Active app", stringCommon("text", "")),
    state(`${root}.nowPlaying.bundleId`, "Active app bundle ID", stringCommon("text", "")),
    state(`${root}.nowPlaying.duration`, "Duration", numberCommon("value.interval", 0, { min: 0, unit: "s" })),
    state(`${root}.nowPlaying.position`, "Position", numberCommon("value.interval", 0, { min: 0, unit: "s" })),
    state(`${root}.nowPlaying.isPlaying`, "Playing", booleanCommon("media.state", false)),
    channel(`${root}.volume`, "Volume"),
    state(`${root}.volume.available`, "Volume available", booleanCommon("indicator", false)),
    state(`${root}.volume.level`, "Volume", numberCommon("level.volume", 0, { min: 0, max: 100, unit: "%" })),
    state(`${root}.volume.muted`, "Muted", booleanCommon("media.mute", false)),
    channel(`${root}.apps`, "Apps"),
    state(`${root}.apps.count`, "Launchable app count", numberCommon("value", 0, { min: 0 })),
    state(`${root}.apps.lastRefresh`, "App catalog refreshed at", numberCommon("value.time", 0)),
    state(`${root}.apps.refreshStatus`, "App catalog refresh status", stringCommon("text", "idle")),
    state(`${root}.apps.lastError`, "App catalog error", stringCommon("text", "")),
    state(`${root}.apps.available`, "Launchable app catalog", stringCommon("json", "[]")),
    channel(`${root}.apps.entries`, "Launchable apps"),
    channel(`${root}.lastCommand`, "Last command"),
    state(`${root}.lastCommand.name`, "Command name", stringCommon("text", "")),
    state(`${root}.lastCommand.target`, "Command target", stringCommon("text", "")),
    state(`${root}.lastCommand.status`, "Command status", stringCommon("text", "idle")),
    state(`${root}.lastCommand.error`, "Command error", stringCommon("text", "")),
    state(`${root}.lastCommand.completedAt`, "Command completed at", numberCommon("value.time", 0))
  ];
  if (remoteAvailable || playbackAvailable || powerAvailable) {
    definitions.push(
      ...appleTvControlObjectDefinitions(target.deviceId, remoteAvailable, playbackAvailable, powerAvailable)
    );
  }
  return definitions;
}
function airPlayReceiverObjectDefinitions(target) {
  const root = airPlayReceiverObjectId(target.deviceId);
  return [
    {
      id: root,
      object: {
        type: "device",
        common: { name: airPlayReceiverDisplayName(target.name) },
        native: { deviceId: target.deviceId, deviceType: "airplayReceiver" }
      }
    },
    channel(`${root}.info`, "Information"),
    state(`${root}.info.name`, "Display name", stringCommon("info.name", "")),
    state(`${root}.info.type`, "Device type", stringCommon("info.type", "airplayReceiver")),
    state(`${root}.info.model`, "Hardware model", stringCommon("info.hardware", "")),
    state(`${root}.info.deviceId`, "Stable protocol device ID", stringCommon("text", "")),
    state(`${root}.info.lastSeen`, "Last seen", numberCommon("value.time", 0)),
    channel(`${root}.discovery`, "Discovery"),
    state(`${root}.discovery.available`, "Present in latest successful scan", booleanCommon("indicator", false)),
    channel(`${root}.services`, "Advertised services"),
    state(`${root}.services.airplay`, "AirPlay advertised", booleanCommon("indicator", false)),
    state(`${root}.services.raop`, "RAOP advertised", booleanCommon("indicator", false))
  ];
}
function homePodObjectDefinitions(target) {
  const root = homePodObjectId(target.deviceId);
  return [
    {
      id: root,
      object: {
        type: "device",
        common: { name: homePodDisplayName(target.name) },
        native: { deviceId: target.deviceId, deviceType: "homepod" }
      }
    },
    channel(`${root}.info`, "Information"),
    state(`${root}.info.name`, "Display name", stringCommon("info.name", "")),
    state(`${root}.info.type`, "Device type", stringCommon("info.type", "homepod")),
    state(`${root}.info.model`, "Hardware model", stringCommon("info.hardware", "")),
    state(`${root}.info.deviceId`, "Stable protocol device ID", stringCommon("text", "")),
    state(`${root}.info.lastSeen`, "Last seen", numberCommon("value.time", 0)),
    channel(`${root}.discovery`, "Discovery"),
    state(`${root}.discovery.available`, "Present in latest successful scan", booleanCommon("indicator", false)),
    channel(`${root}.services`, "Advertised services"),
    state(`${root}.services.airplay`, "AirPlay advertised", booleanCommon("indicator", false)),
    state(`${root}.services.raop`, "RAOP advertised", booleanCommon("indicator", false)),
    channel(`${root}.connection`, "Connection"),
    state(`${root}.connection.state`, "Connection state", stringCommon("text", "unavailable")),
    state(`${root}.connection.online`, "Online", booleanCommon("indicator.connected", false)),
    state(`${root}.connection.lastError`, "Connection error", stringCommon("text", "")),
    channel(`${root}.pairing`, "Pairing"),
    state(`${root}.pairing.mode`, "Pairing mode", stringCommon("text", "transient")),
    state(`${root}.pairing.status`, "Pairing status", stringCommon("text", "idle")),
    channel(`${root}.capabilities`, "Capabilities"),
    state(`${root}.capabilities.playback`, "Playback control", booleanCommon("indicator", false)),
    state(`${root}.capabilities.nowPlaying`, "Now Playing", booleanCommon("indicator", false)),
    state(`${root}.capabilities.volume`, "Volume control", booleanCommon("indicator", false)),
    channel(`${root}.nowPlaying`, "Now Playing"),
    state(`${root}.nowPlaying.title`, "Title", stringCommon("media.title", "")),
    state(`${root}.nowPlaying.artist`, "Artist", stringCommon("media.artist", "")),
    state(`${root}.nowPlaying.album`, "Album", stringCommon("media.album", "")),
    state(`${root}.nowPlaying.duration`, "Duration", numberCommon("value.interval", 0, { min: 0, unit: "s" })),
    state(`${root}.nowPlaying.position`, "Position", numberCommon("value.interval", 0, { min: 0, unit: "s" })),
    state(`${root}.nowPlaying.isPlaying`, "Playing", booleanCommon("media.state", false)),
    channel(`${root}.volume`, "Volume"),
    state(`${root}.volume.available`, "Volume available", booleanCommon("indicator", false)),
    state(`${root}.volume.level`, "Volume", numberCommon("level.volume", 0, { min: 0, max: 100, unit: "%" })),
    state(`${root}.volume.muted`, "Muted", booleanCommon("media.mute", false)),
    channel(`${root}.lastCommand`, "Last command"),
    state(`${root}.lastCommand.name`, "Command name", stringCommon("text", "")),
    state(`${root}.lastCommand.status`, "Command status", stringCommon("text", "idle")),
    state(`${root}.lastCommand.error`, "Command error", stringCommon("text", "")),
    state(`${root}.lastCommand.completedAt`, "Command completed at", numberCommon("value.time", 0))
  ];
}
function homePodControlObjectDefinitions(deviceId, playbackAvailable, volumeAvailable) {
  const root = homePodObjectId(deviceId);
  const definitions = [];
  if (playbackAvailable) {
    definitions.push(
      channel(`${root}.playback`, "Playback"),
      ...HOME_POD_PLAYBACK_COMMANDS.map(
        (command) => state(`${root}.playback.${command}`, `playback ${command}`, {
          type: "boolean",
          role: "button",
          read: false,
          write: true,
          def: false
        })
      )
    );
  }
  definitions.push(
    state(`${root}.volume.level`, "Volume", {
      type: "number",
      role: "level.volume",
      read: true,
      write: volumeAvailable,
      def: 0,
      min: 0,
      max: 100,
      unit: "%"
    }),
    state(`${root}.volume.muted`, "Muted", {
      type: "boolean",
      role: "media.mute",
      read: true,
      write: volumeAvailable,
      def: false
    })
  );
  return definitions;
}
function homePodDisplayName(name) {
  const trimmed = name.trim();
  return /^homepod(?:\b|$)/iu.test(trimmed) ? trimmed : `HomePod ${trimmed}`;
}
function airPlayReceiverDisplayName(name) {
  const trimmed = name.trim();
  return /^airplay\s+receiver(?:\b|$)/iu.test(trimmed) ? trimmed : `AirPlay Receiver ${trimmed}`;
}
function deviceDisplayName(name) {
  const trimmed = name.trim();
  return /^apple\s*tv(?:\b|$)/iu.test(trimmed) ? trimmed : `AppleTV ${trimmed}`;
}
function appleTvAppsObjectDefinitions(deviceId) {
  const root = deviceObjectId(deviceId);
  return [
    state(`${root}.apps.openurl`, "Open URL", {
      type: "string",
      role: "text",
      read: false,
      write: true,
      def: ""
    }),
    state(`${root}.apps.refresh`, "Refresh launchable apps", {
      type: "boolean",
      role: "button",
      read: false,
      write: true,
      def: false
    })
  ];
}
function appleTvAppEntryObjectDefinitions(deviceId, app, entryKey) {
  if (!isAppEntryKey(entryKey)) {
    throw new Error("invalid_app_entry_key");
  }
  const root = `${deviceObjectId(deviceId)}.apps.entries.${entryKey}`;
  return [
    channel(root, app.name),
    state(`${root}.name`, "App name", stringCommon("info.name", "")),
    state(`${root}.bundleId`, "App bundle ID", stringCommon("text", "")),
    state(`${root}.launch`, "Launch app", {
      type: "boolean",
      role: "button",
      read: false,
      write: true,
      def: false
    })
  ];
}
function appEntryKeys(apps) {
  var _a;
  const candidates = apps.map((app) => ({ app, base: appEntryBaseKey(app.name) }));
  const counts = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    counts.set(candidate.base, ((_a = counts.get(candidate.base)) != null ? _a : 0) + 1);
  }
  return new Map(
    candidates.map(({ app, base }) => [
      app.bundleId,
      counts.get(base) === 1 ? base : `${base}_${shortBundleIdHash(app.bundleId)}`
    ])
  );
}
function isAppEntryKey(value) {
  return /^[\p{L}\p{N}_-]{1,89}$/u.test(value);
}
function appEntryBaseKey(name) {
  const safe = name.normalize("NFKC").trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const bounded = [...safe].slice(0, 80).join("").replace(/_+$/g, "");
  return bounded || "App";
}
function shortBundleIdHash(bundleId) {
  return (0, import_node_crypto.createHash)("sha256").update(bundleId).digest("hex").slice(0, 8);
}
function appleTvControlObjectDefinitions(deviceId, remoteAvailable = true, playbackAvailable = true, powerAvailable = false) {
  const root = deviceObjectId(deviceId);
  const definitions = [];
  if (remoteAvailable) {
    definitions.push(
      channel(`${root}.remote`, "Remote control"),
      ...commandButtons(root, "remote", NAVIGATION_COMMANDS)
    );
  }
  if (playbackAvailable) {
    definitions.push(
      channel(`${root}.playback`, "Playback"),
      ...commandButtons(root, "playback", PLAYBACK_COMMANDS)
    );
  }
  if (powerAvailable) {
    definitions.push(...commandButtons(root, "power", POWER_COMMANDS));
  }
  return definitions;
}
function appleTvCommandStateId(deviceId, command) {
  const root = deviceObjectId(deviceId);
  if (NAVIGATION_COMMANDS.includes(command)) {
    return `${root}.remote.${command}`;
  }
  if (PLAYBACK_COMMANDS.includes(command)) {
    return `${root}.playback.${command}`;
  }
  return `${root}.power.${command}`;
}
function deviceObjectId(deviceId) {
  return `devices.appletv.${normalizedDeviceSegment(deviceId)}`;
}
function airPlayReceiverObjectId(deviceId) {
  return `devices.airplayReceiver.${normalizedDeviceSegment(deviceId)}`;
}
function homePodObjectId(deviceId) {
  return `devices.homepod.${normalizedDeviceSegment(deviceId)}`;
}
function normalizedDeviceSegment(deviceId) {
  const normalized = deviceId.replaceAll(":", "").replaceAll("-", "");
  if (!/^[0-9A-F]{12}$/i.test(normalized)) {
    throw new Error("invalid_device_id");
  }
  return normalized.toLowerCase();
}
function folder(id, name) {
  return { id, object: { type: "folder", common: { name }, native: {} } };
}
function channel(id, name) {
  return { id, object: { type: "channel", common: { name }, native: {} } };
}
function state(id, name, common) {
  return { id, object: { type: "state", common: { ...common, name }, native: {} } };
}
function commandButtons(root, channelId, commands) {
  return commands.map(
    (command) => state(`${root}.${channelId}.${command}`, `${channelId} ${command}`, {
      type: "boolean",
      role: "button",
      read: false,
      write: true,
      def: false
    })
  );
}
function booleanCommon(role, def) {
  return { type: "boolean", role, read: true, write: false, def };
}
function stringCommon(role, def) {
  return { type: "string", role, read: true, write: false, def };
}
function numberCommon(role, def, metadata = {}) {
  return { type: "number", role, read: true, write: false, def, ...metadata };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  APPLE_TV_COMMANDS,
  HOME_POD_PLAYBACK_COMMANDS,
  NAVIGATION_COMMANDS,
  PLAYBACK_COMMANDS,
  POWER_COMMANDS,
  airPlayReceiverDisplayName,
  airPlayReceiverObjectDefinitions,
  airPlayReceiverObjectId,
  appEntryKeys,
  appleTvAppEntryObjectDefinitions,
  appleTvAppsObjectDefinitions,
  appleTvCommandStateId,
  appleTvControlObjectDefinitions,
  appleTvObjectDefinitions,
  deviceDisplayName,
  deviceObjectId,
  homePodControlObjectDefinitions,
  homePodDisplayName,
  homePodObjectDefinitions,
  homePodObjectId,
  instanceObjectDefinitions,
  isAppEntryKey
});
//# sourceMappingURL=objectDefinitions.js.map
