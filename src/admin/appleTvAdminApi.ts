import type { PairingStatusResult } from '../backends/apple/appleTvPairing';
import type { PairedDevice, PairingCandidate } from '../runtime/appleRuntime';

/**
 * Returns only unpaired discovery candidates and adds the fields consumed by the dynamic Admin table.
 *
 * @param candidates - Redacted runtime pairing candidates.
 */
export function pairingCandidateItems(candidates: readonly PairingCandidate[]): Array<
	PairingCandidate & {
		label: string;
		value: string;
	}
> {
	return candidates
		.filter(candidate => !candidate.paired)
		.map(candidate => ({
			...candidate,
			label: `${candidate.name} (${candidate.model})`,
			value: candidate.deviceId,
		}));
}

/**
 * Adds selector-compatible and structured fields consumed by the paired-device table.
 *
 * @param devices - Redacted paired-device summaries.
 */
export function pairedDeviceItems(devices: readonly PairedDevice[]): Array<
	PairedDevice & {
		label: string;
		value: string;
	}
> {
	return devices.map(device => ({
		...device,
		label: `${device.name}${device.model ? ` (${device.model})` : ''} — ${pairedDeviceStatus(device)}`,
		value: device.deviceId,
	}));
}

/**
 * Returns a non-secret pairing response while preserving the legacy text field.
 *
 * @param status - Current bounded pairing lifecycle state.
 */
export function pairingStatusPayload(status: PairingStatusResult): {
	text: string;
	status: PairingStatusResult['status'];
	deviceId?: string;
	pairingError?: string;
} {
	return {
		text: status.error === undefined ? status.status : `${status.status}: ${status.error}`,
		status: status.status,
		deviceId: status.deviceId,
		pairingError: status.error,
	};
}

/**
 * Returns a compact non-secret Admin status for one paired device.
 *
 * @param device - Connection, discovery, and enablement flags.
 */
export function pairedDeviceStatus(device: Pick<PairedDevice, 'connected' | 'discovered' | 'enabled'>): string {
	return !device.enabled
		? 'passive'
		: device.connected
			? 'online, active'
			: device.discovered
				? 'discovered, active'
				: 'offline, active';
}
