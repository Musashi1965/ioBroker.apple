import { createHash } from 'node:crypto';

import type {
	AppleDeviceClass,
	AppleDiscoveryService,
	AppleDiscoverySnapshot,
	CombinedAppleDiscovery,
	DiscoveredAirPlayReceiver,
	DiscoveredDeviceSummary,
	DiscoveredHomePod,
	DiscoveredAppleTv,
} from './discoveryTypes';

const EXPECTED_TYPES = {
	airplay: '_airplay._tcp.local',
	companion: '_companion-link._tcp.local',
	raop: '_raop._tcp.local',
} as const;

const CLASS_PRIORITY: Record<AppleDeviceClass, number> = { appletv: 0, homepod: 1, airplayReceiver: 2 };

type ReceiverProtocol = 'airplay' | 'raop';

interface ReceiverObservation {
	result: CombinedAppleDiscovery;
	protocol: ReceiverProtocol;
	service: AppleDiscoveryService;
}

interface ReceiverObservationGroup {
	observations: ReceiverObservation[];
	tokens: Set<string>;
	identities: Set<string>;
}

/**
 * Classifies one complete scan while retaining only controllable Apple TVs.
 *
 * Classification is exclusive and ordered Apple TV, HomePod, then generic
 * AirPlay receiver. Strong protocol identifiers deduplicate services that the
 * upstream collector returns in separate combined records.
 *
 * @param results - Untrusted low-level combined discovery results.
 */
export function summarizeAppleDiscovery(results: readonly CombinedAppleDiscovery[]): AppleDiscoverySnapshot {
	const details = receiverObservationGroups(results)
		.map(groupSummary)
		.sort((left, right) => left.name.localeCompare(right.name) || left.identity.localeCompare(right.identity));
	const deviceDetails = {
		appletv: details.filter(device => device.deviceClass === 'appletv'),
		homepod: details.filter(device => device.deviceClass === 'homepod'),
		airplayReceiver: details.filter(device => device.deviceClass === 'airplayReceiver'),
	};
	return {
		devices: correlateAppleTvs(results),
		homePods: correlateHomePods(results),
		airplayReceivers: correlateAirPlayReceivers(results),
		deviceCounts: {
			appletv: deviceDetails.appletv.length,
			homepod: deviceDetails.homepod.length,
			airplayReceiver: deviceDetails.airplayReceiver.length,
		},
		deviceDetails,
	};
}

/**
 * Correlates controllable HomePods through one stable AirPlay device ID.
 *
 * A counted HomePod without a validated AirPlay service and durable device ID
 * remains visible only in the aggregate discovery inventory.
 *
 * @param results - Untrusted low-level combined discovery results.
 * @returns Deterministically ordered HomePods suitable for transient control.
 */
export function correlateHomePods(results: readonly CombinedAppleDiscovery[]): DiscoveredHomePod[] {
	const devices = new Map<string, DiscoveredHomePod>();
	for (const group of receiverObservationGroups(results)) {
		if (groupClass(group) !== 'homepod') {
			continue;
		}
		const airplayObservations = group.observations.filter(observation => observation.protocol === 'airplay');
		const deviceIds = new Set(
			airplayObservations
				.map(observation => stableReceiverDeviceId('airplay', observation.service))
				.filter((deviceId): deviceId is string => deviceId !== undefined),
		);
		if (deviceIds.size !== 1) {
			continue;
		}
		const deviceId = [...deviceIds][0];
		const preferred = airplayObservations.sort((left, right) =>
			left.service.fqdn.localeCompare(right.service.fqdn),
		)[0];
		if (deviceId === undefined || preferred === undefined) {
			continue;
		}
		devices.set(deviceId, {
			deviceId,
			name: preferred.result.name || preferred.service.familyName || preferred.service.fqdn,
			model: reportedModel(preferred.service),
			airplay: preferred.service,
			raop: group.observations.find(observation => observation.protocol === 'raop')?.service,
		});
	}
	return [...devices.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

/**
 * Correlates generic AirPlay and RAOP receiver services through durable IDs.
 *
 * Receivers without a 12-character protocol device ID remain in the aggregate
 * discovery inventory but never receive a public per-device object. Display
 * names, addresses, ports, and service FQDNs are deliberately excluded.
 *
 * @param results - Untrusted low-level combined discovery results.
 * @returns Deterministically ordered generic receivers with durable identity.
 */
export function correlateAirPlayReceivers(results: readonly CombinedAppleDiscovery[]): DiscoveredAirPlayReceiver[] {
	const devices = new Map<string, DiscoveredAirPlayReceiver>();
	for (const group of receiverObservationGroups(results)) {
		if (groupClass(group) !== 'airplayReceiver') {
			continue;
		}
		const deviceIds = new Set(
			group.observations
				.map(observation => stableReceiverDeviceId(observation.protocol, observation.service))
				.filter((deviceId): deviceId is string => deviceId !== undefined),
		);
		if (deviceIds.size !== 1) {
			continue;
		}
		const deviceId = [...deviceIds][0];
		if (deviceId === undefined) {
			continue;
		}
		const preferred = preferredObservation(group);
		const airplay = group.observations.find(observation => observation.protocol === 'airplay')?.service;
		const raop = group.observations.find(observation => observation.protocol === 'raop')?.service;
		devices.set(deviceId, receiverTarget(deviceId, preferred.result, airplay, raop));
	}

	return [...devices.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

/**
 * Correlates supported Apple TVs through protocol identity evidence only.
 *
 * @param results - Untrusted low-level combined discovery results.
 * @returns Deterministically ordered supported Apple TVs.
 */
export function correlateAppleTvs(results: readonly CombinedAppleDiscovery[]): DiscoveredAppleTv[] {
	const companionServices = validatedServices(results, 'companionLink', EXPECTED_TYPES.companion);
	const raopServices = validatedServices(results, 'raop', EXPECTED_TYPES.raop);
	const devices = new Map<string, DiscoveredAppleTv>();

	for (const result of results) {
		const airplay = result.airplay;
		if (
			airplay === undefined ||
			airplay.service.type !== EXPECTED_TYPES.airplay ||
			!/^AppleTV\d+,\d+$/i.test(reportedModel(airplay))
		) {
			continue;
		}

		const deviceId = normalizedHex(airplay.txt.deviceid, 12);
		if (deviceId === undefined) {
			continue;
		}
		const evidence = correlationTokens('airplay', airplay);
		const companionLink = companionServices.find(service =>
			sharesEvidence(evidence, correlationTokens('companion', service)),
		);
		const raop = raopServices.find(service => sharesEvidence(evidence, correlationTokens('raop', service)));
		devices.set(deviceId, {
			deviceId,
			name: result.name || airplay.familyName || airplay.fqdn,
			model: reportedModel(airplay),
			airplay,
			companionLink,
			raop,
		});
	}

	return [...devices.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

/**
 * Returns all correctly typed receiver services carried by one result.
 *
 * @param result - One untrusted combined discovery result.
 */
function receiverServices(result: CombinedAppleDiscovery): Array<readonly ['airplay' | 'raop', AppleDiscoveryService]> {
	const services: Array<readonly ['airplay' | 'raop', AppleDiscoveryService]> = [];
	if (result.airplay?.service.type === EXPECTED_TYPES.airplay) {
		services.push(['airplay', result.airplay]);
	}
	if (result.raop?.service.type === EXPECTED_TYPES.raop) {
		services.push(['raop', result.raop]);
	}
	return services;
}

/**
 * Groups AirPlay and RAOP observations by strong within-scan evidence.
 *
 * @param results - Untrusted low-level combined discovery results.
 */
function receiverObservationGroups(results: readonly CombinedAppleDiscovery[]): ReceiverObservationGroup[] {
	const groups: ReceiverObservationGroup[] = [];
	for (const result of results) {
		for (const [protocol, service] of receiverServices(result)) {
			const tokens = correlationTokens(protocol, service);
			const identity = discoveryIdentity(service);
			const matches = groups
				.map((group, index) =>
					sharesEvidence(group.tokens, tokens) || (tokens.size === 0 && group.identities.has(identity))
						? index
						: -1,
				)
				.filter(index => index >= 0);
			if (matches.length === 0) {
				groups.push({
					observations: [{ result, protocol, service }],
					tokens,
					identities: new Set([identity]),
				});
				continue;
			}
			const primary = groups[matches[0]];
			if (primary === undefined) {
				continue;
			}
			primary.observations.push({ result, protocol, service });
			for (const token of tokens) {
				primary.tokens.add(token);
			}
			primary.identities.add(identity);
			for (const index of matches.slice(1).sort((left, right) => right - left)) {
				const merged = groups[index];
				if (merged === undefined) {
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

/**
 * Selects the exclusive class of one correlated receiver observation group.
 *
 * @param group - Correlated AirPlay and RAOP observations.
 */
function groupClass(group: ReceiverObservationGroup): AppleDeviceClass {
	return (
		group.observations
			.map(observation => classifyModel(reportedModel(observation.service)))
			.sort((left, right) => CLASS_PRIORITY[left] - CLASS_PRIORITY[right])[0] ?? 'airplayReceiver'
	);
}

/**
 * Selects a deterministic display/model observation with class precedence.
 *
 * @param group - Correlated AirPlay and RAOP observations.
 */
function preferredObservation(group: ReceiverObservationGroup): ReceiverObservation {
	const sorted = [...group.observations].sort((left, right) => {
		const classDifference =
			CLASS_PRIORITY[classifyModel(reportedModel(left.service))] -
			CLASS_PRIORITY[classifyModel(reportedModel(right.service))];
		return (
			classDifference ||
			(left.protocol === 'airplay' ? 0 : 1) - (right.protocol === 'airplay' ? 0 : 1) ||
			left.service.fqdn.localeCompare(right.service.fqdn)
		);
	});
	const preferred = sorted[0];
	if (preferred === undefined) {
		throw new Error('empty_receiver_group');
	}
	return preferred;
}

/**
 * Builds the redacted Admin/count summary for one correlated group.
 *
 * @param group - Correlated AirPlay and RAOP observations.
 */
function groupSummary(group: ReceiverObservationGroup): DiscoveredDeviceSummary {
	const preferred = preferredObservation(group);
	const deviceClass = groupClass(group);
	const evidence = [...group.tokens].sort((left, right) => {
		const rank = (token: string): number =>
			token.startsWith('device:') ? 0 : token.startsWith('public-key:') ? 1 : 2;
		return rank(left) - rank(right) || left.localeCompare(right);
	})[0];
	const identity =
		evidence === undefined ? undefined : evidence.startsWith('device:') ? evidence : opaqueEvidenceToken(evidence);
	return {
		identity: identity ?? [...group.identities].sort()[0] ?? discoveryIdentity(preferred.service),
		deviceClass,
		name: preferred.result.name || preferred.service.familyName || preferred.service.fqdn,
		model: reportedModel(preferred.service),
	};
}

/**
 * Converts a non-device correlation token into an opaque Admin identity.
 *
 * @param token - Internal public-key or pairing evidence token.
 */
function opaqueEvidenceToken(token: string): string {
	const separator = token.indexOf(':');
	const kind = token.slice(0, separator);
	const value = token.slice(separator + 1);
	return opaqueDiscoveryIdentity(kind === 'public-key' ? 'public-key' : 'pairing', value);
}

/**
 * Classifies one reported model with the project-owned exclusive precedence.
 *
 * @param model - Reported hardware model or empty string.
 */
function classifyModel(model: string): AppleDeviceClass {
	return /^AppleTV\d+,\d+$/i.test(model)
		? 'appletv'
		: /^AudioAccessory\d+,\d+$/i.test(model)
			? 'homepod'
			: 'airplayReceiver';
}

/**
 * Extracts the only identifier accepted for a public generic-receiver root.
 *
 * @param protocol - Protocol owning the service observation.
 * @param service - Validated AirPlay or RAOP service.
 */
function stableReceiverDeviceId(protocol: 'airplay' | 'raop', service: AppleDiscoveryService): string | undefined {
	return protocol === 'airplay'
		? normalizedHex(service.txt.deviceid, 12)
		: normalizedHex(service.id.match(/^([0-9a-f]{12})@/i)?.[1], 12);
}

/**
 * Builds one normalized generic receiver target without network identity data.
 *
 * @param deviceId - Unambiguous normalized protocol identifier.
 * @param result - Combined result providing the preferred display name.
 * @param airplay - Optional correlated AirPlay service.
 * @param raop - Optional correlated RAOP service.
 */
function receiverTarget(
	deviceId: string,
	result: CombinedAppleDiscovery,
	airplay: AppleDiscoveryService | undefined,
	raop: AppleDiscoveryService | undefined,
): DiscoveredAirPlayReceiver {
	const preferred = airplay ?? raop;
	return {
		deviceId,
		name: result.name || preferred?.familyName || preferred?.fqdn || `AirPlay Receiver …${deviceId.slice(-4)}`,
		model: preferred === undefined ? '' : reportedModel(preferred),
		airplay,
		raop,
	};
}

/**
 * Collects only services whose actual type matches their upstream slot.
 *
 * @param results - Untrusted combined results.
 * @param property - Protocol slot.
 * @param expectedType - Required DNS-SD service type.
 * @returns Validated services.
 */
function validatedServices(
	results: readonly CombinedAppleDiscovery[],
	property: 'companionLink' | 'raop',
	expectedType: string,
): AppleDiscoveryService[] {
	return results
		.map(result => result[property])
		.filter(
			(service): service is AppleDiscoveryService =>
				service !== undefined && service.service.type === expectedType,
		);
}

/**
 * Creates opaque evidence tokens from one protocol service.
 *
 * @param protocol - Normalized protocol.
 * @param service - Validated service.
 * @returns Identity evidence used only within one scan.
 */
function correlationTokens(protocol: 'airplay' | 'companion' | 'raop', service: AppleDiscoveryService): Set<string> {
	const tokens = new Set<string>();
	addToken(tokens, 'public-key', service.txt.pk, 64);
	if (protocol === 'airplay') {
		addToken(tokens, 'device', service.txt.deviceid, 12);
		addToken(tokens, 'pairing', service.txt.psi, 32);
	} else if (protocol === 'companion') {
		addToken(tokens, 'pairing', service.txt.rpMRtID, 32);
		addToken(tokens, 'device', service.txt.rpMRtID?.match(/^([0-9a-f]{12})-/i)?.[1], 12);
	} else {
		addToken(tokens, 'device', service.id.match(/^([0-9a-f]{12})@/i)?.[1], 12);
	}
	return tokens;
}

/**
 * Adds one normalized evidence token.
 *
 * @param tokens - Token destination.
 * @param kind - Evidence namespace.
 * @param value - Raw protocol value.
 * @param length - Required hexadecimal length.
 */
function addToken(tokens: Set<string>, kind: string, value: string | undefined, length: number): void {
	const normalized = normalizedHex(value, length);
	if (normalized !== undefined) {
		tokens.add(`${kind}:${normalized}`);
	}
}

/**
 * Checks whether two services share stable identity evidence.
 *
 * @param left - First evidence set.
 * @param right - Second evidence set.
 */
function sharesEvidence(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
	return [...left].some(token => right.has(token));
}

/**
 * Selects the model property understood by the current discovery contract.
 *
 * @param service - Validated protocol service.
 */
function reportedModel(service: AppleDiscoveryService): string {
	return service.modelName || service.txt.model || service.txt.am || service.txt.rpMd || '';
}

/**
 * Builds one scan-local deduplication key without exposing network addresses.
 *
 * @param service - Validated AirPlay or RAOP service.
 */
function discoveryIdentity(service: AppleDiscoveryService): string {
	const deviceId =
		normalizedHex(service.txt.deviceid, 12) ?? normalizedHex(service.id.match(/^([0-9a-f]{12})@/i)?.[1], 12);
	if (deviceId !== undefined) {
		return `device:${deviceId}`;
	}
	const publicKey = normalizedHex(service.txt.pk, 64);
	return publicKey === undefined
		? opaqueDiscoveryIdentity('service', service.fqdn)
		: opaqueDiscoveryIdentity('public-key', publicKey);
}

/**
 * Hides private DNS-SD names and protocol keys from the Admin discovery summary.
 *
 * @param kind - Non-secret evidence category.
 * @param value - Private scan input to hash.
 */
function opaqueDiscoveryIdentity(kind: 'pairing' | 'public-key' | 'service', value: string): string {
	return `${kind}:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

/**
 * Normalizes one fixed-length hexadecimal value.
 *
 * @param value - Raw protocol value.
 * @param expectedLength - Required hexadecimal character count.
 */
function normalizedHex(value: string | undefined, expectedLength: number): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const normalized = value.replaceAll(/[^0-9a-f]/gi, '').toUpperCase();
	return normalized.length === expectedLength ? normalized : undefined;
}
