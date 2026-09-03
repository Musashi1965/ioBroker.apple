import type { DiscoveryRecord } from './appleSdkDiscovery.cjs';

const EXPECTED_SERVICE_TYPES = {
	airplay: '_airplay._tcp.local',
	companion: '_companion-link._tcp.local',
	raop: '_raop._tcp.local',
} as const;

type Protocol = keyof typeof EXPECTED_SERVICE_TYPES;
type AppleDeviceType = 'appletv' | 'homepod' | 'homepod-mini';

export interface DiscoveryResultShape {
	id: string;
	modelName: string;
	txt: Record<string, string>;
	service: {
		port: number;
		type: string;
	};
}

export interface CombinedDiscoveryResultShape {
	airplay?: DiscoveryResultShape;
	companionLink?: DiscoveryResultShape;
	raop?: DiscoveryResultShape;
}

interface ServiceEntry {
	protocol: Protocol;
	result: DiscoveryResultShape;
	tokens: string[];
}

export interface NormalizedCandidate {
	deviceType: AppleDeviceType | 'unsupported';
	hasModelName: boolean;
	services: Record<Protocol, boolean>;
}

/**
 * Filters malformed cross-service results and correlates protocol services only
 * through stable identifiers found in their TXT records or RAOP instance name.
 * Names and addresses are deliberately not used as identity evidence.
 * @param results - Combined results returned by the upstream low-level API.
 * @returns Normalized candidates without installation-specific identifiers.
 */
export function normalizeLowLevelDiscovery(results: readonly CombinedDiscoveryResultShape[]): NormalizedCandidate[] {
	const entries = collectServiceEntries(results);
	const parents = entries.map((_, index) => index);
	const tokenOwners = new Map<string, number>();

	for (const [index, entry] of entries.entries()) {
		for (const token of entry.tokens) {
			const owner = tokenOwners.get(token);
			if (owner === undefined) {
				tokenOwners.set(token, index);
			} else {
				union(parents, index, owner);
			}
		}
	}

	const groups = new Map<number, ServiceEntry[]>();
	for (const [index, entry] of entries.entries()) {
		const root = findRoot(parents, index);
		const group = groups.get(root) ?? [];
		group.push(entry);
		groups.set(root, group);
	}

	return [...groups.values()]
		.map(createCandidate)
		.sort((left, right) => candidateSortKey(left).localeCompare(candidateSortKey(right)));
}

/**
 * Projects only device classes that belong to the current Apple-device PoC.
 * @param candidates - Privacy-safe normalized candidates.
 * @returns Records accepted by the isolated discovery runner.
 */
export function selectAppleDeviceRecords(candidates: readonly NormalizedCandidate[]): DiscoveryRecord[] {
	return candidates
		.filter((candidate): candidate is NormalizedCandidate & { deviceType: AppleDeviceType } =>
			isAppleDeviceType(candidate.deviceType),
		)
		.map(candidate => ({
			deviceType: candidate.deviceType,
			hasModelName: candidate.hasModelName,
			services: candidate.services,
		}));
}

/**
 * Collects only services whose actual DNS-SD type matches their protocol slot.
 * @param results - Untrusted combined results from the upstream collector.
 * @returns Validated and deduplicated protocol-service entries.
 */
function collectServiceEntries(results: readonly CombinedDiscoveryResultShape[]): ServiceEntry[] {
	const entries: ServiceEntry[] = [];

	for (const result of results) {
		addEntry(entries, 'airplay', result.airplay);
		addEntry(entries, 'companion', result.companionLink);
		addEntry(entries, 'raop', result.raop);
	}

	return entries;
}

/**
 * Adds one validated protocol service.
 * @param entries - Destination collection.
 * @param protocol - Protocol slot being validated.
 * @param result - Optional upstream service result.
 */
function addEntry(entries: ServiceEntry[], protocol: Protocol, result: DiscoveryResultShape | undefined): void {
	if (result === undefined || result.service.type !== EXPECTED_SERVICE_TYPES[protocol]) {
		return;
	}

	entries.push({ protocol, result, tokens: correlationTokens(protocol, result) });
}

/**
 * Returns stable, protocol-independent correlation evidence.
 * @param protocol - Protocol that produced the service.
 * @param result - Validated upstream service result.
 * @returns Opaque tokens used only inside the current normalization pass.
 */
function correlationTokens(protocol: Protocol, result: DiscoveryResultShape): string[] {
	const tokens = new Set<string>();
	const publicKey = normalizedHex(result.txt.pk, 64);
	if (publicKey !== undefined) {
		tokens.add(`public-key:${publicKey}`);
	}

	if (protocol === 'airplay') {
		addMacToken(tokens, result.txt.deviceid);
		addPairingToken(tokens, result.txt.psi);
	} else if (protocol === 'companion') {
		addPairingToken(tokens, result.txt.rpMRtID);
		addMacToken(tokens, result.txt.rpMRtID?.match(/^([0-9a-f]{12})-/i)?.[1]);
	} else {
		addMacToken(tokens, result.id.match(/^([0-9a-f]{12})@/i)?.[1]);
	}

	return [...tokens];
}

/**
 * Adds a normalized MAC-address identity token when present.
 * @param tokens - Correlation-token destination.
 * @param value - Optional identifier from protocol metadata.
 */
function addMacToken(tokens: Set<string>, value: string | undefined): void {
	const normalized = normalizedHex(value, 12);
	if (normalized !== undefined) {
		tokens.add(`device:${normalized}`);
	}
}

/**
 * Adds a normalized pairing-identity token when present.
 * @param tokens - Correlation-token destination.
 * @param value - Optional identifier from protocol metadata.
 */
function addPairingToken(tokens: Set<string>, value: string | undefined): void {
	const normalized = normalizedHex(value, 32);
	if (normalized !== undefined) {
		tokens.add(`pairing:${normalized}`);
	}
}

/**
 * Normalizes a fixed-length hexadecimal identifier.
 * @param value - Raw protocol identifier.
 * @param expectedLength - Required number of hexadecimal characters.
 * @returns Normalized identifier or undefined when malformed.
 */
function normalizedHex(value: string | undefined, expectedLength: number): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const normalized = value.replaceAll(/[^0-9a-f]/gi, '').toUpperCase();
	return normalized.length === expectedLength ? normalized : undefined;
}

/**
 * Creates a privacy-safe normalized candidate from one correlated group.
 * @param entries - Services correlated through stable evidence.
 * @returns Candidate without names, addresses, ports, or identifiers.
 */
function createCandidate(entries: readonly ServiceEntry[]): NormalizedCandidate {
	const modelName = selectModelName(entries);
	return {
		deviceType: classifyDevice(modelName),
		hasModelName: modelName.length > 0,
		services: {
			airplay: entries.some(entry => entry.protocol === 'airplay'),
			companion: entries.some(entry => entry.protocol === 'companion'),
			raop: entries.some(entry => entry.protocol === 'raop'),
		},
	};
}

/**
 * Selects the most useful model without exposing it in the normalized result.
 * @param entries - Correlated protocol services.
 * @returns Model used only for classification.
 */
function selectModelName(entries: readonly ServiceEntry[]): string {
	const models = entries.map(reportedModel).filter(model => model.length > 0);
	return models.find(model => /^(AppleTV|AudioAccessory)/i.test(model)) ?? models[0] ?? '';
}

/**
 * Selects a protocol-specific model property from one service.
 * @param entry - Validated protocol service.
 * @returns Reported model or an empty string.
 */
function reportedModel(entry: ServiceEntry): string {
	return entry.result.modelName || entry.result.txt.model || entry.result.txt.am || entry.result.txt.rpMd || '';
}

/**
 * Maps only explicitly recognized Apple media-device models.
 * @param modelName - Model identifier reported by a protocol service.
 * @returns Narrow supported device class or unsupported.
 */
function classifyDevice(modelName: string): NormalizedCandidate['deviceType'] {
	if (/^AppleTV\d+,\d+$/i.test(modelName)) {
		return 'appletv';
	}
	if (/^AudioAccessory5(?:,|$)/i.test(modelName)) {
		return 'homepod-mini';
	}
	if (/^AudioAccessory/i.test(modelName)) {
		return 'homepod';
	}
	return 'unsupported';
}

/**
 * Checks the deliberately narrow PoC device vocabulary.
 * @param value - Normalized candidate class.
 * @returns Whether the candidate belongs to the Apple-device PoC.
 */
function isAppleDeviceType(value: NormalizedCandidate['deviceType']): value is AppleDeviceType {
	return value === 'appletv' || value === 'homepod' || value === 'homepod-mini';
}

/**
 * Finds one union-find root and applies path compression.
 * @param parents - Mutable union-find parent array.
 * @param index - Entry whose root is requested.
 * @returns Root entry index.
 */
function findRoot(parents: number[], index: number): number {
	if (parents[index] !== index) {
		parents[index] = findRoot(parents, parents[index]);
	}
	return parents[index];
}

/**
 * Joins two union-find groups.
 * @param parents - Mutable union-find parent array.
 * @param left - First entry index.
 * @param right - Second entry index.
 */
function union(parents: number[], left: number, right: number): void {
	const leftRoot = findRoot(parents, left);
	const rightRoot = findRoot(parents, right);
	if (leftRoot !== rightRoot) {
		parents[rightRoot] = leftRoot;
	}
}

/**
 * Produces deterministic ordering without names, addresses, or identifiers.
 * @param candidate - Privacy-safe candidate.
 * @returns Stable sort key made only from normalized vocabulary.
 */
function candidateSortKey(candidate: NormalizedCandidate): string {
	const services = Object.entries(candidate.services)
		.filter(([, available]) => available)
		.map(([service]) => service)
		.join(',');
	return `${candidate.deviceType}:${services}`;
}
