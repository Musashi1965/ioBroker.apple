interface NamedTarget {
	readonly name: string;
}

/**
 * Selects a target by exact runtime name, then by one unique contained term.
 * @param targets - Supported targets from the current discovery pass.
 * @param requestedName - Runtime-only name or room term supplied by the operator.
 * @returns The uniquely selected target.
 */
export function selectTargetByName<T extends NamedTarget>(targets: readonly T[], requestedName: string): T {
	const query = normalizeName(requestedName);
	const exactMatches = targets.filter(target => normalizeName(target.name) === query);
	if (exactMatches.length === 1) {
		return exactMatches[0];
	}

	const containedMatches = targets.filter(target => normalizeName(target.name).includes(query));
	if (containedMatches.length !== 1) {
		throw new Error(`Requested target name did not resolve uniquely; matched ${containedMatches.length} Apple TVs`);
	}
	return containedMatches[0];
}

/**
 * Creates a deterministic case-insensitive comparison value.
 * @param value - Runtime-only display name.
 * @returns Normalized comparison value.
 */
function normalizeName(value: string): string {
	return value.normalize('NFC').trim().toLocaleLowerCase('de-DE');
}
