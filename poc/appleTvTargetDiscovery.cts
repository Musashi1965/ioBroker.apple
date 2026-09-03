import type { CombinedDiscoveryResult, DiscoveryResult } from '@basmilius/apple-common' with {
	'resolution-mode': 'import',
};

const AIRPLAY_SERVICE = '_airplay._tcp.local';
const COMPANION_SERVICE = '_companion-link._tcp.local';

export interface AppleTvTarget {
	deviceId: string;
	name: string;
	airplay: DiscoveryResult;
	companionLink?: DiscoveryResult;
}

/**
 * Runs low-level discovery and returns supported, correlated Apple TV targets.
 * @returns Deterministically ordered Apple TV targets.
 */
export async function discoverAppleTvTargets(): Promise<AppleTvTarget[]> {
	const common = await import('@basmilius/apple-common');
	return appleTvTargets(await common.Discovery.discoverAll());
}

/**
 * Finds supported Apple TVs and correlates their AirPlay and Companion services.
 * @param results - Raw combined discovery results.
 * @returns Correlated and deterministically ordered Apple TV targets.
 */
export function appleTvTargets(results: readonly CombinedDiscoveryResult[]): AppleTvTarget[] {
	const companionServices = results
		.map(result => result.companionLink)
		.filter(
			(service): service is DiscoveryResult =>
				service !== undefined && service.service.type === COMPANION_SERVICE,
		);
	const targets = new Map<string, AppleTvTarget>();

	for (const result of results) {
		const airplay = result.airplay;
		if (
			airplay === undefined ||
			airplay.service.type !== AIRPLAY_SERVICE ||
			!/^AppleTV\d+,\d+$/i.test(reportedModel(airplay))
		) {
			continue;
		}

		const deviceId = normalizedHex(airplay.txt.deviceid, 12);
		if (deviceId === undefined) {
			continue;
		}

		const pairingId = normalizedHex(airplay.txt.psi, 32);
		const companionLink = companionServices.find(service => {
			const companionPairingId = normalizedHex(service.txt.rpMRtID, 32);
			const companionDeviceId = normalizedHex(service.txt.rpMRtID?.match(/^([0-9a-f]{12})-/i)?.[1], 12);
			return companionPairingId === pairingId || companionDeviceId === deviceId;
		});
		targets.set(deviceId, { deviceId, name: result.name, airplay, companionLink });
	}

	return [...targets.values()].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

/**
 * Selects a model property understood by the current PoC.
 * @param service - Discovered protocol service.
 * @returns The reported hardware model.
 */
function reportedModel(service: DiscoveryResult): string {
	return service.modelName || service.txt.model || service.txt.am || service.txt.rpMd || '';
}

/**
 * Normalizes a protocol identifier without exposing it in output.
 * @param value - Untrusted TXT-record value.
 * @param expectedLength - Required hexadecimal character count.
 * @returns The normalized identifier or undefined when invalid.
 */
function normalizedHex(value: string | undefined, expectedLength: number): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const normalized = value.replaceAll(/[^0-9a-f]/gi, '').toUpperCase();
	return normalized.length === expectedLength ? normalized : undefined;
}
