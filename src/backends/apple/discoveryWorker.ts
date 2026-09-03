import type { CombinedDiscoveryResult, DiscoveryResult } from '@basmilius/apple-common' with {
	'resolution-mode': 'import',
};

import { summarizeAppleDiscovery } from './discoveryCorrelation';
import type { AppleDiscoveryService, CombinedAppleDiscovery } from './discoveryTypes';

/** Runs one isolated low-level mDNS scan and returns only through IPC. */
async function run(): Promise<void> {
	try {
		const common = await import('@basmilius/apple-common');
		const results = await common.Discovery.discoverAll();
		process.send?.({ type: 'result', discovery: summarizeAppleDiscovery(results.map(serializeCombinedResult)) });
	} catch {
		process.send?.({ type: 'error', code: 'discovery_failed' });
	} finally {
		process.disconnect?.();
	}
}

/**
 * Converts one upstream combined result into an IPC-safe project shape.
 *
 * @param result - Upstream combined result.
 */
function serializeCombinedResult(result: CombinedDiscoveryResult): CombinedAppleDiscovery {
	return {
		name: result.name,
		airplay: serializeService(result.airplay),
		companionLink: serializeService(result.companionLink),
		raop: serializeService(result.raop),
	};
}

/**
 * Converts one upstream service into an IPC-safe project shape.
 *
 * @param result - Optional upstream protocol service.
 */
function serializeService(result: DiscoveryResult | undefined): AppleDiscoveryService | undefined {
	if (result === undefined) {
		return undefined;
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
			type: result.service.type,
		},
		txt: result.txt,
		features: result.features?.toString(),
	};
}

if (require.main === module) {
	void run();
}
