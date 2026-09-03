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
var discoveryCorrelation_exports = {};
__export(discoveryCorrelation_exports, {
  correlateAirPlayReceivers: () => correlateAirPlayReceivers,
  correlateAppleTvs: () => correlateAppleTvs,
  correlateHomePods: () => correlateHomePods,
  summarizeAppleDiscovery: () => summarizeAppleDiscovery
});
module.exports = __toCommonJS(discoveryCorrelation_exports);
var import_node_crypto = require("node:crypto");
const EXPECTED_TYPES = {
  airplay: "_airplay._tcp.local",
  companion: "_companion-link._tcp.local",
  raop: "_raop._tcp.local"
};
const CLASS_PRIORITY = { appletv: 0, homepod: 1, airplayReceiver: 2 };
function summarizeAppleDiscovery(results) {
  const details = receiverObservationGroups(results).map(groupSummary).sort((left, right) => left.name.localeCompare(right.name) || left.identity.localeCompare(right.identity));
  const deviceDetails = {
    appletv: details.filter((device) => device.deviceClass === "appletv"),
    homepod: details.filter((device) => device.deviceClass === "homepod"),
    airplayReceiver: details.filter((device) => device.deviceClass === "airplayReceiver")
  };
  return {
    devices: correlateAppleTvs(results),
    homePods: correlateHomePods(results),
    airplayReceivers: correlateAirPlayReceivers(results),
    deviceCounts: {
      appletv: deviceDetails.appletv.length,
      homepod: deviceDetails.homepod.length,
      airplayReceiver: deviceDetails.airplayReceiver.length
    },
    deviceDetails
  };
}
function correlateHomePods(results) {
  var _a;
  const devices = /* @__PURE__ */ new Map();
  for (const group of receiverObservationGroups(results)) {
    if (groupClass(group) !== "homepod") {
      continue;
    }
    const airplayObservations = group.observations.filter((observation) => observation.protocol === "airplay");
    const deviceIds = new Set(
      airplayObservations.map((observation) => stableReceiverDeviceId("airplay", observation.service)).filter((deviceId2) => deviceId2 !== void 0)
    );
    if (deviceIds.size !== 1) {
      continue;
    }
    const deviceId = [...deviceIds][0];
    const preferred = airplayObservations.sort(
      (left, right) => left.service.fqdn.localeCompare(right.service.fqdn)
    )[0];
    if (deviceId === void 0 || preferred === void 0) {
      continue;
    }
    devices.set(deviceId, {
      deviceId,
      name: preferred.result.name || preferred.service.familyName || preferred.service.fqdn,
      model: reportedModel(preferred.service),
      airplay: preferred.service,
      raop: (_a = group.observations.find((observation) => observation.protocol === "raop")) == null ? void 0 : _a.service
    });
  }
  return [...devices.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}
function correlateAirPlayReceivers(results) {
  var _a, _b;
  const devices = /* @__PURE__ */ new Map();
  for (const group of receiverObservationGroups(results)) {
    if (groupClass(group) !== "airplayReceiver") {
      continue;
    }
    const deviceIds = new Set(
      group.observations.map((observation) => stableReceiverDeviceId(observation.protocol, observation.service)).filter((deviceId2) => deviceId2 !== void 0)
    );
    if (deviceIds.size !== 1) {
      continue;
    }
    const deviceId = [...deviceIds][0];
    if (deviceId === void 0) {
      continue;
    }
    const preferred = preferredObservation(group);
    const airplay = (_a = group.observations.find((observation) => observation.protocol === "airplay")) == null ? void 0 : _a.service;
    const raop = (_b = group.observations.find((observation) => observation.protocol === "raop")) == null ? void 0 : _b.service;
    devices.set(deviceId, receiverTarget(deviceId, preferred.result, airplay, raop));
  }
  return [...devices.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}
function correlateAppleTvs(results) {
  const companionServices = validatedServices(results, "companionLink", EXPECTED_TYPES.companion);
  const raopServices = validatedServices(results, "raop", EXPECTED_TYPES.raop);
  const devices = /* @__PURE__ */ new Map();
  for (const result of results) {
    const airplay = result.airplay;
    if (airplay === void 0 || airplay.service.type !== EXPECTED_TYPES.airplay || !/^AppleTV\d+,\d+$/i.test(reportedModel(airplay))) {
      continue;
    }
    const deviceId = normalizedHex(airplay.txt.deviceid, 12);
    if (deviceId === void 0) {
      continue;
    }
    const evidence = correlationTokens("airplay", airplay);
    const companionLink = companionServices.find(
      (service) => sharesEvidence(evidence, correlationTokens("companion", service))
    );
    const raop = raopServices.find((service) => sharesEvidence(evidence, correlationTokens("raop", service)));
    devices.set(deviceId, {
      deviceId,
      name: result.name || airplay.familyName || airplay.fqdn,
      model: reportedModel(airplay),
      airplay,
      companionLink,
      raop
    });
  }
  return [...devices.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}
function receiverServices(result) {
  var _a, _b;
  const services = [];
  if (((_a = result.airplay) == null ? void 0 : _a.service.type) === EXPECTED_TYPES.airplay) {
    services.push(["airplay", result.airplay]);
  }
  if (((_b = result.raop) == null ? void 0 : _b.service.type) === EXPECTED_TYPES.raop) {
    services.push(["raop", result.raop]);
  }
  return services;
}
function receiverObservationGroups(results) {
  const groups = [];
  for (const result of results) {
    for (const [protocol, service] of receiverServices(result)) {
      const tokens = correlationTokens(protocol, service);
      const identity = discoveryIdentity(service);
      const matches = groups.map(
        (group, index) => sharesEvidence(group.tokens, tokens) || tokens.size === 0 && group.identities.has(identity) ? index : -1
      ).filter((index) => index >= 0);
      if (matches.length === 0) {
        groups.push({
          observations: [{ result, protocol, service }],
          tokens,
          identities: /* @__PURE__ */ new Set([identity])
        });
        continue;
      }
      const primary = groups[matches[0]];
      if (primary === void 0) {
        continue;
      }
      primary.observations.push({ result, protocol, service });
      for (const token of tokens) {
        primary.tokens.add(token);
      }
      primary.identities.add(identity);
      for (const index of matches.slice(1).sort((left, right) => right - left)) {
        const merged = groups[index];
        if (merged === void 0) {
          continue;
        }
        primary.observations.push(...merged.observations);
        for (const token of merged.tokens) {
          primary.tokens.add(token);
        }
        for (const mergedIdentity of merged.identities) {
          primary.identities.add(mergedIdentity);
        }
        groups.splice(index, 1);
      }
    }
  }
  return groups;
}
function groupClass(group) {
  var _a;
  return (_a = group.observations.map((observation) => classifyModel(reportedModel(observation.service))).sort((left, right) => CLASS_PRIORITY[left] - CLASS_PRIORITY[right])[0]) != null ? _a : "airplayReceiver";
}
function preferredObservation(group) {
  const sorted = [...group.observations].sort((left, right) => {
    const classDifference = CLASS_PRIORITY[classifyModel(reportedModel(left.service))] - CLASS_PRIORITY[classifyModel(reportedModel(right.service))];
    return classDifference || (left.protocol === "airplay" ? 0 : 1) - (right.protocol === "airplay" ? 0 : 1) || left.service.fqdn.localeCompare(right.service.fqdn);
  });
  const preferred = sorted[0];
  if (preferred === void 0) {
    throw new Error("empty_receiver_group");
  }
  return preferred;
}
function groupSummary(group) {
  var _a;
  const preferred = preferredObservation(group);
  const deviceClass = groupClass(group);
  const evidence = [...group.tokens].sort((left, right) => {
    const rank = (token) => token.startsWith("device:") ? 0 : token.startsWith("public-key:") ? 1 : 2;
    return rank(left) - rank(right) || left.localeCompare(right);
  })[0];
  const identity = evidence === void 0 ? void 0 : evidence.startsWith("device:") ? evidence : opaqueEvidenceToken(evidence);
  return {
    identity: (_a = identity != null ? identity : [...group.identities].sort()[0]) != null ? _a : discoveryIdentity(preferred.service),
    deviceClass,
    name: preferred.result.name || preferred.service.familyName || preferred.service.fqdn,
    model: reportedModel(preferred.service)
  };
}
function opaqueEvidenceToken(token) {
  const separator = token.indexOf(":");
  const kind = token.slice(0, separator);
  const value = token.slice(separator + 1);
  return opaqueDiscoveryIdentity(kind === "public-key" ? "public-key" : "pairing", value);
}
function classifyModel(model) {
  return /^AppleTV\d+,\d+$/i.test(model) ? "appletv" : /^AudioAccessory\d+,\d+$/i.test(model) ? "homepod" : "airplayReceiver";
}
function stableReceiverDeviceId(protocol, service) {
  var _a;
  return protocol === "airplay" ? normalizedHex(service.txt.deviceid, 12) : normalizedHex((_a = service.id.match(/^([0-9a-f]{12})@/i)) == null ? void 0 : _a[1], 12);
}
function receiverTarget(deviceId, result, airplay, raop) {
  const preferred = airplay != null ? airplay : raop;
  return {
    deviceId,
    name: result.name || (preferred == null ? void 0 : preferred.familyName) || (preferred == null ? void 0 : preferred.fqdn) || `AirPlay Receiver \u2026${deviceId.slice(-4)}`,
    model: preferred === void 0 ? "" : reportedModel(preferred),
    airplay,
    raop
  };
}
function validatedServices(results, property, expectedType) {
  return results.map((result) => result[property]).filter(
    (service) => service !== void 0 && service.service.type === expectedType
  );
}
function correlationTokens(protocol, service) {
  var _a, _b, _c;
  const tokens = /* @__PURE__ */ new Set();
  addToken(tokens, "public-key", service.txt.pk, 64);
  if (protocol === "airplay") {
    addToken(tokens, "device", service.txt.deviceid, 12);
    addToken(tokens, "pairing", service.txt.psi, 32);
  } else if (protocol === "companion") {
    addToken(tokens, "pairing", service.txt.rpMRtID, 32);
    addToken(tokens, "device", (_b = (_a = service.txt.rpMRtID) == null ? void 0 : _a.match(/^([0-9a-f]{12})-/i)) == null ? void 0 : _b[1], 12);
  } else {
    addToken(tokens, "device", (_c = service.id.match(/^([0-9a-f]{12})@/i)) == null ? void 0 : _c[1], 12);
  }
  return tokens;
}
function addToken(tokens, kind, value, length) {
  const normalized = normalizedHex(value, length);
  if (normalized !== void 0) {
    tokens.add(`${kind}:${normalized}`);
  }
}
function sharesEvidence(left, right) {
  return [...left].some((token) => right.has(token));
}
function reportedModel(service) {
  return service.modelName || service.txt.model || service.txt.am || service.txt.rpMd || "";
}
function discoveryIdentity(service) {
  var _a, _b;
  const deviceId = (_b = normalizedHex(service.txt.deviceid, 12)) != null ? _b : normalizedHex((_a = service.id.match(/^([0-9a-f]{12})@/i)) == null ? void 0 : _a[1], 12);
  if (deviceId !== void 0) {
    return `device:${deviceId}`;
  }
  const publicKey = normalizedHex(service.txt.pk, 64);
  return publicKey === void 0 ? opaqueDiscoveryIdentity("service", service.fqdn) : opaqueDiscoveryIdentity("public-key", publicKey);
}
function opaqueDiscoveryIdentity(kind, value) {
  return `${kind}:${(0, import_node_crypto.createHash)("sha256").update(value).digest("hex").slice(0, 16)}`;
}
function normalizedHex(value, expectedLength) {
  if (value === void 0) {
    return void 0;
  }
  const normalized = value.replaceAll(/[^0-9a-f]/gi, "").toUpperCase();
  return normalized.length === expectedLength ? normalized : void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  correlateAirPlayReceivers,
  correlateAppleTvs,
  correlateHomePods,
  summarizeAppleDiscovery
});
//# sourceMappingURL=discoveryCorrelation.js.map
