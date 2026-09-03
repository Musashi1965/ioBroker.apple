export const APPLE_PROTOCOLS = ['airplay', 'companion', 'raop'] as const;

export type AppleProtocol = (typeof APPLE_PROTOCOLS)[number];

/**
 * Checks whether an unknown value is one of the normalized Apple protocol identifiers.
 *
 * @param value - Value received from a protocol or configuration boundary.
 */
export function isAppleProtocol(value: unknown): value is AppleProtocol {
	return typeof value === 'string' && APPLE_PROTOCOLS.includes(value as AppleProtocol);
}
