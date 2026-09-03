# ADR 0016: Instance-Local Admin Language

- Status: accepted
- Date: 2026-09-02

## Context

The adapter configuration currently follows the ioBroker Admin language. The
maintainer needs an explicit German/English choice on the General tab without
changing `system.config` or expanding the adapter's maintained translation
scope to languages whose configuration text is incomplete.

## Decision

Add `interfaceLanguage` to native instance configuration. Accepted persisted
values are `de` and `en`; the empty upgrade default derives the initial display
from the current Admin language, using English when it is neither German nor
English.

Render a custom two-button language selector on the General tab. It loads the
selected adapter translation file, changes the JSON Config translation context,
and requests an immediate configuration-page rerender. The selection becomes
durable when the user saves the instance configuration. It does not modify the
global ioBroker system-language object and has no effect on protocol behavior,
public device states, object IDs, or runtime labels.

Only German and English are offered. The existing minimal files for other
ioBroker languages remain package fallbacks but are not selectable through this
adapter-specific control.

## Consequences

Each adapter instance can reopen its configuration in the selected language.
The original implementation used the Admin 7 JSON Config context. ADR 0017
migrates it together with all other custom components to GUI API generation 2.

`interfaceLanguage` is an additive native configuration field. Future removal,
renaming, or semantic changes require migration review as part of the public
configuration contract.

## Validation

Admin contract tests verify the custom component reference, the two accepted
values, and the absence of a global system-language write. Type checking and a
production Admin bundle build are mandatory. Visual confirmation must verify
both directions on the representative Admin 8 installation.
