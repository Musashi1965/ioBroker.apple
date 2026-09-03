import type { DiscoveryResult } from '@basmilius/apple-common' with {
	'resolution-mode': 'import',
};

import type { AppleDiscoveryService } from './discoveryTypes';

/**
 * Reconstructs the SDK discovery shape from the isolated worker transport.
 *
 * The SDK connection paths use endpoint, identity, TXT, and feature fields;
 * the parsed DNS packet is deliberately not transported across processes.
 *
 * @param service - Validated serializable service.
 * @returns SDK-internal discovery result.
 */
export function toSdkDiscoveryResult(service: AppleDiscoveryService): DiscoveryResult {
	return {
		id: service.id,
		fqdn: service.fqdn,
		address: service.address,
		modelName: service.modelName,
		familyName: service.familyName,
		service: service.service,
		packet: {},
		txt: service.txt,
		features: service.features === undefined ? undefined : BigInt(service.features),
	} as unknown as DiscoveryResult;
}
